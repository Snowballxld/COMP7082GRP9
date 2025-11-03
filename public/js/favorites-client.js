// Use fetch with Authorization header to interact with backend
async function getFavorites(token) {
  const res = await fetch("/api/favorites", {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  return data.favorites;
}

async function addFavorite(nodeId, token) {
  const res = await fetch("/api/favorites", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ nodeId })
  });
  return await res.json();
}

async function useFavorite(nodeId, token) {
  const res = await fetch(`/api/favorites/${nodeId}/use`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` }
  });
  return await res.json();
}

async function removeFavorite(nodeId, token) {
  const res = await fetch(`/api/favorites/${nodeId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  return await res.json();
}
