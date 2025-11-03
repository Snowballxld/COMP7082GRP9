import express from "express";
import admin from "../config/firebase.js";
import { verifyFirebaseToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Get all favorites, ordered by lastUsed descending
router.get("/", verifyFirebaseToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const snapshot = await admin
      .firestore()
      .collection("users")
      .doc(uid)
      .collection("favorites")
      .orderBy("lastUsed", "desc")
      .get();

    const favorites = snapshot.docs.map(doc => doc.data());
    res.json({ favorites });
  } catch (err) {
    console.error("Error fetching favorites:", err);
    res.status(500).json({ error: "Failed to fetch favorites" });
  }
});

// Add a favorite
router.post("/", verifyFirebaseToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { nodeId } = req.body;
    if (!nodeId) return res.status(400).json({ error: "nodeId required" });

    const favoriteRef = admin
      .firestore()
      .collection("users")
      .doc(uid)
      .collection("favorites")
      .doc(nodeId);

    const now = admin.firestore.Timestamp.now();

    await favoriteRef.set({
      nodeId,
      addedAt: now,
      lastUsed: now
    });

    res.json({ message: "Favorite added", nodeId });
  } catch (err) {
    console.error("Error adding favorite:", err);
    res.status(500).json({ error: "Failed to add favorite" });
  }
});

// Update lastUsed for a favorite (mark as used)
router.patch("/:nodeId/use", verifyFirebaseToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { nodeId } = req.params;

    const favoriteRef = admin
      .firestore()
      .collection("users")
      .doc(uid)
      .collection("favorites")
      .doc(nodeId);

    await favoriteRef.update({
      lastUsed: admin.firestore.Timestamp.now()
    });

    res.json({ message: "Favorite lastUsed updated", nodeId });
  } catch (err) {
    console.error("Error updating favorite:", err);
    res.status(500).json({ error: "Failed to update favorite" });
  }
});

// Remove a favorite
router.delete("/:nodeId", verifyFirebaseToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { nodeId } = req.params;

    await admin
      .firestore()
      .collection("users")
      .doc(uid)
      .collection("favorites")
      .doc(nodeId)
      .delete();

    res.json({ message: "Favorite removed", nodeId });
  } catch (err) {
    console.error("Error deleting favorite:", err);
    res.status(500).json({ error: "Failed to remove favorite" });
  }
});

export default router;
