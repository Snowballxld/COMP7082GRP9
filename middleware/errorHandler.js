import { logger, logCritical } from "./logger.js";

export async function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const isAuthError =
    err.message?.toLowerCase().includes("firebase") ||
    err.message?.toLowerCase().includes("auth");

  // Log to file and console
  logger.error(`${req.method} ${req.url} -> ${err.message}`);

  // Log critical Firebase/Auth issues to Firestore
  if (isAuthError) {
    await logCritical("FirebaseAuthError", {
      route: req.originalUrl,
      message: err.message,
      stack: err.stack
    });
  }

  // Client response
  res.status(statusCode).json({
    error: true,
    message: err.message || "Internal Server Error"
  });
}
