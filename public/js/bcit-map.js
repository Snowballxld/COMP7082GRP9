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

  // --- Helpers ---
  const getJSON = async (url) => {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
    return res.json();
  };

  // Fallback rough center if an index entry is missing
  const roughCenter = (geom) => {
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
      return [(minX + maxX) / 2, (minY + maxY) / 2];
    } catch {
      return null;
    }
  };

  // --- Load data & layers ---
  map.on("load", async () => {
    try {
      // Update these paths to wherever you serve your files from
      const [buildings, buildingsIndex] = await Promise.all([
        getJSON("/data/bcit-coordinates.geojson"),
        getJSON("/data/bcit-buildings-index.json"),
      ]);

      // Make index available to the search UI
      window.__BUILDINGS_INDEX__ = buildingsIndex || {};

      // Add the buildings source (supports Polygon & MultiPolygon)
      map.addSource("buildings", { type: "geojson", data: buildings });

      // Fill + outline
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

      // Click popup with sensible title fallback
      // Click popup with sensible title fallback
      map.on("click", "buildings-fill", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties || {};
        const title =
          p.BuildingName ||
          p.Display_Name ||
          p.SiteName ||
          p.BldgCode ||
          p.name ||
          p.code ||
          "Building";
        new mapboxgl.Popup({ anchor: "bottom", offset: 8 })
          .setLngLat(e.lngLat)
          .setHTML(`<div class="popup"><strong>${title}</strong></div>`)
          .addTo(map);
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
    } catch (err) {
      console.error("[BCIT MAP] Failed to load GeoJSON/index:", err);
    }
  });

  // --- Search ---
  const searchBtn = document.getElementById("searchBtn");
  const searchInput = document.getElementById("searchInput");

  function flyToBuilding(code) {
    const key = (code || "").trim().toUpperCase();
    const ix = window.__BUILDINGS_INDEX__ || {};
    // Prefer precomputed index; if not found, try to find a feature by Display_Name as a fallback
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

    // Fallback: scan current source features (best-effort)
    const src = map.getSource("buildings");
    if (src && src._data && src._data.features) {
      const f = src._data.features.find((feat) => {
        const p = feat.properties || {};
        const candidates = [
          p.BldgCode,
          p.Display_Name,
          p.SiteName,
          p.name,
          p.code,
        ]
          .filter(Boolean)
          .map((s) => String(s).toUpperCase());
        return candidates.includes(key);
      });
      if (f) {
        const center = roughCenter(f.geometry);
        if (center) {
          map.flyTo({
            center,
            zoom: 18,
            speed: 0.6,
            curve: 1.4,
            essential: true,
          });
        }
      }
    }
  }

  if (searchBtn)
    searchBtn.addEventListener("click", () =>
      flyToBuilding(searchInput?.value)
    );
  if (searchInput)
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") flyToBuilding(searchInput.value);
    });
});
