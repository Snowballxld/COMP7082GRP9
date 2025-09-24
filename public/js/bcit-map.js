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

  const BCIT_BURNABY = { lng: -123.0036, lat: 49.251 };

  const map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/streets-v12",
    center: [BCIT_BURNABY.lng, BCIT_BURNABY.lat],
    zoom: 15.3,
    pitch: 45,
    bearing: -10,
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

  // Demo data
  const buildingsIndex = {
    SE12: { center: [-123.0049, 49.2509] },
    SE2: { center: [-123.0041, 49.2519] },
    SW1: { center: [-123.0066, 49.252] },
    SW3: { center: [-123.0079, 49.2514] },
  };

  const entrances = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "SE12 Main Entrance" },
        geometry: { type: "Point", coordinates: [-123.00485, 49.25085] },
      },
      {
        type: "Feature",
        properties: { name: "SE2 Entrance" },
        geometry: { type: "Point", coordinates: [-123.00405, 49.25185] },
      },
    ],
  };

  const notable = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "The Roundabout" },
        geometry: { type: "Point", coordinates: [-123.0031, 49.2511] },
      },
      {
        type: "Feature",
        properties: { name: "Library (SE14)" },
        geometry: { type: "Point", coordinates: [-123.0056, 49.2512] },
      },
    ],
  };

  map.on("load", () => {
    // Demo building footprints
    const demoBuildings = {
      type: "FeatureCollection",
      features: Object.entries(buildingsIndex).map(([code, info]) => {
        const [lng, lat] = info.center;
        const d = 0.00025;
        return {
          type: "Feature",
          properties: { code },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [lng - d, lat - d],
                [lng + d, lat - d],
                [lng + d, lat + d],
                [lng - d, lat + d],
                [lng - d, lat - d],
              ],
            ],
          },
        };
      }),
    };

    map.addSource("buildings", { type: "geojson", data: demoBuildings });
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

    map.addSource("entrances", { type: "geojson", data: entrances });
    map.addLayer({
      id: "entrances-circles",
      type: "circle",
      source: "entrances",
      paint: {
        "circle-radius": 6,
        "circle-color": "#86efac",
        "circle-stroke-color": "#065f46",
        "circle-stroke-width": 1,
      },
    });

    map.addSource("notable", { type: "geojson", data: notable });
    map.addLayer({
      id: "notable-symbols",
      type: "symbol",
      source: "notable",
      layout: {
        "icon-image": "marker-15",
        "icon-size": 1,
        "text-field": ["get", "name"],
        "text-offset": [0, 1],
        "text-anchor": "top",
      },
    });

    map.on("click", "buildings-fill", (e) => {
      const f = e.features[0];
      new mapboxgl.Popup({ anchor: "bottom", offset: 8 })
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="popup"><strong>Building ${f.properties.code}</strong></div>`
        )
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
  });

  // Search
  const searchBtn = document.getElementById("searchBtn");
  const searchInput = document.getElementById("searchInput");

  function flyToBuilding(code) {
    const key = (code || "").trim().toUpperCase();
    if (!key || !buildingsIndex[key]) return;
    map.flyTo({
      center: buildingsIndex[key].center,
      zoom: 18,
      speed: 0.6,
      curve: 1.4,
      essential: true,
    });
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
