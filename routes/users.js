// routes/users.js
import express from "express";
import { verifyFirebaseToken } from "../middleware/authMiddleware.js";
import User from "../models/user.js";

const router = express.Router();

/**
 * Middleware to ensure user doc exists in Firestore
 */
async function ensureUserDoc(req, res, next) {
  try {
    const user = new User(req.user.uid);
    const profile = await user.getProfile();
    if (!profile) {
      // Create minimal profile for new/existing users
      await user.setProfile({
        uid: req.user.uid,
        email: req.user.email || null,
        createdAt: new Date(),
      });
      console.log(`Created Firestore user doc for UID: ${req.user.uid}`);
    }
    req.userModel = user; // attach User instance for downstream use
    next();
  } catch (err) {
    console.error("Failed to ensure user doc:", err);
    res.status(500).json({ error: "Failed to initialize user" });
  }
}

/**
 * Get all favorites
 */
router.get("/favorites", verifyFirebaseToken, ensureUserDoc, async (req, res) => {
  try {
    const favorites = await req.userModel.getFavorites();
    res.json({ favorites });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch favorites" });
  }
});

/**
 * Add a favorite
 */
router.post("/favorites/:nodeId", verifyFirebaseToken, ensureUserDoc, async (req, res) => {
  try {
    const { nodeId } = req.params;
    const favorite = await req.userModel.addFavorite(nodeId);
    res.json({ favorite });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add favorite" });
  }
});

/**
 * Remove a favorite
 */
router.delete("/favorites/:nodeId", verifyFirebaseToken, ensureUserDoc, async (req, res) => {
  try {
    const { nodeId } = req.params;
    await req.userModel.removeFavorite(nodeId);
    res.json({ message: "Favorite removed", nodeId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to remove favorite" });
  }
});

/**
 * Mark a favorite as used (update lastUsed)
 */
router.post("/favorites/:nodeId/use", verifyFirebaseToken, ensureUserDoc, async (req, res) => {
  try {
    const { nodeId } = req.params;
    const updated = await req.userModel.markFavoriteUsed(nodeId);
    res.json({ updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update favorite" });
  }
});

export default router;
