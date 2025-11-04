// public/js/floorplan.js
(async function () {
  // Path to the image you exported from the PDF
  const IMG_URL = "/images/se12-floor3.jpg";

  // Optional: master links for floor plans for this level
//   const LEVEL_FLOORPLAN_LINKS = [
//     { label: "SE12 – Third Floor (PDF)", url: "/files/floorplans/se/bse1203.pdf" }
//   ];

  // 1) Load the image to get its pixel dimensions
  const img = new Image();
  img.src = IMG_URL;
  await img.decode(); // waits until the image is ready

  const width = img.naturalWidth;
  const height = img.naturalHeight;

  // 2) Build a Leaflet map with pixel coordinates (0..width, 0..height)
  const map = L.map("map", {
    crs: L.CRS.Simple,
    minZoom: -2,
    maxZoom: 2,
    zoomSnap: 0.25,
    zoomDelta: 0.25,
    wheelPxPerZoomLevel: 100
  });

  // The bounds for an image overlay in CRS.Simple are [[yTopLeft, xTopLeft], [yBottomRight, xBottomRight]]
  const bounds = [[0, 0], [height, width]];
  L.imageOverlay(IMG_URL, bounds).addTo(map);
  map.fitBounds(bounds);

  // Utility: convert a rectangle expressed in pixel coordinates
  // rect form: { x1, y1, x2, y2 } (top-left to bottom-right)
  function rectToLatLngBounds({ x1, y1, x2, y2 }) {
    // [ [y1,x1], [y2,x2] ]  (note Leaflet uses [y, x] = [row, col])
    return [[y1, x1], [y2, x2]];
  }

  // 3) Define clickable hotspots (add as many as you like)
  // NOTE: Use DevTools console logs (see map.on('click') below) to grab coords.
  const HOTSPOTS = [
    {
      id: "SE12-320",
      title: "SE12-320 – Lab",
      rect: { x1: 2300, y1: 820, x2: 2700, y2: 1200 }, // sample numbers; adjust using click-logs
      photo: "https://placehold.co/640x360?text=SE12-320",
      description: "Computer lab with 36 seats.",
      links: [
        { label: "SE12 Floor 3 Plan (PDF)", url: "/files/floorplans/se/bse1203.pdf" }
      ]
    },
    {
      id: "SE12-321",
      title: "SE12-321 – Classroom",
      rect: { x1: 2720, y1: 820, x2: 3120, y2: 1200 },
      photo: "https://placehold.co/640x360?text=SE12-321",
      description: "Lecture room with projector and AV.",
      links: [
        { label: "Book this room", url: "#" }
      ]
    }
    // Add more…
  ];

  // 4) Render hotspots
  HOTSPOTS.forEach(h => {
    const llb = rectToLatLngBounds(h.rect);
    const rect = L.rectangle(llb, {
      className: "hot-rect",
      interactive: true
    }).addTo(map);

    const linksHtml = (h.links && h.links.length)
      ? `<ul class="popup-links">` + h.links.map(l => (
          `<li><a href="${l.url}" target="_blank" rel="noopener noreferrer">${l.label}</a></li>`
        )).join("") + `</ul>`
      : (LEVEL_FLOORPLAN_LINKS.length
          ? `<ul class="popup-links">` + LEVEL_FLOORPLAN_LINKS.map(l => (
              `<li><a href="${l.url}" target="_blank" rel="noopener noreferrer">${l.label}</a></li>`
            )).join("") + `</ul>` : ""
        );

    const imgHtml = h.photo ? `<img class="popup-img" src="${h.photo}" alt="${h.title}">` : "";
    const descHtml = h.description ? `<p class="popup-desc">${h.description}</p>` : "";

    rect.bindPopup(
      `<div class="popup">
         <div class="popup-title">${h.title}</div>
         ${imgHtml}
         ${descHtml}
         ${linksHtml}
       </div>`,
      { maxWidth: 320 }
    );

    rect.on("mouseover", () => rect.openPopup());
  });

  // 5) Developer helper: log pixel coords on click to help you define rectangles
  map.on("click", (e) => {
    // Convert from map latLng (y,x in CRS.Simple) back to pixel coordinates:
    const y = e.latlng.lat.toFixed(0);
    const x = e.latlng.lng.toFixed(0);
    console.log(`[pixel] x=${x}, y=${y}`);
  });

})();
