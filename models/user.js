// models/user.js
import admin from "../config/firebase.js";

export default class User {
  constructor(uid) {
    if (!uid) throw new Error("UID is required to create a User instance");
    this.uid = uid;
    this.userRef = admin.firestore().collection("users").doc(uid);
    this.favoritesRef = this.userRef.collection("favorites");
  }

  // -------------------
  // Favorites Methods
  // -------------------

  async getFavorites() {
    const snapshot = await this.favoritesRef.orderBy("lastUsed", "desc").get();
    return snapshot.docs.map(doc => doc.data());
  }

  async addFavorite(nodeId) {
    const now = admin.firestore.Timestamp.now();
    await this.favoritesRef.doc(nodeId).set({
      nodeId,
      addedAt: now,
      lastUsed: now
    });
    return { nodeId, addedAt: now, lastUsed: now };
  }

  async markFavoriteUsed(nodeId) {
    const now = admin.firestore.Timestamp.now();
    await this.favoritesRef.doc(nodeId).update({ lastUsed: now });
    return { nodeId, lastUsed: now };
  }

  async removeFavorite(nodeId) {
    await this.favoritesRef.doc(nodeId).delete();
    return { nodeId };
  }

  async getFavorite(nodeId) {
    const doc = await this.favoritesRef.doc(nodeId).get();
    return doc.exists ? doc.data() : null;
  }

  // -------------------
  // Optional User Info Methods
  // -------------------

  async setProfile(profileData) {
    await this.userRef.set(profileData, { merge: true });
    return profileData;
  }

  async getProfile() {
    const doc = await this.userRef.get();
    return doc.exists ? doc.data() : null;
  }
}
