// routes/nodes.js

import express from "express";
import admin from "firebase-admin";

const router = express.Router();
const db = admin.firestore();

// GET /api/nodes → fetch all nodes from Firestore
router.get("/", async (req, res) => {
  try {
    const snapshot = await db.collection("nodes").get();

    const nodes = snapshot.docs.map(doc => ({
      uid: doc.id,    // Use Firestore doc ID
      ...doc.data()
    }));

    res.json(nodes);
  } catch (err) {
    console.error("Error fetching nodes:", err);
    res.status(500).json({ error: "Failed to load nodes" });
  }
});


export default router;
