// public/js/bcit-map-core.js
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
  const map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/streets-v12",
    center: [BCIT_BURNABY.lng, BCIT_BURNABY.lat],
    zoom: 15.3,
  });

  // Controls
  map.addControl(new mapboxgl.NavigationControl(), "top-right");
  map.addControl(new mapboxgl.FullscreenControl(), "top-right");

  // Geolocate control + track user location
  const geoControl = new mapboxgl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
  });
  map.addControl(geoControl, "top-right");

  let lastUserLocation = null;
  geoControl.on("geolocate", (e) => {
    lastUserLocation = {
      lng: e.coords.longitude,
      lat: e.coords.latitude,
    };
  });

  // Ensure map container is positioned (for overlays)
  const mapContainer = document.getElementById("map");
  if (mapContainer && getComputedStyle(mapContainer).position === "static") {
    mapContainer.style.position = "relative";
  }

  // ----------------- Shared helpers (exported to plugins) -----------------
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
    const nums = [];
    const rest = [];
    for (const l of labels) {
      const n = parseInt(String(l).trim(), 10);
      if (Number.isFinite(n)) nums.push([n, l]);
      else rest.push(l);
    }
    nums.sort((a, b) => a[0] - b[0]);
    return [...nums.map((x) => x[1]), ...rest];
  };

  const _existCache = new Map(); // url -> boolean
  const pdfExists = async (url) => {
    if (_existCache.has(url)) return _existCache.get(url);
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-7" },
        cache: "no-store",
      });

      if (!res.ok && res.status !== 206) {
        _existCache.set(url, false);
        return false;
      }

      const ct = (res.headers.get("content-type") || "").toLowerCase();
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

  // ----------------- Navigation UI + state -----------------
  let navPanel = null;
  let navFromLabelEl = null;
  let navToLabelEl = null;
  let navActive = false;

  let startMarker = null;
  let endMarker = null;

  let customStartLocation = null; // { lng, lat }
  let customStartLabel = null;    // e.g. "SW3 · 1750"
  let customStartMarker = null;

  // Helper: build clean labels like "SW3 · 1750"
  function makeRoomLabel(building, floor, room) {
    const b = String(building || "").trim();
    const f = String(floor || "").trim();
    const r = String(room || "").trim();

    // Extract pure room number if room includes building prefix (e.g. "SW3-1750")
    let pureRoom = r;
    if (b && r.startsWith(b + "-")) {
      pureRoom = r.slice(b.length + 1); // remove "SW3-"
    }

    if (b && pureRoom) return `${b} · ${pureRoom}`;
    if (b && f)        return `${b} · Floor ${f}`;
    if (b)             return b;
    if (pureRoom)      return pureRoom;

    return "Selected point";
  }

  const ensureNavPanel = () => {
    if (navPanel || !mapContainer) return;

    navPanel = document.createElement("div");
    navPanel.id = "bcit-nav-panel";
    navPanel.style.position = "absolute";
    navPanel.style.top = "10px";
    navPanel.style.left = "50%";
    navPanel.style.transform = "translateX(-50%)";
    navPanel.style.background = "white";
    navPanel.style.borderRadius = "999px";
    navPanel.style.boxShadow = "0 2px 8px rgba(0,0,0,0.25)";
    navPanel.style.padding = "6px 10px";
    navPanel.style.display = "none";
    navPanel.style.zIndex = "30";
    navPanel.style.fontFamily =
      "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
    navPanel.style.fontSize = "12px";
    navPanel.style.maxWidth = "420px";

    navPanel.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="display:flex;flex-direction:column;flex:1;overflow:hidden;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
            <div style="width:8px;height:8px;border-radius:999px;background:#3b82f6;"></div>
            <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              <span style="color:#6b7280;">From</span>
              <span id="bcit-nav-from" style="font-weight:600;margin-left:4px;"></span>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <div style="width:8px;height:8px;border-radius:999px;background:#ef4444;"></div>
            <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              <span style="color:#6b7280;">To</span>
              <span id="bcit-nav-to" style="font-weight:600;margin-left:4px;"></span>
            </div>
          </div>
        </div>
        <button
          type="button"
          id="bcit-nav-close"
          aria-label="Clear route"
          style="
            border:none;
            background:transparent;
            cursor:pointer;
            padding:4px;
            margin-left:4px;
            font-size:16px;
            line-height:1;
            color:#6b7280;
          ">
          ×
        </button>
      </div>
    `;

    mapContainer.appendChild(navPanel);

    navFromLabelEl = navPanel.querySelector("#bcit-nav-from");
    navToLabelEl = navPanel.querySelector("#bcit-nav-to");

    const closeBtn = navPanel.querySelector("#bcit-nav-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        clearNavigation();
      });
    }
  };

  const renderNavPanel = (fromLabel, toLabel) => {
    ensureNavPanel();
    if (!navPanel) return;

    if (!navActive) {
      navPanel.style.display = "none";
      return;
    }

    if (navFromLabelEl) navFromLabelEl.textContent = fromLabel || "";
    if (navToLabelEl) navToLabelEl.textContent = toLabel || "";
    navPanel.style.display = "block";
  };

  const clearNavigation = () => {
    navActive = false;

    if (startMarker) {
      startMarker.remove();
      startMarker = null;
    }
    if (endMarker) {
      endMarker.remove();
      endMarker = null;
    }

    const navSrc = map.getSource("nav-route");
    if (navSrc) {
      navSrc.setData({
        type: "FeatureCollection",
        features: [],
      });
    }

    if (navPanel) {
      navPanel.style.display = "none";
    }
    // custom start marker stays so you can reuse it
  };

  const clearCustomStart = () => {
    customStartLocation = null;
    customStartLabel = null;
    if (customStartMarker) {
      customStartMarker.remove();
      customStartMarker = null;
    }
  };

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      clearNavigation();
    }
  });

  const setRouteLine = (startLngLat, endLngLat) => {
    const navSrc = map.getSource("nav-route");
    if (!navSrc) return;
    navSrc.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [startLngLat, endLngLat],
          },
        },
      ],
    });
  };

  const setCustomStartLocation = (lng, lat, label) => {
    if (typeof lng !== "number" || typeof lat !== "number") return;
    customStartLocation = { lng, lat };
    customStartLabel = label || "Selected point";

    if (customStartMarker) {
      customStartMarker.setLngLat([lng, lat]);
    } else {
      customStartMarker = new mapboxgl.Marker({
        color: "#16a34a", // green
      })
        .setLngLat([lng, lat])
        .addTo(map);
    }
  };

  // Called from room popup: "Set as start"
  const setStartFromRoom = (payload) => {
    if (!payload) return;
    const lng =
      typeof payload.lng === "number" ? payload.lng : null;
    const lat =
      typeof payload.lat === "number" ? payload.lat : null;
    if (lng == null || lat == null) return;

    const building = (payload.building || "").trim();
    const room = (payload.room || "").trim();
    const floor = (payload.floor || "").trim();

    const label = makeRoomLabel(building, floor, room);
    setCustomStartLocation(lng, lat, label);
  };

  // Called from room popup: "Navigate here"
  const navigateToRoom = (payload) => {
    if (!payload) return;

    ensureNavPanel();

    const destLng =
      typeof payload.lng === "number" ? payload.lng : null;
    const destLat =
      typeof payload.lat === "number" ? payload.lat : null;

    if (destLng == null || destLat == null) {
      console.warn("[BCIT MAP] navigateToRoom called without lng/lat.");
      return;
    }

    // ----- Decide start point -----
    let startLngLat = null;
    let fromLabel = "";

    if (customStartLocation) {
      startLngLat = [customStartLocation.lng, customStartLocation.lat];
      fromLabel = customStartLabel || "Selected point";
    } else if (lastUserLocation) {
      startLngLat = [lastUserLocation.lng, lastUserLocation.lat];
      fromLabel = "Your location";
    } else {
      const center = map.getCenter();
      startLngLat = [center.lng, center.lat];
      fromLabel = "Map center";
    }

    const endLngLat = [destLng, destLat];

    // Build "To" label like "SW5 · 1850"
    const b = (payload.building || "").trim();
    const r = (payload.room || "").trim();
    const f = (payload.floor || "").trim();
    const toLabel = makeRoomLabel(b, f, r);

    // Clear existing route (but keep custom start marker)
    clearNavigation();

    // Start marker (blue)
    startMarker = new mapboxgl.Marker({ color: "#3b82f6" })
      .setLngLat(startLngLat)
      .addTo(map);

    // End marker (red)
    endMarker = new mapboxgl.Marker({ color: "#ef4444" })
      .setLngLat(endLngLat)
      .addTo(map);

    // Line between them
    setRouteLine(startLngLat, endLngLat);

    // Zoom to show both
    map.fitBounds([startLngLat, endLngLat], {
      padding: 120,
      maxZoom: 18,
      duration: 800,
    });

    navActive = true;
    renderNavPanel(fromLabel, toLabel);
  };



// ---------------------- Node Paths Rendering and Pathing -------------------
mappings = {
    "buildings": [
        {
            "SE2": [
              "nm1KmtC32lWvkRI0o47h"
            ],
            "SE6": [
              "nm1KmtC32lWvkRI0o47h",
              "olOybFkcL55aIoU4oPsr",
              "0FdawMKkva5iTlBdQzNV"
            ],
            "SE8": [],
            "SE9": [],
            "SE12": [
                "gKvd6XdaIiHcfr85GkUF",
                "m6biNg1zOP4LjEJggXNq",
                "8TKg5bDrGREkBUZdpOx9"
            ],
            "SE10": [
              "8ietTS5ObfoAGgphnS1J"
            ],
            "SE14": [
              "V1sdLc0eMnyteBX2sIZg",
              "AKqKqS0acPUMAOxqT9mt",
              "yIRjTdLiojB94pfR1EkL"
            ],
            "SW3": [
              "USSskvVDADEHwNi6gM1z",
              "bvxgjQTQnwcmX3Nlx5xG",
              "gmlstBCtf9yFlYVwfj6j"
            ],
            "SW5": [
              "W8FqDrl1CLrSWGcr9vKF",
              "KNaebx1eeVllD7deAFJp"
            ]
        }
    ]
}


// Toggle: true = show ALL connections, false = only show computed path
const SHOW_ALL_LINKS = true;

window.highlightPathTo = async function ({building}) {
  console.log("test from highlight path")
  console.log(building)

  // 1 get nodes for building
  possible_nodes = values = mappings["buildings"][0][building]
  console.log(possible_nodes)

  // 2 get current position OR default position if not available
  current_location = [-122.99999, 49.25097]

  // 3 from building nodes find the closest node to current position
  loadNodes(current_location, possible_nodes)

  // 4 Djikstra the optimal route

  // 5 render route
}

async function loadNodes(startCoord = null, endNodeList = []) {
  console.log("start coord: " + startCoord);
  console.log("end nodes: " + endNodeList)
  try {
    const res = await fetch("/api/nodes/data");
    if (!res.ok) throw new Error("Failed to load nodes");

    const nodes = await res.json();
    const nodeMap = new Map(); // nodeId -> [lng, lat]

    //----------------------------------------------------
    // STEP 1 — Add markers and record node positions
    //----------------------------------------------------
    nodes.forEach((node) => {
      if (node.long && node.lat) {
        const coords = [parseFloat(node.long), parseFloat(node.lat)];
        nodeMap.set(node.id, coords);

        const el = document.createElement("div");
        el.className = "marker";
        el.textContent = node.id.substring(0, 3);

        new mapboxgl.Marker(el).setLngLat(coords).addTo(map);
      }
    });

    //----------------------------------------------------
    // STEP 2 — Haversine function + Graph builder
    //----------------------------------------------------
    function haversineDistance(coord1, coord2) {
      const R = 6371e3;
      const toRad = (d) => (d * Math.PI) / 180;

      const [lng1, lat1] = coord1;
      const [lng2, lat2] = coord2;

      const φ1 = toRad(lat1);
      const φ2 = toRad(lat2);
      const Δφ = toRad(lat2 - lat1);
      const Δλ = toRad(lng2 - lng1);

      const a =
        Math.sin(Δφ / 2) ** 2 +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;

      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    const graph = new Map();

    nodes.forEach((node) => {
      if (node.connections) {
        const connections = node.connections.split(",").map((id) => id.trim());
        graph.set(node.id, []);

        const start = nodeMap.get(node.id);

        connections.forEach((connId) => {
          const end = nodeMap.get(connId);
          if (start && end) {
            const dist = haversineDistance(start, end);
            graph.get(node.id).push({ id: connId, weight: dist });
          }
        });
      }
    });

    //----------------------------------------------------
    // Determine start & end dynamically
    //----------------------------------------------------
    let startId = null;
    let endId = null;

    // 1. Find closest node to given starting long/lat
    if (startCoord) {
      console.log("userpoint: " + startCoord)

      let best = Infinity;

      nodeMap.forEach((coords, nodeId) => {
        const d = haversineDistance(coords, startCoord);
        if (d < best) {
          best = d;
          startId = nodeId;
        }
      });
    }

    // 2. Find closest node from provided destination list
    if (endNodeList.length > 0) {
      let best = Infinity;

      endNodeList.forEach((candidateId) => {
        const coords = nodeMap.get(candidateId);
        if (!coords) {
          console.log("can't get coords");
          return;
        }
        console.log("end coords" + coords)

        // If user provided startCoord, measure from that,
        // else measure from start node.
        const refPoint = startCoord

        const d = haversineDistance(coords, refPoint);
        if (d < best) {
          best = d;
          endId = candidateId;
        }
      });
    }

    // Safety
    if (!startId || !endId) {
      console.warn("Could not determine start or end node.");
      return;
    }

    console.log("Computed start:", startId);
    console.log("Computed end:", endId);

    //----------------------------------------------------
    // STEP 3 — Dijkstra
    //----------------------------------------------------
    function dijkstra(graph, startId, endId) {
      const dist = new Map();
      const prev = new Map();
      const pq = new Set(graph.keys());

      graph.forEach((_, id) => dist.set(id, Infinity));
      dist.set(startId, 0);

      while (pq.size > 0) {
        let bestNode = null;
        let bestDist = Infinity;

        for (const id of pq) {
          if (dist.get(id) < bestDist) {
            bestDist = dist.get(id);
            bestNode = id;
          }
        }

        if (!bestNode) break;
        pq.delete(bestNode);

        if (bestNode === endId) {
          const path = [];
          let cur = endId;
          while (cur) {
            path.unshift(cur);
            cur = prev.get(cur);
          }
          return path;
        }

        const neighbors = graph.get(bestNode) || [];
        neighbors.forEach(({ id: nId, weight }) => {
          const alt = dist.get(bestNode) + weight;
          if (alt < dist.get(nId)) {
            dist.set(nId, alt);
            prev.set(nId, bestNode);
          }
        });
      }

      return null;
    }

    const path = dijkstra(graph, startId, endId);
    console.log("Final path:", path);

    //----------------------------------------------------
    // STEP 4 — Draw path normally
    //----------------------------------------------------
    if (path) {
      const features = [];

      for (let i = 0; i < path.length - 1; i++) {
        const p1 = nodeMap.get(path[i]);
        const p2 = nodeMap.get(path[i + 1]);
        features.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: [p1, p2] },
        });
      }

      const pathData = { type: "FeatureCollection", features };

      if (map.getSource("highlight-path")) {
        map.getSource("highlight-path").setData(pathData);
      } else {
        map.addSource("highlight-path", { type: "geojson", data: pathData });
        map.addLayer({
          id: "highlight-path-line",
          type: "line",
          source: "highlight-path",
          paint: {
            "line-color": "#00AEEF",
            "line-width": 5,
            "line-opacity": 0.9,
          },
        });
      }
    }
  } catch (err) {
    console.error("Error loading nodes:", err);
  }
}


async function debugLoadNodes() {
  try {
    const res = await fetch("/api/nodes/data");
    if (!res.ok) throw new Error("Failed to load nodes");

    const nodes = await res.json();
    const nodeMap = new Map(); // id -> [lng, lat]

    // --- Step 1: Add markers and record positions ---
    nodes.forEach((node) => {
      if (node.long && node.lat) {
        const coords = [parseFloat(node.long), parseFloat(node.lat)];
        nodeMap.set(node.id, coords);

        const el = document.createElement("div");
        el.className = "marker";
        el.textContent = node.id.substring(0, 3); // short label

        new mapboxgl.Marker(el).setLngLat(coords).addTo(map);
      }
    });

    // --- Step 2: Build all connection line features ---
    const allLines = {
      type: "FeatureCollection",
      features: []
    };

    nodes.forEach((node) => {
      if (!node.connections) return;

      const start = nodeMap.get(node.id);
      if (!start) return;

      const connections = node.connections.split(",").map(id => id.trim());

      connections.forEach((connId) => {
        const end = nodeMap.get(connId);
        if (!end) return;

        allLines.features.push({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [start, end]
          }
        });
      });
    });

    // --- Step 3: Add lines to the map ---
    if (map.getSource("all-links")) {
      map.getSource("all-links").setData(allLines);
    } else {
      map.addSource("all-links", {
        type: "geojson",
        data: allLines
      });

      map.addLayer({
        id: "all-links-line",
        type: "line",
        source: "all-links",
        paint: {
          "line-color": "red",
          "line-width": 4,
          "line-opacity": 0.8
        }
      });
    }

  } catch (err) {
    console.error("Error loading nodes:", err);
  }
}
  // ----------------- Map load + building layers + nav route -----------------
  
  
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

    map.on("mouseenter", "buildings-fill", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "buildings-fill", () => {
      map.getCanvas().style.cursor = "";
    });

    // Highlight source/layer for selected building
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

    // Route source/layer
    if (!map.getSource("nav-route")) {
      map.addSource("nav-route", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: "nav-route-line",
        type: "line",
        source: "nav-route",
        paint: {
          "line-color": "#0ea5e9",
          "line-width": 4,
          "line-opacity": 0.9,
        },
      });
    }

    if (SHOW_ALL_LINKS) {
      debugLoadNodes();
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
      buildPopupHTML,
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

    // Run plugins (floors, search, etc.)
    const plugins = window.BCITMapPlugins || [];
    plugins.forEach((fn) => {
      try {
        fn(map, utils);
      } catch (err) {
        console.error("[BCIT MAP] Plugin error:", err);
      }
    });
  });
});




