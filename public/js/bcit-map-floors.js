// public/js/bcit-map-floors.js
(function () {
  window.BCITMapPlugins = window.BCITMapPlugins || [];
  window.BCITMapPlugins.push(function attachBuildingFloors(map, utils) {
    const {
      getJSON,
      geometryBounds,
      sortFloorsBottomFirst,
      asLines,
      filterExistingPDFs,
      buildPopupHTML,
      roughCenter,
    } = utils;

    const FLOOR_SRC = "building-floor";
    const FLOOR_FILL_LAYER = "building-floor-fill";
    const FLOOR_LINE_LAYER = "building-floor-line";
    const SEL_SRC = "building-selected";

    let currentBuildingCode = null;

    if (!map.getSource(FLOOR_SRC)) {
      map.addSource(FLOOR_SRC, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: FLOOR_FILL_LAYER,
        type: "fill",
        source: FLOOR_SRC,
        paint: {
          "fill-color": "#fecaca",
          "fill-opacity": 0.55,
        },
      });

      map.addLayer({
        id: FLOOR_LINE_LAYER,
        type: "line",
        source: FLOOR_SRC,
        paint: {
          "line-color": "#b91c1c",
          "line-width": 1.4,
        },
      });
    }

    const clearFloorView = () => {
      currentBuildingCode = null;

      if (map.getLayer("buildings-fill")) {
        map.setFilter("buildings-fill", null);
      }
      if (map.getLayer("buildings-line")) {
        map.setFilter("buildings-line", null);
      }

      const floorSrc = map.getSource(FLOOR_SRC);
      if (floorSrc) {
        floorSrc.setData({ type: "FeatureCollection", features: [] });
      }

      const sel = map.getSource(SEL_SRC);
      if (sel) {
        sel.setData({ type: "FeatureCollection", features: [] });
      }
    };

    const hideBuildingShape = (buildingFeature) => {
      const p = buildingFeature.properties || {};
      const code = (p.BuildingName || p.Display_Name || p.SiteName || "").trim();
      if (!code) return;

      const filter = [
        "all",
        [
          "!=",
          [
            "coalesce",
            ["get", "BuildingName"],
            ["get", "Display_Name"],
            ["get", "SiteName"],
          ],
          code,
        ],
      ];

      if (map.getLayer("buildings-fill")) {
        map.setFilter("buildings-fill", filter);
      }
      if (map.getLayer("buildings-line")) {
        map.setFilter("buildings-line", filter);
      }
    };

    const showBuildingFloor = async (buildingCode, floorLabel = "1") => {
      const code = (buildingCode || "").trim();
      if (!code) return;

      const url = `/data/floor-coordinates/${encodeURIComponent(
        code
      )}-Floor${floorLabel}.geojson`;

      try {
        const data = await getJSON(url);
        const src = map.getSource(FLOOR_SRC);
        if (src) src.setData(data);
      } catch (err) {
        console.error("[BCIT MAP] Failed to load floor coordinates:", url, err);
      }
    };

    // ESC → clear overlay
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        clearFloorView();
      }
    });

    // Rooms clickable → zoom to room
    map.on("click", FLOOR_FILL_LAYER, (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const bounds = geometryBounds(f.geometry);
      if (bounds) {
        map.fitBounds(bounds, { padding: 40, maxZoom: 20, duration: 500 });
      }
    });

    // Building click → show floor geometry
    map.on("click", "buildings-fill", async (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const p = f.properties || {};

      const buildingCode =
        (p.BuildingName ||
          p.Display_Name ||
          p.SiteName ||
          p.BldgCode ||
          p.code ||
          "").trim();
      if (!buildingCode) return;

      // Clicking same building toggles off
      if (currentBuildingCode && currentBuildingCode === buildingCode) {
        clearFloorView();
        return;
      }

      clearFloorView();
      currentBuildingCode = buildingCode;

      // Highlight selected building
      const selSrc = map.getSource(SEL_SRC);
      if (selSrc) {
        selSrc.setData({ type: "FeatureCollection", features: [f] });
      }

      hideBuildingShape(f);
      await showBuildingFloor(buildingCode, "1");

      const bounds = geometryBounds(f.geometry);
      if (bounds) {
        map.fitBounds(bounds, { padding: 60, maxZoom: 19, duration: 800 });
      }

      // Floorplan popup (kept but disabled for now)
      /*
      const title =
        p.BuildingName || p.Display_Name || p.SiteName || p.name || "Building";
      const buildingAddress =
        p.BuildingName || p.Display_Name || p.SiteName || "";
      const services = asLines(p.Services || "");

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
      */
    });

    // Click-away → clear overlay when not clicking building or room
    map.on("click", (e) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: ["buildings-fill", FLOOR_FILL_LAYER],
      });
      if (!features.length) {
        clearFloorView();
      }
    });
  });
})();
