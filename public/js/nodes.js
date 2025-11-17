// public/js/nodes.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";

// ------------------------
// Initialize Firebase
// ------------------------
const app = initializeApp(window.firebaseConfig);
const auth = getAuth(app);

// ------------------------
// Optional login/logout elements (if present)
// ------------------------
const loginForm = document.getElementById('loginForm');
const errorElem = document.getElementById('error');
const logoutBtn = document.getElementById('logoutBtn');

if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    await fetch('/auth/sessionLogout', { method: 'POST' });
    localStorage.removeItem('user');
    logoutBtn.style.display = 'none';
    if (loginForm) loginForm.style.display = 'block';
    window.location.href = "/auth/login";
  });
}

// ------------------------
// Load all nodes
// ------------------------
async function loadNodes() {
  try {
    const res = await fetch("/api/nodes");
    const nodes = await res.json();

    const list = document.getElementById("nodesList");
    if (!list) return;

    list.innerHTML = "";

    nodes.forEach(node => {
      const li = document.createElement("li");
      li.innerHTML = `
        <strong>${node.alt}</strong>
        <br>Lat: ${node.lat}, Long: ${node.long}
        <br>Connections: ${node.connections}
        <button class="btn-small" data-nodeid="${node.uid}">⭐ Add to Favorites</button>
      `;
      list.appendChild(li);
    });

    attachFavoriteHandlers();
  } catch (err) {
    console.error("Failed to load nodes:", err);
  }
}

// ------------------------
// Attach favorite buttons
// ------------------------
function attachFavoriteHandlers() {
  document.querySelectorAll("button[data-nodeid]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const nodeId = e.target.getAttribute("data-nodeid");
      await addFavorite(nodeId);
    });
  });
}

// ------------------------
// Add favorite
// ------------------------
async function addFavorite(nodeId) {
  try {
    const user = auth.currentUser;
    if (!user) {
      alert("Please log in first");
      return;
    }

    const token = await user.getIdToken(true);

    const res = await fetch("/api/favorites", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ nodeId })
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Failed to add favorite");
      return;
    }

    console.log("Favorite added:", data.favorite);
    alert(`Added to favorites!`);
  } catch (err) {
    console.error("Network or auth error:", err);
    alert("Network or auth error while adding favorite");
  }
}

// ------------------------
// Initialize page
// ------------------------
auth.onAuthStateChanged(user => {
  loadNodes();
});
