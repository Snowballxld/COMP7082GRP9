// public/js/bcit-map-search.js
(function () {
  window.BCITMapPlugins = window.BCITMapPlugins || [];
  window.BCITMapPlugins.push(function attachMapSearch(map, utils) {
    const { geometryBounds } = utils;

    const searchBtn = document.getElementById("searchBtn");
    const searchInput = document.getElementById("searchInput");

    function flyToBuilding(code) {
      const key = (code || "").trim().toUpperCase();
      const ix = window.__BUILDINGS_INDEX__ || {};
      if (!key) return;

      // Fast path: use precomputed index center
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

      // Fallback: scan buildings source for a matching name/code
      const src = map.getSource("buildings");
      const data = src && src._data;
      if (data && data.features) {
        const feat = data.features.find((f) => {
          const p = f.properties || {};
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

        if (feat) {
          const bounds = geometryBounds(feat.geometry);
          if (bounds) {
            map.fitBounds(bounds, { padding: 60, maxZoom: 19, duration: 600 });
          }
        }
      }
    }

    if (searchBtn) {
      searchBtn.addEventListener("click", () =>
        flyToBuilding(searchInput?.value)
      );
    }

    if (searchInput) {
      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          flyToBuilding(searchInput.value);
        }
      });
    }
  });
})();
