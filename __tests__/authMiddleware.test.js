// __tests__/authMiddleware.test.js
import { jest } from '@jest/globals';
import { expect, describe, test, beforeEach } from '@jest/globals';

// --- ESM async mock ---
const firebaseMock = {
  default: {
    auth: () => ({
      verifyIdToken: jest.fn((token) => {
        if (token === "valid-token") return Promise.resolve({ uid: "123" });
        return Promise.reject(new Error("Invalid token"));
      }),
    }),
  },
};

// Unstable mock module
await jest.unstable_mockModule('../config/firebase.js', () => firebaseMock);

// Import middleware after mock
const { verifyFirebaseToken, checkSession } = await import('../middleware/authMiddleware.js');

describe("Auth Middleware", () => {
  let req, res, next;

  beforeEach(() => {
    req = { headers: {}, session: {}, xhr: false };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn(), redirect: jest.fn() };
    next = jest.fn();
  });

  describe("verifyFirebaseToken", () => {
    test("calls next if valid token in headers", async () => {
      req.headers.authorization = "Bearer valid-token";
      await verifyFirebaseToken(req, res, next);
      expect(req.user).toEqual({ uid: "123" });
      expect(next).toHaveBeenCalled();
    });

    test("redirects if no token and page request", async () => {
      await verifyFirebaseToken(req, res, next);
      expect(res.redirect).toHaveBeenCalledWith("/auth/login");
      expect(next).not.toHaveBeenCalled();
    });

    test("returns 401 JSON if no token and API request", async () => {
      req.headers.accept = "application/json";
      await verifyFirebaseToken(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Not authenticated" });
    });

    test("returns 401 JSON if invalid token", async () => {
      req.headers.authorization = "Bearer invalid-token";
      req.headers.accept = "application/json";
      await verifyFirebaseToken(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid token" });
    });
  });

  describe("checkSession", () => {
    test("calls next if session user exists", () => {
      req.session.user = { uid: "123" };
      checkSession(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test("redirects to login if session user missing and page request", () => {
      checkSession(req, res, next);
      expect(res.redirect).toHaveBeenCalledWith("/auth/login");
      expect(next).not.toHaveBeenCalled();
    });

    test("returns 401 JSON if session user missing and API request", () => {
      req.headers.accept = "application/json";
      checkSession(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    });
  });
});
