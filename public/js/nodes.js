document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("nodeForm");
  const list = document.getElementById("nodesList");

  // Fetch existing nodes on page load
  fetch("/api/nodes")
    .then(res => res.json())
    .then(data => renderNodes(data));

  // Handle form submission
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = {
      name: form.name.value,
      building: form.building.value,
      floor: form.floor.value,
      coordinates: form.coordinates.value
    };

    try {
      const res = await fetch("/api/nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Error creating node");
        return;
      }

      renderNodes([...listData(), data]); // append new node
      form.reset();
    } catch (err) {
      console.error(err);
      alert("Failed to create node");
    }
  });

  // Render nodes in the list
  function renderNodes(nodes) {
    list.innerHTML = "";
    nodes.forEach(n => {
      const li = document.createElement("li");
      li.textContent = `${n.name} – ${n.building} – Floor ${n.floor} – ${n.coordinates}`;
      list.appendChild(li);
    });
  }

  function listData() {
    return Array.from(list.children).map(li => {
      const [name, building, floorCoords] = li.textContent.split(" – ");
      const [floor, coords] = floorCoords.replace("Floor ", "").split(" – ");
      return { name, building, floor, coordinates: coords };
    });
  }
});
