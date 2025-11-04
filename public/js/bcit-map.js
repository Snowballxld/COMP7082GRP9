// public/js/bcit-map.js
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
  const BCIT_BURNABY = { lng: -123, lat: 49.251 };
  const map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/streets-v12",
    center: [BCIT_BURNABY.lng, BCIT_BURNABY.lat],
    zoom: 15.3,
    pitch: 0,
    bearing: 0,
  });

  // --- Pull nodes from backend API and render markers ---
async function loadNodes() {
  try {
    const res = await fetch("/api/nodes/data");
    if (!res.ok) throw new Error("Failed to load nodes");

    const nodes = await res.json();

    // Step 1: Add node markers
    const nodeMap = new Map();
    nodes.forEach((node) => {
      if (node.long && node.lat) {
        const el = document.createElement("div");
        el.className = "marker";
        el.textContent = "O";
        new mapboxgl.Marker(el)
          .setLngLat([parseFloat(node.long), parseFloat(node.lat)])
          .addTo(map);

        nodeMap.set(node.id, [parseFloat(node.long), parseFloat(node.lat)]);
      }
    });

    // Step 2: Build GeoJSON for connections
    const connections = {
      type: "FeatureCollection",
      features: [],
    };

    nodes.forEach((node) => {
      if (node.connections) {
        nodeconnections = node.connections.split(',')
        nodeconnections.forEach((connId) => {
          const start = nodeMap.get(node.id);
          const end = nodeMap.get(connId.trim());
          if (start && end) {
            connections.features.push({
              type: "Feature",
              geometry: {
                type: "LineString",
                coordinates: [start, end],
              },
            });
          }
        });
      }
    });

    // Step 3: Add to map
    if (map.getSource("connections")) {
      map.getSource("connections").setData(connections);
    } else {
      map.addSource("connections", {
        type: "geojson",
        data: connections,
      });

      map.addLayer({
        id: "connections-line",
        type: "line",
        source: "connections",
        paint: {
          "line-color": "#FF0000",
          "line-width": 3,
        },
      });
    }
  } catch (err) {
    console.error("Error loading nodes:", err);
  }
}


  map.on("load", () => {
    loadNodes();
  });

  map.on("error", (e) => console.error("[BCIT MAP] map error:", e));

  map.addControl(new mapboxgl.NavigationControl(), "top-right");
  map.addControl(new mapboxgl.FullscreenControl(), "top-right");
  map.addControl(
    new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
    }),
    "top-right"
  );

  // ----------------- Helpers -----------------
  const getJSON = async (url) => {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    return res.json();
  };

  const asLines = (v) => {
    if (v == null) return "";
    if (Array.isArray(v))
      return v
        .map((x) => String(x).trim())
        .filter(Boolean)
        .join("<br>");
    const s = String(v).trim();
    if (!s) return "";
    return s
      .split(/[\n;,]/)
      .map((t) => t.trim())
      .filter(Boolean)
      .join("<br>");
  };

  const geometryBounds = (geom) => {
    try {
      const coords = [];
      const collect = (g) => {
        if (!g) return;
        const t = g.type;
        if (t === "Point") coords.push(g.coordinates);
        else if (t === "MultiPoint" || t === "LineString")
          coords.push(...g.coordinates);
        else if (t === "MultiLineString" || t === "Polygon")
          g.coordinates.forEach((c) => coords.push(...c));
        else if (t === "MultiPolygon")
          g.coordinates.forEach((p) => p.forEach((c) => coords.push(...c)));
        else if (t === "GeometryCollection") g.geometries.forEach(collect);
      };
      collect(geom);
      if (!coords.length) return null;
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const [x, y] of coords) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
      return [
        [minX, minY],
        [maxX, maxY],
      ];
    } catch {
      return null;
    }
  };

  const roughCenter = (geom) => {
    const b = geometryBounds(geom);
    return b ? [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2] : null;
  };

  const sortFloorsBottomFirst = (labels) => {
    const nums = [],
      rest = [];
    for (const l of labels) {
      const n = parseInt(String(l).trim(), 10);
      Number.isFinite(n) ? nums.push([n, l]) : rest.push(l);
    }
    nums.sort((a, b) => a[0] - b[0]);
    return [...nums.map((x) => x[1]), ...rest];
  };

  // ----------------- STRONG PDF existence checker -----------------
  // Some dev servers return 200 + HTML for missing files. We validate by:
  // - requesting only the first few bytes (Range header)
  // - ensuring content-type is plausible
  // - ensuring the magic bytes start with "%PDF-"
  const _existCache = new Map(); // url -> boolean
  const pdfExists = async (url) => {
    if (_existCache.has(url)) return _existCache.get(url);
    try {
      // Ask for just the first bytes; many servers will return 206 Partial Content
      const res = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-7" },
        cache: "no-store",
      });

      // Accept 200 OK (no range support) or 206 Partial Content
      if (!res.ok && res.status !== 206) {
        _existCache.set(url, false);
        return false;
      }

      const ct = (res.headers.get("content-type") || "").toLowerCase();
      // Content-Type can be octet-stream; don't strictly require 'pdf' if magic bytes are correct
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let sig = "";
      for (let i = 0; i < Math.min(5, bytes.length); i++)
        sig += String.fromCharCode(bytes[i]);

      const ok = sig === "%PDF-" || ct.includes("application/pdf");
      _existCache.set(url, ok);
      return ok;
    } catch (e) {
      _existCache.set(url, false);
      return false;
    }
  };

  const filterExistingPDFs = async (buildingName, floorLabels) => {
    const code = (buildingName || "").trim();
    if (!code) return [];
    const checks = floorLabels.map(async (label) => {
      const clean = String(label).trim();
      const url = `/data/floorplans/${code}-Floor${clean}.pdf`;
      return (await pdfExists(url)) ? { label: clean, pdfUrl: url } : null;
    });
    const results = await Promise.all(checks);
    return results.filter(Boolean);
  };

  // ----------------- Popup HTML -----------------
  const buildPopupHTML = ({ title, buildingAddress, services, floorItems }) => {
    const floorsHTML =
      floorItems && floorItems.length
        ? floorItems
            .map(
              ({ label, pdfUrl }) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:.45rem .6rem;border-top:1px solid #f1f1f1;">
          <div style="font-weight:600;">Floor ${label}</div>
          <a href="${pdfUrl}" target="_blank" rel="noopener" style="color:#2563eb;text-decoration:none;">PDF</a>
        </div>
      `
            )
            .join("")
        : `<div style="padding:.55rem .6rem;opacity:.7;">No floor plans found.</div>`;

    return `
    <div class="bcit-popup" style="font-family:system-ui;width:360px;">
      <h3 style="margin:0 0 .25rem 0;font-size:1.15rem;font-weight:600;">${title}</h3>

      <div style="margin-top:.6rem;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.04);">
        <div style="display:grid;grid-template-columns:38% 62%;border-bottom:1px solid #e5e7eb;">
          <div style="padding:.55rem .6rem;font-weight:600;background:#f9fafb;">Building</div>
          <div style="padding:.55rem .6rem;">${buildingAddress || "—"}</div>
        </div>

        <div style="display:grid;grid-template-columns:38% 62%;border-bottom:1px solid #e5e7eb;">
          <div style="padding:.55rem .6rem;font-weight:600;background:#f9fafb;">Service</div>
          <div style="padding:.55rem .6rem;">${services || "—"}</div>
        </div>

        <div>
          <div style="padding:.55rem .6rem;font-weight:600;background:#f9fafb;border-bottom:1px solid #e5e7eb;">Floor Plans</div>
          ${floorsHTML}
        </div>
      </div>
    </div>
  `;
  };

  // ----------------- Map Load -----------------
  map.on("load", async () => {
    const [buildings, buildingsIndex] = await Promise.all([
      getJSON("/data/bcit-coordinates.geojson"),
      getJSON("/data/bcit-buildings-index.json"),
    ]);

    window.__BUILDINGS_INDEX__ = buildingsIndex || {};

    map.addSource("buildings", { type: "geojson", data: buildings });
    map.addLayer({
      id: "buildings-fill",
      type: "fill",
      source: "buildings",
      paint: { "fill-color": "#93c5fd", "fill-opacity": 0.35 },
    });
    map.addLayer({
      id: "buildings-line",
      type: "line",
      source: "buildings",
      paint: { "line-color": "#2563eb", "line-width": 1.2 },
    });

    map.on(
      "mouseenter",
      "buildings-fill",
      () => (map.getCanvas().style.cursor = "pointer")
    );
    map.on(
      "mouseleave",
      "buildings-fill",
      () => (map.getCanvas().style.cursor = "")
    );

    // Highlight layer for selected building
    const selSrc = "building-selected";
    if (!map.getSource(selSrc)) {
      map.addSource(selSrc, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "building-selected-line",
        type: "line",
        source: selSrc,
        paint: { "line-color": "#f59e0b", "line-width": 3 },
      });
    }

    // Click → popup to the right (east) of building, only real PDFs listed
    map.on("click", "buildings-fill", async (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties || {};

      map
        .getSource(selSrc)
        .setData({ type: "FeatureCollection", features: [f] });

      const title =
        p.BuildingName || p.Display_Name || p.SiteName || p.name || "Building";
      const buildingAddress =
        p.BuildingName || p.Display_Name || p.SiteName || "";
      const services = asLines(p.Services || "");

      // Consider up to 1..12 floors; filter will keep only existing PDFs
      let floorLabels =
        Array.isArray(p.floorLabels) && p.floorLabels.length
          ? p.floorLabels.map(String)
          : ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
      floorLabels = sortFloorsBottomFirst(floorLabels);

      const floorItems = await filterExistingPDFs(p.BuildingName, floorLabels);
      const html = buildPopupHTML({
        title,
        buildingAddress,
        services,
        floorItems,
      });

      // Position popup to the right of the building
      const center = roughCenter(f.geometry) || e.lngLat;
      const offsetMeters = 10;
      const metersToDegrees =
        offsetMeters / (111320 * Math.cos((center[1] * Math.PI) / 180));
      const rightOfShape = [center[0] + metersToDegrees, center[1]];

      new mapboxgl.Popup({
        anchor: "left",
        offset: [10, 0],
        maxWidth: "400px",
      })
        .setLngLat(rightOfShape)
        .setHTML(html)
        .addTo(map);

      const bounds = geometryBounds(f.geometry);
      if (bounds) {
        map.fitBounds(bounds, { padding: 60, maxZoom: 19, duration: 800 });
      }
    });
  });

  // ----------------- Simple Search -----------------
  const searchBtn = document.getElementById("searchBtn");
  const searchInput = document.getElementById("searchInput");

  function flyToBuilding(code) {
    const key = (code || "").trim().toUpperCase();
    const ix = window.__BUILDINGS_INDEX__ || {};
    if (!key) return;

    if (ix[key]) {
      map.flyTo({
        center: ix[key].center,
        zoom: 18,
        speed: 0.6,
        curve: 1.4,
        essential: true,
      });
      return;
    }

    const src = map.getSource("buildings");
    const data = src && src._data;
    if (data && data.features) {
      const f = data.features.find((feat) => {
        const p = feat.properties || {};
        const candidates = [
          p.BuildingName,
          p.Display_Name,
          p.SiteName,
          p.name,
          p.BldgCode,
          p.code,
        ]
          .filter(Boolean)
          .map((s) => String(s).toUpperCase());
        return candidates.includes(key);
      });
      if (f) {
        const bounds = geometryBounds(f.geometry);
        if (bounds) {
          map.fitBounds(bounds, { padding: 60, maxZoom: 19, duration: 600 });
        }
      }
    }
  }

  if (searchBtn)
    searchBtn.addEventListener("click", () =>
      flyToBuilding(searchInput?.value)
    );
  if (searchInput) {
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") flyToBuilding(searchInput.value);
    });
  }
});


