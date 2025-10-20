import admin from "firebase-admin";
import dotenv from "dotenv";

dotenv.config();

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "{}");

if (!serviceAccount || !serviceAccount.project_id) {
  console.warn("FIREBASE_SERVICE_ACCOUNT_KEY missing or invalid in .env");
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: process.env.FIREBASE_PROJECT_ID,
});

export default admin;
