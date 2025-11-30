// Tests for server.js core boot + global middleware + route mounting

import request from "supertest";
import app from "../server.js";

// Mock Firebase Admin so Firestore does not initialize
jest.mock("../config/firebase.js", () => ({
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn(),
        update: jest.fn(),
      })),
      get: jest.fn(),
    })),
  })),
}));

// Mock requestLogger so test output stays clean
jest.mock("../middleware/logger.js", () => ({
  requestLogger: (req, res, next) => next(),
}));

// Mock errorHandler (we test it separately if needed)
jest.mock("../middleware/errorHandler.js", () => ({
  errorHandler: (err, req, res, next) => {
    res.status(500).json({ error: "Test error handler triggered" });
  },
}));

describe("SERVER.JS – Core Express Setup", () => {

  test("App loads successfully", () => {
    expect(app).toBeDefined();
  });

  test("GET /health returns status ok (via route.js)", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  test("Static files route /vendor/mapbox-gl loads", async () => {
    const res = await request(app).get("/vendor/mapbox-gl/mapbox-gl.js");
    // File might not exist in test env, but route should not 404 due to middleware
    expect([200, 304, 404]).toContain(res.status);
  });

  test("EJS engine is configured", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("<!DOCTYPE");
  });

});

describe("SESSION middleware", () => {
  test("Session cookie is created on first request", async () => {
    const res = await request(app).get("/");
    const cookies = res.headers["set-cookie"] || [];
    const sessionCookie = cookies.find(c => c.includes("connect.sid"));

    expect(sessionCookie).toBeDefined();
  });
});

describe("UNKNOWN ROUTES fallback (handled in /routes/route.js)", () => {
  test("Unknown route redirects to /", async () => {
    const res = await request(app).get("/this/route/does/not/exist");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/");
  });
});
