// config/firebase.js
import admin from "firebase-admin";
import dotenv from "dotenv";

dotenv.config();

// In tests, don't require a real service account
if (process.env.NODE_ENV === "test") {
  if (!admin.apps.length) {
    admin.initializeApp({
      // minimal config so admin.firestore() works in tests
      projectId: "demo-test",
    });
  }
} else {
  // Your existing logic, but with a safe guard
  let serviceAccount = null;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "{}";

  try {
    serviceAccount = JSON.parse(raw);
  } catch (err) {
    console.warn(
      "Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY JSON:",
      err.message
    );
  }

  if (!serviceAccount || !serviceAccount.project_id) {
    console.warn("FIREBASE_SERVICE_ACCOUNT_KEY missing or invalid in .env");
  } else if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id,
    });
  }
}

export default admin;
