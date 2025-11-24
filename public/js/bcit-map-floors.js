// public/js/bcit-map-floors.js
(function () {
  window.BCITMapPlugins = window.BCITMapPlugins || [];
  window.BCITMapPlugins.push(function attachBuildingFloors(map, utils) {
    const {
      getJSON,
      geometryBounds,
      sortFloorsBottomFirst,
      roughCenter,
    } = utils;

    const FLOOR_SRC = "building-floor";
    const FLOOR_FILL_LAYER = "building-floor-fill";
    const FLOOR_LINE_LAYER = "building-floor-line";

    const SEL_SRC = "building-selected";
    const SEL_LAYER = "building-selected-line";

    const ROOM_SEL_SRC = "room-selected";
    const ROOM_SEL_FILL_LAYER = "room-selected-fill";
    const ROOM_SEL_LINE_LAYER = "room-selected-line";

    let currentBuildingCode = null;
    let currentBuildingLabel = null;
    let currentFloorLabel = "1";
    let currentFloorList = ["1"];

    let roomPopup = null;

    // Floors derived from room-search-index.json
    // Shape: { "SW3": ["1","2"], ... }
    let roomFloorsIndex = {};

    (async function loadRoomFloorsIndex() {
      try {
        const res = await fetch("/data/room-search-index.json", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = await res.json();
        const byBuilding = {};

        if (Array.isArray(json.rooms)) {
          for (const r of json.rooms) {
            const b = (r.building || "").trim().toUpperCase();
            const f = (r.floor || "").trim();
            if (!b || !f) continue;
            if (!byBuilding[b]) byBuilding[b] = new Set();
            byBuilding[b].add(f);
          }
        }

        roomFloorsIndex = {};
        Object.keys(byBuilding).forEach((b) => {
          roomFloorsIndex[b] = Array.from(byBuilding[b]);
        });
      } catch (e) {
        // fail silently; floorLabels on building props will still work
      }
    })();

    // ---------------- Selected-building highlight ----------------
    function ensureSelectedLayer() {
      if (!map.getSource(SEL_SRC)) {
        map.addSource(SEL_SRC, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }

      if (!map.getLayer(SEL_LAYER)) {
        map.addLayer({
          id: SEL_LAYER,
          type: "line",
          source: SEL_SRC,
          paint: {
            "line-color": "#f59e0b",
            "line-width": 3,
          },
        });
      }

      // Keep highlight above floor outlines if possible
      if (map.getLayer(FLOOR_LINE_LAYER)) {
        map.moveLayer(SEL_LAYER, FLOOR_LINE_LAYER);
      }
    }

    // ---------------- Selected-room highlight ----------------
    function ensureRoomSelectedLayers() {
      if (!map.getSource(ROOM_SEL_SRC)) {
        map.addSource(ROOM_SEL_SRC, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }

      if (!map.getLayer(ROOM_SEL_FILL_LAYER)) {
        map.addLayer({
          id: ROOM_SEL_FILL_LAYER,
          type: "fill",
          source: ROOM_SEL_SRC,
          paint: {
            "fill-color": "#facc15", // bright yellow
            "fill-opacity": 0.85,
          },
        });
      }

      if (!map.getLayer(ROOM_SEL_LINE_LAYER)) {
        map.addLayer({
          id: ROOM_SEL_LINE_LAYER,
          type: "line",
          source: ROOM_SEL_SRC,
          paint: {
            "line-color": "#d97706", // strong orange outline
            "line-width": 3,
          },
        });
      }

      // Order: base floors -> floor outline -> building highlight -> selected room
      if (map.getLayer(SEL_LAYER)) {
        map.moveLayer(ROOM_SEL_FILL_LAYER, SEL_LAYER);
        map.moveLayer(ROOM_SEL_LINE_LAYER, ROOM_SEL_FILL_LAYER);
      } else if (map.getLayer(FLOOR_LINE_LAYER)) {
        map.moveLayer(ROOM_SEL_FILL_LAYER, FLOOR_LINE_LAYER);
        map.moveLayer(ROOM_SEL_LINE_LAYER, ROOM_SEL_FILL_LAYER);
      }
    }

    function clearSelectedRoom() {
      const src = map.getSource(ROOM_SEL_SRC);
      if (src) {
        src.setData({ type: "FeatureCollection", features: [] });
      }
    }

    // ---------------- Floor selector UI (inside map container) ----------------
    const mapContainer = document.getElementById("map");
    if (mapContainer && getComputedStyle(mapContainer).position === "static") {
      mapContainer.style.position = "relative";
    }

    const floorPanel = document.createElement("div");
    floorPanel.id = "bcit-floor-panel";
    floorPanel.style.position = "absolute";
    floorPanel.style.top = "52px";
    floorPanel.style.left = "10px";
    floorPanel.style.background = "white";
    floorPanel.style.borderRadius = "8px";
    floorPanel.style.boxShadow = "0 2px 6px rgba(0,0,0,0.15)";
    floorPanel.style.padding = "10px 12px";
    floorPanel.style.fontFamily =
      "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
    floorPanel.style.fontSize = "13px";
    floorPanel.style.zIndex = "10";
    floorPanel.style.display = "none";
    if (mapContainer) mapContainer.appendChild(floorPanel);

    const renderFloorPanel = () => {
      if (!currentBuildingCode || !currentFloorList || !currentFloorList.length) {
        floorPanel.style.display = "none";
        floorPanel.innerHTML = "";
        return;
      }

      const title = currentBuildingLabel || currentBuildingCode;

      const buttonsHtml = currentFloorList
        .map((fl) => {
          const active = fl === currentFloorLabel;
          return `
            <button
              data-floor="${fl}"
              style="
                margin: 0 4px 4px 0;
                padding: 4px 8px;
                border-radius: 6px;
                border: 1px solid ${active ? "#2563eb" : "#d1d5db"};
                background: ${active ? "#2563eb" : "#ffffff"};
                color: ${active ? "#ffffff" : "#111827"};
                font-size: 12px;
                cursor: pointer;
              ">
              ${fl}
            </button>
          `;
        })
        .join("");

      floorPanel.innerHTML = `
        <div style="font-weight:600;margin-bottom:4px;">${title}</div>
        <div style="font-size:11px;color:#6b7280;margin-bottom:4px;">Floors</div>
        <div>${buttonsHtml}</div>
      `;
      floorPanel.style.display = "block";
    };

    // Floor panel button clicks
    floorPanel.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-floor]");
      if (!btn) return;
      const floor = btn.getAttribute("data-floor");
      if (!floor || floor === currentFloorLabel) return;

      currentFloorLabel = floor;
      if (currentBuildingCode) {
        showBuildingFloor(currentBuildingCode, currentFloorLabel);
      }
      clearSelectedRoom();
      renderFloorPanel();
    });

    // ---------------- Floor source / layers ----------------
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
          // more saturated / visible than before
          "fill-color": "#fb923c", // orange-ish
          "fill-opacity": 0.65,
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

    // Ensure highlight layers exist
    ensureSelectedLayer();
    ensureRoomSelectedLayers();

    const clearRoomPopup = () => {
      if (roomPopup) {
        roomPopup.remove();
        roomPopup = null;
      }
    };

    const clearFloorView = () => {
      currentBuildingCode = null;
      currentBuildingLabel = null;
      currentFloorLabel = "1";
      currentFloorList = ["1"];

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

      clearSelectedRoom();
      clearRoomPopup();
      renderFloorPanel();
    };

    // Decide floor labels for a building:
    // 1) from room-search-index.json (roomFloorsIndex)
    // 2) fallback to building properties.floorLabels
    // 3) finally, ["1"] so there is at least one button
    function deriveFloorLabels(buildingCode, props) {
      const codeUpper = String(buildingCode || "").trim().toUpperCase();
      let labels = null;

      const fromIndex = codeUpper && roomFloorsIndex[codeUpper];
      if (fromIndex && fromIndex.length) {
        labels = fromIndex.map(String);
      } else if (Array.isArray(props.floorLabels) && props.floorLabels.length) {
        labels = props.floorLabels.map(String);
      } else {
        labels = ["1"];
      }

      return sortFloorsBottomFirst(labels);
    }

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

    const showBuildingFloor = async (buildingCode, floorLabel) => {
      const code = (buildingCode || "").trim();
      const fl = (floorLabel || "1").trim();
      if (!code) return;

      const url = `/data/floor-coordinates/${encodeURIComponent(
        code
      )}-Floor${fl}.geojson`;

      try {
        const data = await getJSON(url);
        const src = map.getSource(FLOOR_SRC);
        if (src) src.setData(data);
      } catch (err) {
        console.error("[BCIT MAP] Failed to load floor coordinates:", url, err);
      }
    };

    const zoomToFeatureGeom = (feat, padding = 40, maxZoom = 20) => {
      const bounds = geometryBounds(feat.geometry);
      if (bounds) {
        map.fitBounds(bounds, { padding, maxZoom, duration: 500 });
      }
    };

    const buildRoomPopupHTML = (props, lngLatPayload) => {
      const room =
        props.room || props.Room || props.name || props.id || "Room";
      const building =
        props.building || props.Building || props.BuildingName || "";
      const floor = props.floor || props.Floor || "";

      const rawType = (props.type || props.Type || "").toLowerCase();
      let typeLabel = "";
      if (rawType === "stairs") typeLabel = "Stairs";
      else if (rawType === "room") typeLabel = "Room";

      const navPayload = {
        building: String(building || "").trim(),
        floor: String(floor || "").trim(),
        room: String(room || "").trim(),
        type: rawType || "room",
        ...lngLatPayload,
      };
      const payloadStr = JSON.stringify(navPayload).replace(/"/g, "&quot;");

      const labelParts = [];
      if (navPayload.building) labelParts.push(navPayload.building);
      if (navPayload.floor) labelParts.push(`Floor ${navPayload.floor}`);
      const subtitle = labelParts.join(" · ");

      return `
        <div style="font-family:system-ui;min-width:200px;">
          <div style="font-weight:600;font-size:1rem;margin-bottom:.25rem;">
            ${room}
          </div>
          ${
            subtitle
              ? `<div style="font-size:.85rem;color:#4b5563;margin-bottom:.1rem;">${subtitle}</div>`
              : ""
          }
          ${
            typeLabel
              ? `<div style="font-size:.8rem;color:#6b7280;margin-bottom:.5rem;">Type: <strong>${typeLabel}</strong></div>`
              : ""
          }
          <button
            style="
              padding:.35rem .65rem;
              border-radius:6px;
              border:1px solid #2563eb;
              background:#2563eb;
              color:white;
              font-size:.85rem;
              cursor:pointer;
            "
            onclick="window.BCITMap && window.BCITMap.navigateToRoom && window.BCITMap.navigateToRoom(${payloadStr});">
            Navigate here
          </button>
        </div>
      `;
    };

    const showRoomPopupForFeature = (feat, lngLatFallback) => {
      const center = roughCenter(feat.geometry) || lngLatFallback;
      if (!center) return;

      const props = feat.properties || {};
      const html = buildRoomPopupHTML(props, {});

      clearRoomPopup();
      roomPopup = new mapboxgl.Popup({
        closeOnClick: true,
        offset: [0, -6],
        maxWidth: "260px",
      })
        .setLngLat(center)
        .setHTML(html)
        .addTo(map);
    };

    // ESC → clear overlay
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        clearFloorView();
      }
    });

    // ---------------- Room click → zoom + popup + highlight ----------------
    map.on("click", FLOOR_FILL_LAYER, (e) => {
      const f = e.features?.[0];
      if (!f) return;

      zoomToFeatureGeom(f, 40, 20);
      showRoomPopupForFeature(f, e.lngLat);

      // Highlight just this room
      ensureRoomSelectedLayers();
      const src = map.getSource(ROOM_SEL_SRC);
      if (src) {
        src.setData({
          type: "FeatureCollection",
          features: [f],
        });
      }
    });

    // ---------------- Building click → floors + highlight ----------------
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
      currentBuildingLabel =
        p.BuildingName || p.Display_Name || p.SiteName || buildingCode;

      // Floors: auto from room index, then props.floorLabels, else ["1"]
      let floorLabels = deriveFloorLabels(buildingCode, p);
      currentFloorList = floorLabels;
      currentFloorLabel = floorLabels[0] || "1";

      renderFloorPanel();

      // Highlight ALL polygons for this building
      ensureSelectedLayer();
      const selSrc = map.getSource(SEL_SRC);
      if (selSrc) {
        const buildingsSrc = map.getSource("buildings");
        const buildingsData = buildingsSrc && buildingsSrc._data;

        let features = [f];
        if (buildingsData && buildingsData.features) {
          const codeUpper = currentBuildingCode.toUpperCase();
          features = buildingsData.features.filter((ft) => {
            const bp = ft.properties || {};
            const candidates = [
              bp.BuildingName,
              bp.Display_Name,
              bp.SiteName,
              bp.name,
              bp.BldgCode,
              bp.code,
            ]
              .filter(Boolean)
              .map((s) => String(s).toUpperCase());
            return candidates.includes(codeUpper);
          });
          if (!features.length) features = [f];
        }

        selSrc.setData({
          type: "FeatureCollection",
          features,
        });
      }

      hideBuildingShape(f);
      await showBuildingFloor(buildingCode, currentFloorLabel);

      const bounds = geometryBounds(f.geometry);
      if (bounds) {
        map.fitBounds(bounds, { padding: 60, maxZoom: 19, duration: 800 });
      }
    });

    // Click-away → clear when not clicking building or room
    map.on("click", (e) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: ["buildings-fill", FLOOR_FILL_LAYER],
      });
      if (!features.length) {
        clearFloorView();
      }
    });

    // ---------------- Expose BCITMap.focusRoom for search ----------------
    if (!window.BCITMap) window.BCITMap = {};

    window.BCITMap.focusRoom = async function ({ building, floor, room }) {
      const code = (building || "").trim();
      if (!code) return;

      const src = map.getSource("buildings");
      const data = src && src._data;
      if (!data || !data.features) return;

      const upperCode = code.toUpperCase();
      const buildingFeat = data.features.find((ft) => {
        const p = ft.properties || {};
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
        return candidates.includes(upperCode);
      });
      if (!buildingFeat) return;

      // Set up building / floors like a click
      clearFloorView();

      const bp = buildingFeat.properties || {};
      currentBuildingCode = code;
      currentBuildingLabel =
        bp.BuildingName || bp.Display_Name || bp.SiteName || code;

      let floorLabels = deriveFloorLabels(code, bp);
      currentFloorList = floorLabels;

      const requestedFloor = floor ? String(floor) : "";
      currentFloorLabel = floorLabels.includes(requestedFloor)
        ? requestedFloor
        : floorLabels[0] || "1";

      renderFloorPanel();

      // Highlight ALL polygons for this building
      ensureSelectedLayer();
      const selSrc = map.getSource(SEL_SRC);
      if (selSrc) {
        const buildingsSrc = map.getSource("buildings");
        const buildingsData = buildingsSrc && buildingsSrc._data;

        let features = [buildingFeat];
        if (buildingsData && buildingsData.features) {
          const codeUpper = code.toUpperCase();
          features = buildingsData.features.filter((ft) => {
            const bp2 = ft.properties || {};
            const candidates = [
              bp2.BuildingName,
              bp2.Display_Name,
              bp2.SiteName,
              bp2.name,
              bp2.BldgCode,
              bp2.code,
            ]
              .filter(Boolean)
              .map((s) => String(s).toUpperCase());
            return candidates.includes(codeUpper);
          });
          if (!features.length) features = [buildingFeat];
        }

        selSrc.setData({
          type: "FeatureCollection",
          features,
        });
      }

      hideBuildingShape(buildingFeat);
      await showBuildingFloor(code, currentFloorLabel);

      clearSelectedRoom();

      // If room specified, try to zoom to it
      if (room) {
        const floorSrc = map.getSource(FLOOR_SRC);
        const fData = floorSrc && floorSrc._data;
        if (fData && fData.features && fData.features.length) {
          const target = String(room).toUpperCase();

          const roomFeat = fData.features.find((rf) => {
            const rp = rf.properties || {};
            const rName = String(
              rp.room || rp.Room || rp.name || rp.id || ""
            ).toUpperCase();

            return (
              rName === target ||
              rName.endsWith("-" + target) ||
              ("-" + rName).endsWith("-" + target)
            );
          });

          if (roomFeat) {
            zoomToFeatureGeom(roomFeat, 40, 20);
            showRoomPopupForFeature(roomFeat, null);

            ensureRoomSelectedLayers();
            const selRoomSrc = map.getSource(ROOM_SEL_SRC);
            if (selRoomSrc) {
              selRoomSrc.setData({
                type: "FeatureCollection",
                features: [roomFeat],
              });
            }
            return;
          }
        }
      }

      // Otherwise, zoom to building
      const bounds = geometryBounds(buildingFeat.geometry);
      if (bounds) {
        map.fitBounds(bounds, { padding: 60, maxZoom: 19, duration: 800 });
      }
    };
  });
})();
