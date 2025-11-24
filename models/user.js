// models/user.js
import admin from "../config/firebase.js";

export default class User {
  constructor(uid) {
    if (!uid) throw new Error("UID is required to create a User instance");
    this.uid = uid;
    this.userRef = admin.firestore().collection("users").doc(uid);
    this.favoritesRef = this.userRef.collection("favorites");
  }

  // Ensure the user document exists (create minimal profile if missing)
  async ensureExists(profile = {}) {
    const doc = await this.userRef.get();
    if (!doc.exists) {
      const now = admin.firestore.FieldValue.serverTimestamp();
      await this.userRef.set({
        uid: this.uid,
        email: profile.email || null,
        displayName: profile.displayName || null,
        createdAt: now,
        ...profile,
      }, { merge: true });
    }
  }

  // -------------------
  // Favorites Methods
  // -------------------

  // Return favorites with their ID included
  async getFavorites(limit = 100) {
    const snapshot = await this.favoritesRef
      .orderBy("lastUsed", "desc")
      .limit(limit)
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  // Add or update a favorite. Uses nodeId as the favorite doc ID for easy lookup.
  async addFavorite(nodeId, { label = null, isKeyLocation = false, nodeMeta = {} } = {}) {
    if (!nodeId) throw new Error("nodeId is required");
    const now = admin.firestore.FieldValue.serverTimestamp();
    const favRef = this.favoritesRef.doc(nodeId);
    await favRef.set({
      nodeId,
      label,
      isKeyLocation,
      nodeMeta,      // optional snapshot or small metadata
      addedAt: now,
      lastUsed: now
    }, { merge: true });
    return { nodeId, addedAt: now, lastUsed: now };
  }

  // Update lastUsed when user uses the favorite
  async markFavoriteUsed(nodeId) {
    if (!nodeId) throw new Error("nodeId is required");
    const now = admin.firestore.FieldValue.serverTimestamp();
    const favRef = this.favoritesRef.doc(nodeId);
    await favRef.update({ lastUsed: now });
    return { nodeId, lastUsed: now };
  }

  // Remove favorite
  async removeFavorite(nodeId) {
    if (!nodeId) throw new Error("nodeId is required");
    await this.favoritesRef.doc(nodeId).delete();
    return { nodeId };
  }

  // Get a single favorite doc
  async getFavorite(nodeId) {
    const doc = await this.favoritesRef.doc(nodeId).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  }

  // Optional: set profile (merge)
  async setProfile(profileData) {
    await this.userRef.set(profileData, { merge: true });
    return profileData;
  }

  async getProfile() {
    const doc = await this.userRef.get();
    return doc.exists ? doc.data() : null;
  }
}