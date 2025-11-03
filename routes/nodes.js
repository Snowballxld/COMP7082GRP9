// routes/nodes.js
import express from "express";

export default function nodeRoutes(db) {
  const router = express.Router();

  // GET: Render all nodes
  router.get("/", async (req, res) => {
    try {
      const snapshot = await db.collection("nodes").get();
      const nodes = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      // Render your EJS template with the nodes
      res.render("nodes", { title: "Campus Nodes", nodes });
    } catch (error) {
      console.error("Error loading nodes:", error);
      res.status(500).send("Failed to load nodes.");
    }
  });

  // POST: Add a new node
  router.post("/", async (req, res) => {
    const { long, lat, alt, connections } = req.body;
    const docRef = await db.collection("nodes").add({ long, lat, alt, connections });
    const newDoc = await docRef.get();
    res.status(201).json({ id: newDoc.id, ...newDoc.data() });
  });

  
  router.get("/data", async (req, res) => {
  try {
    const snapshot = await db.collection("nodes").get();
    const nodes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(nodes);
  } catch (err) {
    console.error("Error loading nodes:", err);
    res.status(500).json({ error: "Failed to load nodes." });
  }
});

  return router;
}
