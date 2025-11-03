// public/js/bcit-map.js
window.addEventListener("DOMContentLoaded", () => {
  if (!window.mapboxgl) {
    console.error("[BCIT MAP] Mapbox GL JS failed to load.");
    return;
  }

  const tokenMeta = document.querySelector('meta[name="mapbox-token"]');
  const tokenFromMeta = tokenMeta ? tokenMeta.content : "";
  const token = window.MAPBOX_TOKEN || tokenFromMeta || "";
  if (!token) {
    console.error("[BCIT MAP] Missing Mapbox token.");
    return;
  }

  mapboxgl.accessToken = token;

  const BCIT_BURNABY = { lng: -123, lat: 49.251 };
  const map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/streets-v12",
    center: [BCIT_BURNABY.lng, BCIT_BURNABY.lat],
    zoom: 15.3,
    pitch: 0,
    bearing: 0,
  });

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

  // Split service strings into separate lines
  const asLines = (v) => {
    if (v == null) return "";
    if (Array.isArray(v))
      return v.map((x) => String(x).trim()).filter(Boolean).join("<br>");
    const s = String(v).trim();
    if (!s) return "";
    return s
      .split(/[\n;,]/)
      .map((t) => t.trim())
      .filter(Boolean)
      .join("<br>");
  };

  const roughCenter = (geom) => {
    try {
      const coords = [];
      const collect = (g) => {
        if (!g) return;
        const t = g.type;
        if (t === "Point") coords.push(g.coordinates);
        else if (t === "MultiPoint" || t === "LineString") coords.push(...g.coordinates);
        else if (t === "MultiLineString" || t === "Polygon") g.coordinates.forEach((c) => coords.push(...c));
        else if (t === "MultiPolygon") g.coordinates.forEach((p) => p.forEach((c) => coords.push(...c)));
        else if (t === "GeometryCollection") g.geometries.forEach(collect);
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
      return [(minX + maxX) / 2, (minY + maxY) / 2];
    } catch {
      return null;
    }
  };

  const geometryBounds = (geom) => {
    try {
      const coords = [];
      const collect = (g) => {
        if (!g) return;
        const t = g.type;
        if (t === "Point") coords.push(g.coordinates);
        else if (t === "MultiPoint" || t === "LineString") coords.push(...g.coordinates);
        else if (t === "MultiLineString" || t === "Polygon") g.coordinates.forEach((c) => coords.push(...c));
        else if (t === "MultiPolygon") g.coordinates.forEach((p) => p.forEach((c) => coords.push(...c)));
        else if (t === "GeometryCollection") g.geometries.forEach(collect);
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
      return [[minX, minY],[maxX, maxY]];
    } catch {
      return null;
    }
  };

  // ----------------- Debug Toast (tiny on-map banner) -----------------
  class DebugToastControl {
    onAdd(map) {
      this._map = map;
      this._el = document.createElement("div");
      this._el.className = "mapboxgl-ctrl";
      Object.assign(this._el.style, {
        background: "rgba(17,24,39,.9)",
        color: "#fff",
        padding: "6px 10px",
        fontSize: "12px",
        borderRadius: "6px",
        margin: "10px",
        maxWidth: "60ch",
        display: "none",
      });
      return this._el;
    }
    onRemove() { this._el?.remove(); this._map = null; }
    show(msg, ms = 2000) {
      this._el.textContent = msg;
      this._el.style.display = "";
      clearTimeout(this._t);
      this._t = setTimeout(() => (this._el.style.display = "none"), ms);
    }
  }
  const debugToast = new DebugToastControl();
  map.addControl(debugToast, "top-left");

  // ----------------- Popup builder -----------------
  const buildPopupHTML = ({ title, buildingAddress, services, floorLabels }) => {
    const floorsHTML =
      floorLabels && floorLabels.length
        ? (() => {
            const mk = (label) => {
              const text = buildingAddress
                ? `${buildingAddress} Floor ${label}`
                : `Floor ${label}`;
              return `<a href="#" data-floor="${label}">${text}</a>`;
            };
            return mk(floorLabels[0]) + (floorLabels[1] ? ` &nbsp;·&nbsp; ${mk(floorLabels[1])}` : "");
          })()
        : "";

    return `
      <div class="bcit-popup" style="font-family:system-ui;width:360px">
        <h3 style="margin:0 0 .25rem 0;font-size:1.1rem;font-weight:600;">${title}</h3>
        <div style="display:flex;gap:.5rem;align-items:center;color:#2563eb;cursor:pointer;user-select:none;">
          <span data-action="zoom" style="display:inline-flex;align-items:center;gap:.35rem;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="#2563eb" stroke-width="2"/>
              <path d="M20 20l-3.2-3.2" stroke="#2563eb" stroke-width="2" stroke-linecap="round"/>
            </svg> Zoom to
          </span>
        </div>

        <div style="margin-top:.75rem;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
          <div style="display:grid;grid-template-columns:38% 62%;">
            <div style="padding:.55rem .6rem;font-weight:600;background:#f3f4f6;">Building Address</div>
            <div style="padding:.55rem .6rem;">${buildingAddress || "—"}</div>
          </div>
          <div style="display:grid;grid-template-columns:38% 62%;">
            <div style="padding:.55rem .6rem;font-weight:600;background:#f3f4f6;">Service</div>
            <div style="padding:.55rem .6rem;">${services || "—"}</div>
          </div>
          ${
            floorLabels && floorLabels.length
              ? `<div style="display:grid;grid-template-columns:38% 62%;">
                  <div style="padding:.55rem .6rem;font-weight:600;">Floor Plans</div>
                  <div style="padding:.55rem .6rem;">${floorsHTML}</div>
                </div>`
              : ""
          }
        </div>
      </div>
    `;
  };

  // ----------------- Floorplan layers -----------------
  const upsertFloorplanLayers = (data) => {
    const srcId = "floorplan";
    if (map.getSource(srcId)) map.getSource(srcId).setData(data);
    else map.addSource(srcId, { type: "geojson", data });

    if (!map.getLayer("floorplan-fill")) {
      map.addLayer({
        id: "floorplan-fill",
        type: "fill",
        source: srcId,
        paint: { "fill-color": "#ef4444", "fill-opacity": 0.25 },
      });
    }
    if (!map.getLayer("floorplan-line")) {
      map.addLayer({
        id: "floorplan-line",
        type: "line",
        source: srcId,
        paint: { "line-color": "#b91c1c", "line-width": 1.2 },
      });
    }

    try {
      if (map.getLayer("buildings-line")) {
        map.moveLayer("floorplan-fill", "buildings-line");
        map.moveLayer("floorplan-line", "floorplan-fill");
      }
    } catch {}
  };

  // ----------------- Floor Navigator (Prev / Label / Next) -----------------
  class FloorNavigatorControl {
    constructor(onSelect) {
      this._onSelect = onSelect;
      this._container = null;
      this._labelEl = null;
      this._prevBtn = null;
      this._nextBtn = null;
      this._floors = [];
      this._i = -1;
    }
    onAdd() {
      const wrap = document.createElement("div");
      wrap.className = "mapboxgl-ctrl mapboxgl-ctrl-group";
      wrap.style.display = "none";
      wrap.style.alignItems = "center";
      wrap.style.gap = "4px";

      const prev = document.createElement("button");
      prev.type = "button";
      prev.textContent = "◀";
      prev.title = "Previous floor";
      prev.onclick = () => this.go(-1);

      const label = document.createElement("span");
      label.style.padding = "0 8px";
      label.style.minWidth = "110px";
      label.style.textAlign = "center";
      label.style.fontSize = "12px";
      label.textContent = "Floor: —";

      const next = document.createElement("button");
      next.type = "button";
      next.textContent = "▶";
      next.title = "Next floor";
      next.onclick = () => this.go(+1);

      wrap.append(prev, label, next);

      this._container = wrap;
      this._labelEl = label;
      this._prevBtn = prev;
      this._nextBtn = next;
      return wrap;
    }
    onRemove() {
      this._container?.remove();
      this._container = null;
    }
    // Provide new floors (array of labels). Does NOT auto-load; caller decides which to load first.
    setFloors(floors) {
      this._floors = Array.isArray(floors) ? [...floors] : [];
      this._i = this._floors.length ? 0 : -1;
      this._render();
    }
    setActive(label) {
      const idx = this._floors.indexOf(label);
      if (idx >= 0) {
        this._i = idx;
        this._render();
      }
    }
    go(delta) {
      if (!this._floors.length) return;
      const ni = Math.min(this._floors.length - 1, Math.max(0, this._i + delta));
      if (ni !== this._i) {
        this._i = ni;
        this._render();
        this._onSelect(this._floors[this._i]);
      }
    }
    _render() {
      if (!this._container) return;
      const has = this._floors.length > 0;
      this._container.style.display = has ? "" : "none";
      if (!has) return;
      const label = this._floors[this._i] || "—";
      this._labelEl.textContent = `Floor: ${label}`;
      this._prevBtn.disabled = this._i <= 0;
      this._nextBtn.disabled = this._i >= this._floors.length - 1;
    }
  }

  // Sort floors numerically: "1","2","3",..., with non-numeric pushed to end
  const sortFloorsBottomFirst = (labels) => {
    const nums = [], rest = [];
    for (const l of labels) {
      const n = parseInt(String(l).trim(), 10);
      Number.isFinite(n) ? nums.push([n, l]) : rest.push(l);
    }
    nums.sort((a, b) => a[0] - b[0]);
    return [...nums.map(x => x[1]), ...rest];
  };

  let currentFeature = null;
  let currentFloors = {}; // { label: url }
  const floorNav = new FloorNavigatorControl(async (label) => {
    if (currentFeature && currentFloors[label]) {
      await loadFloorplan(currentFloors[label], label);
      floorNav.setActive(label);
    }
  });
  map.addControl(floorNav, "top-left");

const loadFloorplan = async (url, label) => {
  const bust = url.includes("?") ? `${url}&_=${Date.now()}` : `${url}?_=${Date.now()}`;
  debugToast.show(`Loading Floor ${label} → ${url}`);
  console.log("[BCIT MAP] loadFloorplan:", { label, url });

  try {
    const data = await getJSON(bust);
    if (!data || !data.type) throw new Error("Invalid GeoJSON payload");

    // Quick stats
    const feats = Array.isArray(data.features) ? data.features : [];
    const byType = feats.reduce((m, f) => {
      const t = f?.geometry?.type || "Unknown";
      m[t] = (m[t] || 0) + 1;
      return m;
    }, {});
    console.log("[BCIT MAP] floor stats:", { total: feats.length, byType });

    // Make edges easier to see while debugging
    upsertFloorplanLayers(data);
    if (map.getLayer("floorplan-line")) {
      map.setPaintProperty("floorplan-line", "line-width", 3); // thicker lines
    }
    if (map.getLayer("floorplan-fill")) {
      map.setPaintProperty("floorplan-fill", "fill-opacity", 0.28);
    }

    floorNav.setActive(label);
    debugToast.show(`Loaded Floor ${label} • ${feats.length} features (${Object.entries(byType).map(([k,v])=>`${k}:${v}`).join(", ")})`, 2200);
  } catch (err) {
    console.warn("[BCIT MAP] failed to load floor:", label, url, err);
    const src = map.getSource("floorplan");
    if (src) src.setData({ type: "FeatureCollection", features: [] });
    floorNav.setActive(label);
    debugToast.show(`No data for Floor ${label}`, 1800);
  }
};


  // ----------------- Load & handle clicks -----------------
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

    // Hover cursor
    map.on("mouseenter", "buildings-fill", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "buildings-fill", () => (map.getCanvas().style.cursor = ""));

    // Click handler
    map.on("click", "buildings-fill", async (e) => {
      const f = e.features?.[0];
      if (!f) return;
      currentFeature = f;
      const p = f.properties || {};

      // Quick highlight of the clicked building
      const selSrc = "building-selected";
      if (!map.getSource(selSrc)) {
        map.addSource(selSrc, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({
          id: "building-selected-line",
          type: "line",
          source: selSrc,
          paint: { "line-color": "#f59e0b", "line-width": 3 }
        });
      }
      map.getSource(selSrc).setData({ type: "FeatureCollection", features: [f] });

      const title =
        p.BuildingName || p.Display_Name || p.BldgCode || p.SiteName || p.name || "Building";

      const buildingAddress =
        p.BuildingName || p.Display_Name || p.BldgCode || p.SiteName || "";

      const services = asLines(p.Services || "");

      // Build floor map (optional)
      currentFloors = {};
      if (p.floorplans && typeof p.floorplans === "object") {
        for (const [label, url] of Object.entries(p.floorplans)) if (url) currentFloors[label] = url;
      } else if (p.BldgCode) {
        // numeric fallback — extend if you have more levels
        ["1","2","3","4","5"].forEach((num) => {
          currentFloors[num] = `/data/floorplans/${p.BldgCode}-Floor${num}.geojson`;
        });
      }
      const floorLabels = sortFloorsBottomFirst(Object.keys(currentFloors));

      // Popup
      const html = buildPopupHTML({ title, buildingAddress, services, floorLabels });
      const popup = new mapboxgl.Popup({ anchor: "top", offset: 10, maxWidth: "400px" })
        .setLngLat(e.lngLat)
        .setHTML(html)
        .addTo(map);

      // Fit to building
      const bounds = geometryBounds(f.geometry) || null;
      if (bounds) {
        map.fitBounds(bounds, { padding: 60, maxZoom: 19, duration: 800 });
      } else {
        const center = roughCenter(f.geometry);
        if (center) {
          map.flyTo({ center, zoom: 19, speed: 0.6, curve: 1.4, essential: true });
        }
      }

      // Floor navigator — start with the lowest available, not always "1"
      if (floorLabels.length) {
        const sorted = floorLabels; // already sorted lowest→highest
        const lowest = sorted[0];
        floorNav.setFloors(sorted); // no auto-load inside control
        if (lowest && currentFloors[lowest]) {
          await loadFloorplan(currentFloors[lowest], lowest);
        }
      } else {
        floorNav.setFloors([]); // hides control
        const src = map.getSource("floorplan");
        if (src) src.setData({ type: "FeatureCollection", features: [] });
      }

      // Popup actions
      const el = popup.getElement();
      el.querySelector('[data-action="zoom"]')?.addEventListener("click", () => {
        const b = geometryBounds(f.geometry);
        if (b) map.fitBounds(b, { padding: 60, maxZoom: 19, duration: 600 });
      });

      // Optional: allow clicking the “Floor Plans” links to jump directly
      el.querySelectorAll("[data-floor]").forEach((a) => {
        a.addEventListener("click", async (ev) => {
          ev.preventDefault();
          const label = a.getAttribute("data-floor");
          if (label && currentFloors[label]) {
            await loadFloorplan(currentFloors[label], label);
            floorNav.setActive(label);
          }
        });
      });
    });
  });

  // ----------------- Search -----------------
  const searchBtn = document.getElementById("searchBtn");
  const searchInput = document.getElementById("searchInput");

  function flyToBuilding(code) {
    const key = (code || "").trim().toUpperCase();
    const ix = window.__BUILDINGS_INDEX__ || {};
    if (!key) return;

    if (ix[key]) {
      map.flyTo({ center: ix[key].center, zoom: 18, speed: 0.6, curve: 1.4, essential: true });
      return;
    }

    const src = map.getSource("buildings");
    if (src && src._data && src._data.features) {
      const f = src._data.features.find((feat) => {
        const p = feat.properties || {};
        const candidates = [p.BldgCode, p.Display_Name, p.SiteName, p.name, p.code]
          .filter(Boolean).map((s) => String(s).toUpperCase());
        return candidates.includes(key);
      });
      if (f) {
        const center = roughCenter(f.geometry);
        if (center) {
          map.flyTo({ center, zoom: 18, speed: 0.6, curve: 1.4, essential: true });
        }
      }
    }
  }

  if (searchBtn) searchBtn.addEventListener("click", () => flyToBuilding(searchInput?.value));
  if (searchInput) {
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") flyToBuilding(searchInput.value);
    });
  }
});

