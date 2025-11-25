// Initialize Firebase Admin
import admin from './../config/firebase.js';

console.log('Firebase Admin initialized:', !!admin); // temporary check



const db = admin.firestore();

async function fixNodeLinks() {
  const snapshot = await db.collection("nodes").get();

  // Convert to id → node map
  const nodes = new Map();
  snapshot.forEach(doc => nodes.set(doc.id, { id: doc.id, ...doc.data() }));

  let updates = 0;

  // Helper: safely parse connections into an array
  function parseConnections(node) {
    if (!node.connections) return [];
    return node.connections
      .split(",")
      .map(x => x.trim())
      .filter(x => x.length > 0);
  }

  for (const [id, node] of nodes) {
    const aConns = new Set(parseConnections(node));

    for (const bId of aConns) {
      const b = nodes.get(bId);
      if (!b) continue; // skip nonexistent nodes

      const bConns = new Set(parseConnections(b));

      // Ensure reciprocal link: B → A
      if (!bConns.has(id)) {
        bConns.add(id);

        // Update Firestore object in memory
        b.connections = Array.from(bConns).join(", ");

        console.log(`🔁 Fixing: ${bId} missing → ${id}`);
        updates++;
      }
    }
  }

  // Write updated nodes back to Firestore
  for (const [, node] of nodes) {
    if (node.id && node.connections !== undefined) {
      await db.collection("nodes").doc(node.id).update({
        connections: node.connections
      });
    }
  }

  console.log(`✔ Finished. ${updates} links fixed.`);
}

fixNodeLinks().catch(err => console.error(err));
