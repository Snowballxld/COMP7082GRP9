// __tests__/authMiddleware.test.js
import { jest } from '@jest/globals';
import { verifyFirebaseToken, checkSession } from '../middleware/authMiddleware.js';

// --- Mock Firebase admin ---
const mockVerifyIdToken = jest.fn();
jest.unstable_mockModule('../config/firebase.js', () => ({
  default: {
    auth: () => ({
      verifyIdToken: mockVerifyIdToken,
    }),
  },
}));

const admin = (await import('../config/firebase.js')).default;

describe("Auth Middleware", () => {
  let req, res, next;

  beforeEach(() => {
    req = { headers: { accept: "application/json" }, session: {}, xhr: false };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      redirect: jest.fn()
    };
    next = jest.fn();
    mockVerifyIdToken.mockReset();
  });

  // --- verifyFirebaseToken tests ---
  test("calls next() when valid token provided", async () => {
    req.headers.authorization = "Bearer valid-token";
    mockVerifyIdToken.mockResolvedValue({ uid: "123", email: "test@test.com" });

    await verifyFirebaseToken(req, res, next);

    expect(mockVerifyIdToken).toHaveBeenCalledWith("valid-token");
    expect(req.user).toEqual({ uid: "123", email: "test@test.com" });
    expect(next).toHaveBeenCalled();
  });

  test("returns 401 JSON when no token on API request", async () => {
    req.headers.accept = "application/json";

    await verifyFirebaseToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Not authenticated" });
  });

  test("redirects to login when no token on page request", async () => {
    req.headers.accept = "text/html";

    await verifyFirebaseToken(req, res, next);

    expect(res.redirect).toHaveBeenCalledWith("/auth/login");
  });

  test("returns 401 JSON on invalid token for API request", async () => {
    req.headers.authorization = "Bearer invalid-token";
    mockVerifyIdToken.mockRejectedValue(new Error("Invalid token"));

    await verifyFirebaseToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid token" });
  });

  test("redirects to login on invalid token for page request", async () => {
    req.headers.authorization = "Bearer invalid-token";
    req.headers.accept = "text/html";
    mockVerifyIdToken.mockRejectedValue(new Error("Invalid token"));

    await verifyFirebaseToken(req, res, next);

    expect(res.redirect).toHaveBeenCalledWith("/auth/login");
  });

  // --- checkSession tests ---
  test("checkSession calls next() when session user exists", () => {
    req.session.user = { uid: "123" };
    checkSession(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test("checkSession returns 401 JSON for API request when session missing", () => {
    req.headers.accept = "application/json";

    checkSession(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
  });

  test("checkSession redirects to login for page request when session missing", () => {
    req.headers.accept = "text/html";

    checkSession(req, res, next);

    expect(res.redirect).toHaveBeenCalledWith("/auth/login");
  });
});
