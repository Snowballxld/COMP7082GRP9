import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";

window.addEventListener("DOMContentLoaded", () => {
  if (!window.mapboxgl) {
    console.error("[BCIT MAP] Mapbox GL JS failed to load.");
    return;
  }

  // --- Token setup ---
  const tokenMeta = document.querySelector('meta[name="mapbox-token"]');
  const tokenFromMeta = tokenMeta ? tokenMeta.content : "";
  const token = window.MAPBOX_TOKEN || tokenFromMeta || "";
  if (!token) {
    console.error("[BCIT MAP] Missing Mapbox token.");
    return;
  }
  mapboxgl.accessToken = token;

  // --- Map setup ---
  const BCIT_BURNABY = { lng: -123.001, lat: 49.251 }; // tweak if needed

  const NODE_CACHE = { nodes: null, nodeMap: null, graph: null };
  let isComputingPath = false;
  let isOverlayingIndoor = false;

  function removeLayerIfExists(id) {

    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(id)) map.removeSource(id);

  }

  function haversineDistance([lng1, lat1], [lng2, lat2]) {
    const R = 6371e3;
    const toRad = (d) => (d * Math.PI) / 180;
    const φ1 = toRad(lat1);
    const φ2 = toRad(lat2);
    const Δφ = toRad(lat2 - lat1);
    const Δλ = toRad(lng2 - lng1);
    const a =
      Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  async function initNodeGraph() {
    if (NODE_CACHE.nodes) return NODE_CACHE;

    try {
      const res = await fetch('/api/nodes/data', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load nodes');
      const nodes = await res.json();

      const nodeMap = new Map();
      const graph = new Map();

      nodes.forEach((node) => {
        if (node.long && node.lat) {
          nodeMap.set(node.id, [parseFloat(node.long), parseFloat(node.lat)]);
        }
      });

      nodes.forEach((node) => {
        const list = [];
        if (node.connections) {
          const conns = node.connections.split(',').map((s) => s.trim()).filter(Boolean);
          const start = nodeMap.get(node.id);
          conns.forEach((conn) => {
            const end = nodeMap.get(conn);
            if (start && end) list.push({ id: conn, weight: haversineDistance(start, end) });
          });
        }
        graph.set(node.id, list);
      });

      NODE_CACHE.nodes = nodes;
      NODE_CACHE.nodeMap = nodeMap;
      NODE_CACHE.graph = graph;
      console.log('[NODE GRAPH] Initialized', nodeMap.size, 'nodes');
      return NODE_CACHE;
    } catch (err) {
      console.warn('[NODE GRAPH] init failed:', err);
      throw err;
    }
  }

  const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [BCIT_BURNABY.lng, BCIT_BURNABY.lat],
    zoom: 15.3,
  });

  // Controls
  map.addControl(new mapboxgl.NavigationControl(), 'top-right');
  map.addControl(new mapboxgl.FullscreenControl(), 'top-right');

  // Geolocate control + track user location
  const geoControl = new mapboxgl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true });
  map.addControl(geoControl, 'top-right');

  let lastUserLocation = null;
  geoControl.on('geolocate', (e) => {
    lastUserLocation = { lng: e.coords.longitude, lat: e.coords.latitude };
  });

  // Ensure map container is positioned (for overlays)
  const mapContainer = document.getElementById('map');
  if (mapContainer && getComputedStyle(mapContainer).position === 'static') {
    mapContainer.style.position = 'relative';
  }

  const getJSON = async (url) => {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    return res.json();
  };

  const asLines = (v) => {
    if (v == null) return '';
    if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean).join('<br>');
    const s = String(v).trim();
    if (!s) return '';
    return s.split(/[\n;,]/).map((t) => t.trim()).filter(Boolean).join('<br>');
  };

  const geometryBounds = (geom) => {
    try {
      const coords = [];
      const collect = (g) => {
        if (!g) return;
        const t = g.type;
        if (t === 'Point') coords.push(g.coordinates);
        else if (t === 'MultiPoint' || t === 'LineString') coords.push(...g.coordinates);
        else if (t === 'MultiLineString' || t === 'Polygon') g.coordinates.forEach((c) => coords.push(...c));
        else if (t === 'MultiPolygon') g.coordinates.forEach((p) => p.forEach((c) => coords.push(...c)));
        else if (t === 'GeometryCollection') g.geometries.forEach(collect);
      };
      collect(geom);
      if (!coords.length) return null;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [x, y] of coords) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
      return [[minX, minY], [maxX, maxY]];
    } catch (e) 
    { 
      console.log(e.message);
      return null; 
    }
  };

  const roughCenter = (geom) => {
    const b = geometryBounds(geom);
    return b ? [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2] : null;
  };

  const sortFloorsBottomFirst = (labels) => {
    const nums = [], rest = [];
    for (const l of labels) {
      const n = parseInt(String(l).trim(), 10);
      if (Number.isFinite(n)) nums.push([n, l]); else rest.push(l);
    }
    nums.sort((a, b) => a[0] - b[0]);
    return [...nums.map((x) => x[1]), ...rest];
  };

  const _existCache = new Map();
  const pdfExists = async (url) => {
    if (_existCache.has(url)) return _existCache.get(url);
    try {
      const res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-7' }, cache: 'no-store' });
      if (!res.ok && res.status !== 206) { _existCache.set(url, false); return false; }
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let sig = '';
      for (let i = 0; i < Math.min(5, bytes.length); i++) sig += String.fromCharCode(bytes[i]);
      const ok = sig === '%PDF-' || ct.includes('application/pdf');
      _existCache.set(url, ok);
      return ok;
    } catch (e) 
    { 
      console.log(e.message);
      _existCache.set(url, false); 
      return false; 
    }
  };

  const filterExistingPDFs = async (buildingName, floorLabels) => {
    const code = (buildingName || '').trim();
    if (!code) return [];
    const checks = floorLabels.map(async (label) => {
      const clean = String(label).trim();
      const url = `/data/floorplans/${code}-Floor${clean}.pdf`;
      return (await pdfExists(url)) ? { label: clean, pdfUrl: url } : null;
    });
    const results = await Promise.all(checks);
    return results.filter(Boolean);
  };

  const buildPopupHTML = ({ title, buildingAddress, services, floorItems }) => {
    const floorsHTML = floorItems && floorItems.length ? floorItems.map(({ label, pdfUrl }) =>
      `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:.45rem .6rem;border-top:1px solid #f1f1f1;">
          <div style="font-weight:600;">Floor ${label}</div>
          <a href="${pdfUrl}" target="_blank" rel="noopener" style="color:#2563eb;text-decoration:none;">PDF</a>
        </div>
      `
    ).join('')
      : `<div style="padding:.55rem .6rem;opacity:.7;">No floor plans found.</div>`;

    return `
      <div class="bcit-popup" style="font-family:system-ui;width:360px;">
        
        <h3 style="margin:0 0 .25rem 0;font-size:1.15rem;font-weight:600;">${title}</h3>

        <div style="margin-top:.6rem;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.04);">
          
          <div style="display:grid;grid-template-columns:38% 62%;border-bottom:1px solid #e5e7eb;">
            <div style="padding:.55rem .6rem;font-weight:600;background:#f9fafb;">Building</div>
            <div style="padding:.55rem .6rem;">${buildingAddress || '—'}</div>
          </div>

          <div style="display:grid;grid-template-columns:38% 62%;border-bottom:1px solid #e5e7eb;">
            <div style="padding:.55rem .6rem;font-weight:600;background:#f9fafb;">Service</div>
            <div style="padding:.55rem .6rem;">${services || '—'}</div>
          </div>

          <div>
            <div style="padding:.55rem .6rem;font-weight:600;background:#f9fafb;border-bottom:1px solid #e5e7eb;">Floor Plans</div>
            ${floorsHTML}
          </div>
        </div>
      </div>
    `;
  };

  let navPanel = null;
  let navFromLabelEl = null;
  let navToLabelEl = null;
  let navActive = false;
  let startMarker = null;
  let endMarker = null;
  let customStartLocation = null;
  let customStartLabel = null;
  let customStartMarker = null;

  function makeRoomLabel(building, floor, room) {
    const b = String(building || '').trim();
    const f = String(floor || '').trim();
    const r = String(room || '').trim();
    let pureRoom = r;
    if (b && r.startsWith(b + '-')) pureRoom = r.slice(b.length + 1);
    if (b && pureRoom) return `${b} · ${pureRoom}`;
    if (b && f) return `${b} · Floor ${f}`;
    if (b) return b;
    if (pureRoom) return pureRoom;
    return 'Selected point';
  }

  const ensureNavPanel = () => {
    if (navPanel || !mapContainer) return;
    navPanel = document.createElement('div');
    navPanel.id = 'bcit-nav-panel';
    navPanel.style.position = 'absolute';
    navPanel.style.top = '10px';
    navPanel.style.left = '50%';
    navPanel.style.transform = 'translateX(-50%)';
    navPanel.style.background = 'white';
    navPanel.style.borderRadius = '999px';
    navPanel.style.boxShadow = '0 2px 8px rgba(0,0,0,0.25)';
    navPanel.style.padding = '6px 10px';
    navPanel.style.display = 'none';
    navPanel.style.zIndex = '30';
    navPanel.style.fontFamily = "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
    navPanel.style.fontSize = '12px';
    navPanel.style.maxWidth = '420px';

    navPanel.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="display:flex;flex-direction:column;flex:1;overflow:hidden;">
          
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:1px;">
            <div style="width:8px;height:8px;border-radius:999px;background:#3b82f6;"></div>
            <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              <span style="color:#6b7280;">From</span>
              <span id="bcit-nav-from" style="font-weight:600;margin-left:4px;"></span>
            </div>
          </div>
          
            <div style="display:flex;align-items:center;gap:4px;">
            <div style="width:8px;height:8px;border-radius:999px;background:#ef4444;"></div>
            <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              <span style="color:#6b7280;">To</span>
              <span id="bcit-nav-to" style="font-weight:600;margin-left:4px;"></span>
            </div>
          </div>
        </div>
        
                <button type="button" id="bcit-nav-close" aria-label="Clear route" style="border:none;background:transparent;cursor:pointer;padding:4px;margin-left:4px;font-size:16px;line-height:1;color:#6b7280;">×</button>
      </div>
    `;

    mapContainer.appendChild(navPanel);
    navFromLabelEl = navPanel.querySelector('#bcit-nav-from');
    navToLabelEl = navPanel.querySelector('#bcit-nav-to');
    const closeBtn = navPanel.querySelector('#bcit-nav-close');
    if (closeBtn) closeBtn.addEventListener('click', () => clearNavigation());
  };

  const ensurePathOverlayLayers = () => {
    try {
      if (!map.getSource('path-image-source')) {
        map.addSource('path-image-source', { type: 'image', url: '', coordinates: [[0, 0], [0, 0], [0, 0], [0, 0]] });
      }
      if (!map.getLayer('path-image-layer')) {
        map.addLayer({ id: 'path-image-layer', type: 'raster', source: 'path-image-source', paint: { 'raster-opacity': 1.0, 'raster-fade-duration': 0 } });
        if (map.getLayer('building-floor-line')) map.moveLayer('path-image-layer', 'building-floor-line');
      }
      return map.getSource('path-image-source');
    } catch (e) {
      console.warn('[PATH OVERLAY] failed to ensure overlay layers', e);
      return null;
    }
  };

  const renderNavPanel = (fromLabel, toLabel) => {
    ensureNavPanel();
    if (!navPanel) return;
    if (!navActive) { navPanel.style.display = 'none'; return; }
    if (navFromLabelEl) navFromLabelEl.textContent = fromLabel || '';
    if (navToLabelEl) navToLabelEl.textContent = toLabel || '';
    navPanel.style.display = 'block';
  };

  const clearNavigation = () => {
    navActive = false;
    if (startMarker) { startMarker.remove(); startMarker = null; }
    if (endMarker) { endMarker.remove(); endMarker = null; }

    const navSrc = map.getSource('nav-route');
    if (navSrc) navSrc.setData({ type: 'FeatureCollection', features: [] });

    if (map.getLayer('path-image-layer')) map.setLayoutProperty('path-image-layer', 'visibility', 'none');


    removeLayerIfExists('highlight-path-line');
    if (map.getSource('highlight-path')) map.removeSource('highlight-path');

    if (navPanel) navPanel.style.display = 'none';
  };

  const clearCustomStart = () => { customStartLocation = null; customStartLabel = null; if (customStartMarker) { customStartMarker.remove(); customStartMarker = null; } };
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') clearNavigation(); });

  // const setRouteLine = (startLngLat, endLngLat) => {
  //   const navSrc = map.getSource('nav-route');
  //   if (!navSrc) return;
  //   navSrc.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [startLngLat, endLngLat] } }] });
  // };

  const setCustomStartLocation = (lng, lat, label) => {
    if (typeof lng !== 'number' || typeof lat !== 'number') return;
    customStartLocation = { lng, lat };
    customStartLabel = label || 'Selected point';
    if (customStartMarker) customStartMarker.setLngLat([lng, lat]);
    else customStartMarker = new mapboxgl.Marker({ color: '#16a34a' }).setLngLat([lng, lat]).addTo(map);
  };

  const setStartFromRoom = (payload) => { if (!payload) return; const lng = typeof payload.lng === 'number' ? payload.lng : null; const lat = typeof payload.lat === 'number' ? payload.lat : null; if (lng == null || lat == null) return; const label = makeRoomLabel((payload.building || '').trim(), (payload.floor || '').trim(), (payload.room || '').trim()); setCustomStartLocation(lng, lat, label); };

  const FLOOR_BOUNDS = {
    SW03: {
      '1': [[-123.00350, 49.25016], [-123.00180, 49.25015], [-123.00180, 49.24971], [-123.00350, 49.24972]],
      '2': [[-123.00350, 49.25016], [-123.00180, 49.25015], [-123.00180, 49.24971], [-123.00350, 49.24972]]
    },
    SW05: {
      '1': [[-123.00287, 49.24988], [-123.00243, 49.24988], [-123.00242, 49.24962], [-123.00286, 49.24961]],
      '2': [[-123.00287, 49.24988], [-123.00243, 49.24988], [-123.00242, 49.24962], [-123.00286, 49.24961]]
    }
  };

  const overlayTransparentPath = (buildingCode, floorLabel) => {
    const code = buildingCode.toUpperCase().slice(0, 2) + '0' + buildingCode.toUpperCase().slice(2);
    const floor = String(floorLabel).trim();
    const bounds = FLOOR_BOUNDS[code]?.[floor];

    if (map.getLayer('path-image-layer')) map.setLayoutProperty('path-image-layer', 'visibility', 'none');

    if (!bounds) {
      console.warn('No bounds for', code, floor);
      return;
    }

    const pathImageUrl = `/images/${code.toLowerCase()}_floor${floor}_path.png`;
    const src = ensurePathOverlayLayers();
    if (!src) {
      console.error('path-image-source not initialized');
      return;
    }

    try { src.setCoordinates(bounds); } catch (e) { console.warn('setCoordinates failed', e); }
    try { src.updateImage({ url: pathImageUrl }); } catch (e) { console.warn('updateImage failed', e); }
    try { map.setLayoutProperty('path-image-layer', 'visibility', 'visible'); } catch (e) { console.warn('failed to show layer', e); }
  };


  async function requestAndOverlayIndoorPath(startBuildingCode, startRoomOrEntrance, goalBuildingCode, goalRoom) {
    if (isOverlayingIndoor) {
      console.log('[INDOOR] overlay in progress, skipping');
      return;
    }
    isOverlayingIndoor = true;
    try {
      if (map.getLayer('path-image-layer')) map.setLayoutProperty('path-image-layer', 'visibility', 'none');

      const payload = {
        startBuildingCode: startBuildingCode.slice(0, 2).toLowerCase() + '0' + startBuildingCode.slice(2),
        startRoom: startRoomOrEntrance,
        goalBuildingCode: goalBuildingCode.slice(0, 2).toLowerCase() + '0' + goalBuildingCode.slice(2),
        goalRoom: goalRoom.slice(4) // assuming goalRoom format 'BXXX-####'
      };
      const response = await fetch('/find-path', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) {
        const errorText = await response.text().catch(() => null);
        throw new Error(`Server failed to find path: ${response.statusText} - ${errorText}`);
      }
      const result = await response.json();
      if (!result.success) {
        alert('Path generation failed');
        return;
      }
      const defaultGoalFloor = '1'; // Assuming a default floor to focus on
      if (window.BCITMap && typeof window.BCITMap.focusRoom === 'function')
        window.BCITMap.focusRoom({ building: goalBuildingCode.toUpperCase(), floor: defaultGoalFloor });
      overlayTransparentPath(goalBuildingCode, defaultGoalFloor);
    } catch (error) {
      console.error('[INDOOR PATH ERROR]:', error);
      alert(`Failed to calculate and display indoor path: ${error.message}`);
    } finally {
      isOverlayingIndoor = false;
    }
  }


  // Called from room popup: "Navigate here"
  const navigateToRoom = (payload) => {
    if (!payload) return;

    clearNavigation();

    ensureNavPanel();
    const destLng = typeof payload.lng === 'number' ? payload.lng : null;
    const destLat = typeof payload.lat === 'number' ? payload.lat : null;
    if (destLng == null || destLat == null) {
      console.warn("[BCIT MAP] navigateToRoom called without lng/lat.");
      return;
    }

    let startLngLat = customStartLocation
      ? [customStartLocation.lng, customStartLocation.lat]
      : lastUserLocation
        ? [lastUserLocation.lng, lastUserLocation.lat]
        : [map.getCenter().lng, map.getCenter().lat];

    let fromLabel = customStartLocation ? (customStartLabel || 'Selected point') : (lastUserLocation ? 'Your location' : 'Map center');

    const endLngLat = [destLng, destLat];
    const b = (payload.building || '').trim();
    const r = (payload.room || '').trim();
    const f = (payload.floor || '').trim();
    const toLabel = makeRoomLabel(b, f, r);

    // Add new markers
    startMarker = new mapboxgl.Marker({ color: '#3b82f6' }).setLngLat(startLngLat).addTo(map);
    endMarker = new mapboxgl.Marker({ color: '#ef4444' }).setLngLat(endLngLat).addTo(map);

    map.fitBounds([startLngLat, endLngLat], { padding: 120, maxZoom: 18, duration: 800 });
    navActive = true;
    renderNavPanel(fromLabel, toLabel);

    const goalBuildingCode = b.toUpperCase();

    // Check if the current start point is *inside* the goal building
    const startInside = customStartLabel && customStartLabel.toUpperCase().startsWith(goalBuildingCode);

    if (startInside) {
      // Indoor path only (Start is a room/point inside the destination building)
      const labelParts = customStartLabel.split(' · ');
      const startRoomArg = labelParts.length > 1 ? labelParts[1] : r;
      requestAndOverlayIndoorPath(goalBuildingCode, startRoomArg, goalBuildingCode, r);
    } else {
      // Outdoor path to building entrance + then indoor path
      window.highlightPathTo({ building: goalBuildingCode, indoorPayload: { goalBuildingCode: goalBuildingCode, goalRoom: r }, startCoord: startLngLat });
    }
  };


  const NODE_TO_ENTRANCE = { 'KNaebx1eeVllD7deAFJp': 'entranceNorth', 'W8FqDrl1CLrSWGcr9vKF': 'entranceWest', 'gmlstBCtf9yFlYVwfj6j': 'entranceWest', 'bvxgjQTQnwcmX3Nlx5xG': 'entranceEast' };

  var mappings = { buildings: [{ SE2: ['nm1KmtC32lWvkRI0o47h'], SE6: ['nm1KmtC32lWvkRI0o47h', 'olOybFkcL55aIoU4oPsr', '0FdawMKkva5iTlBdQzNV'], SE8: [], SE9: ['kG5PUBG7CkQj9rXuzOMU'], SE12: ['gKvd6XdaIiHcfr85GkUF', 'm6biNg1zOP4LjEJggXNq', '8TKg5bDrGREkBUZdpOx9'], SE10: ['8ietTS5ObfoAGgphnS1J'], SE14: ['V1sdLc0eMnyteBX2sIZg', 'AKqKqS0acPUMAOxqT9mt', 'yIRjTdLiojB94pfR1EkL'], SW3: ['USSskvVDADEHwNi6gM1z', 'bvxgjQTQnwcmX3Nlx5xG', 'gmlstBCtf9yFlYVwfj6j'], SW5: ['W8FqDrl1CLrSWGcr9vKF', 'KNaebx1eeVllD7deAFJp'] }] };

  const SHOW_ALL_LINKS = true;

  window.highlightPathTo = async function ({ building, indoorPayload, startCoord }) {
    console.log('Starting hybrid path:', building);
    const possible = mappings['buildings'][0][building] || [];
    try { await initNodeGraph(); } catch (err) { console.warn('highlightPathTo: failed to init node graph', err); }
    computePathFromGraph(startCoord || [-122.99999, 49.25097], possible, indoorPayload);
  };

  async function computePathFromGraph(startCoord, endNodeList, indoorPayload) {
    if (isComputingPath) { console.log('[PATH] already computing'); return; }
    isComputingPath = true;
    try {
      await initNodeGraph();
      const { nodeMap, graph } = NODE_CACHE;
      if (!nodeMap || !graph) { console.warn('[PATH] missing graph'); return; }

      // 1. Find closest start node
      let startId = null; let best = Infinity;
      nodeMap.forEach((coords, id) => { const d = haversineDistance(coords, startCoord); if (d < best) { best = d; startId = id; } });

      // 2. Find closest destination node (entrance)
      let endId = null; best = Infinity;
      endNodeList.forEach((candidate) => { const coords = nodeMap.get(candidate); if (!coords) return; const d = haversineDistance(coords, startCoord); if (d < best) { best = d; endId = candidate; } });

      if (!startId || !endId) { console.warn('[PATH] Could not determine start or end node.', startId, endId); return; }

      function dijkstra(startId, endId) {
        const dist = new Map(); const prev = new Map(); const pq = new Set(graph.keys()); graph.forEach((_, id) => dist.set(id, Infinity)); dist.set(startId, 0);
        while (pq.size) {
          let bestNode = null; let bestDist = Infinity;
          for (const id of pq) { const dv = dist.get(id); if (dv < bestDist) { bestDist = dv; bestNode = id; } }
          if (!bestNode) break; pq.delete(bestNode);
          if (bestNode === endId) { const path = []; let cur = endId; while (cur) { path.unshift(cur); cur = prev.get(cur); } return path; }
          const neighbors = graph.get(bestNode) || [];
          neighbors.forEach(({ id: nId, weight }) => { const alt = dist.get(bestNode) + weight; if (alt < dist.get(nId)) { dist.set(nId, alt); prev.set(nId, bestNode); } });
        }
        return null;
      }

      const path = dijkstra(startId, endId);
      console.log('[PATH] computed:', path);

      removeLayerIfExists('highlight-path-line'); if (map.getSource('highlight-path')) map.removeSource('highlight-path');

      // 4. Draw new path
      if (path && path.length > 0) {
        const features = [];
        for (let i = 0; i < path.length - 1; i++) { const p1 = NODE_CACHE.nodeMap.get(path[i]); const p2 = NODE_CACHE.nodeMap.get(path[i + 1]); features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [p1, p2] } }); }
        const pathData = { type: 'FeatureCollection', features };
        map.addSource('highlight-path', { type: 'geojson', data: pathData });
        map.addLayer({ id: 'highlight-path-line', type: 'line', source: 'highlight-path', paint: { 'line-color': '#00AEEF', 'line-width': 5, 'line-opacity': 0.9 } });

        if (indoorPayload) {
          const endNode = path[path.length - 1];
          const startEntranceLabel = NODE_TO_ENTRANCE[endNode] || ''; // Get entrance name from closest node
          try { await requestAndOverlayIndoorPath(indoorPayload.goalBuildingCode, startEntranceLabel, indoorPayload.goalBuildingCode, indoorPayload.goalRoom); } catch (err) { console.warn('Indoor overlay failed', err); }
        }
      }
    } catch (err) { console.error('[computePathFromGraph] error', err); }
    finally { isComputingPath = false; }
  }

  const app = initializeApp(window.firebaseConfig);
  const auth = getAuth(app);

  // Helper: Get current user's ID token for server requests
  async function getIdToken() {
    const user = auth.currentUser;
    if (!user) throw new Error("Not authenticated. Please log in.");
    return await user.getIdToken(/* forceRefresh */ true);
  }

  async function loadFavoriteMarkers() {
    try {
      const token = await getIdToken();
      const favRes = await fetch('/api/favorites', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (!favRes.ok) throw new Error('Failed to load favorites');
      const { favorites } = await favRes.json();
      const nodeRes = await fetch('/api/nodes/data', { cache: 'no-store' });
      const nodes = nodeRes.ok ? await nodeRes.json() : [];

      const favNodes = favorites.map(fav => {
        const node = nodes.find(n => n.id === fav.nodeId);
        if (!node) return null;
        let label = fav.label;
        if (!label && fav.addedAt?._seconds) label = new Date(fav.addedAt._seconds * 1000).toLocaleDateString();
        return { node, label };
      }).filter(Boolean);

      // Clear old markers
      if (window.favoriteMarkers) window.favoriteMarkers.forEach(m => m.remove());
      window.favoriteMarkers = [];

      // Add favorite markers
      favNodes.forEach(({ node, label }) => {
        const marker = new mapboxgl.Marker({ color: '#FFD700' }) // gold
          .setLngLat([parseFloat(node.long), parseFloat(node.lat)])
          .setPopup(new mapboxgl.Popup().setHTML(`⭐ <strong>${label}</strong><br>`))
          .addTo(map);
        window.favoriteMarkers.push(marker);

      });
    } catch (err) { console.warn('loadFavoriteMarkers failed:', err); }
  }

  // ----------------- Map load + building layers + nav route -----------------

  map.on('load', async () => {
    try {
      const [buildings, buildingsIndex] = await Promise.all([getJSON('/data/bcit-coordinates.geojson'), getJSON('/data/bcit-buildings-index.json')]);
      window.__BUILDINGS_INDEX__ = buildingsIndex || {};

      initNodeGraph().catch(err => console.warn('Failed to init graph:', err));

      map.addSource('buildings', { type: 'geojson', data: buildings });
      map.addLayer({ id: 'buildings-fill', type: 'fill', source: 'buildings', paint: { 'fill-color': '#93c5fd', 'fill-opacity': 0.35 } });
      map.addLayer({ id: 'buildings-line', type: 'line', source: 'buildings', paint: { 'line-color': '#2563eb', 'line-width': 1.2 } });

      map.on('mouseenter', 'buildings-fill', () => map.getCanvas().style.cursor = 'pointer');
      map.on('mouseleave', 'buildings-fill', () => map.getCanvas().style.cursor = '');

      // Highlight source/layer for selected building
      const selSrc = 'building-selected';
      if (!map.getSource(selSrc)) {
        map.addSource(selSrc, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({ id: 'building-selected-line', type: 'line', source: selSrc, paint: { 'line-color': '#f59e0b', 'line-width': 3 } });
      }

      if (!map.getSource('nav-route')) {
        map.addSource('nav-route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({ id: 'nav-route-line', type: 'line', source: 'nav-route', paint: { 'line-color': '#0ea5e9', 'line-width': 4, 'line-opacity': 0.9 } });
      }

      if (SHOW_ALL_LINKS) {
        loadFavoriteMarkers();
      }

      // Expose map + utils + navigation API
      const utils = {
        getJSON,
        asLines,
        geometryBounds,
        roughCenter,
        sortFloorsBottomFirst,
        pdfExists,
        filterExistingPDFs,
        buildPopupHTML
      };

      window.BCITMap = window.BCITMap || {};
      window.BCITMap.map = map;
      window.BCITMap.utils = utils;
      window.BCITMap.navigateToRoom = navigateToRoom;
      window.BCITMap.clearNavigation = clearNavigation;
      window.BCITMap.geolocateControl = geoControl;
      window.BCITMap.setCustomStartLocation = setCustomStartLocation;
      window.BCITMap.clearCustomStart = clearCustomStart;
      window.BCITMap.setStartFromRoom = setStartFromRoom;
      window.BCITMap.focusRoom = window.BCITMap.focusRoom || function () { };

      // Run plugins
      const plugins = window.BCITMapPlugins || [];
      plugins.forEach((fn) => {
        try {
          fn(map, utils);
        } catch (err) {
          console.error('[BCIT MAP] Plugin error:', err);
        }
      });
    } catch (err) {
      console.error('map.load failed:', err);
    }
  });

  map.on('click', (e) => {
    if (!navActive) return;

    // Query features in the layer that displays the calculated outdoor path or indoor overlay
    const features = map.queryRenderedFeatures(e.point, { layers: ['highlight-path-line', 'path-image-layer'] });
    if (features && features.length > 0) return; // clicked on path itself

    // Otherwise, clear navigation and hide overlay
    clearNavigation();
    try {
      if (map.getLayer('path-image-layer')) map.setLayoutProperty('path-image-layer', 'visibility', 'none');
    } catch (err) {
      console.warn('Failed to hide path-image-layer:', err);
    }
  });

});