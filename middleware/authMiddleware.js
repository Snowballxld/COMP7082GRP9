import admin from "../config/firebase.js";

export async function verifyFirebaseToken(req, res, next) {
  try {
    const token = req.headers.authorization?.split("Bearer ")[1] || req.session?.userToken;

    if (!token) {
      // If AJAX request, send JSON error
      if (req.xhr || req.headers.accept.includes("json")) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      // Otherwise redirect for normal page load
      return res.redirect("/auth/login");
    }

    const decodedToken = await admin.auth().verifyIdToken(token);

    req.user = decodedToken;
    if (req.session) req.session.user = decodedToken;
    next();
  } catch (err) {
    console.error("Auth error:", err);
    if (req.xhr || req.headers.accept.includes("json")) {
      return res.status(401).json({ error: "Invalid token" });
    }
    res.redirect("/auth/login");
  }
}

// Helper to check session for normal page routes
export function checkSession(req, res, next) {
  if (req.session?.user) return next();
  res.redirect("/auth/login");
}
