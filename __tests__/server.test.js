/**
 * server.test.js — ESM-compatible Jest test file
 *
 * Uses: jest.unstable_mockModule() instead of jest.mock()
 */

import request from "supertest";

// --- ESM mocks --- //
await jest.unstable_mockModule("../config/firebase.js", () => ({
  default: {
    firestore: () => ({
      collection: () => ({
        doc: () => ({
          get: jest.fn(),
          set: jest.fn(),
          update: jest.fn(),
        }),
        get: jest.fn(),
      }),
    }),
  },
}));

await jest.unstable_mockModule("../middleware/logger.js", () => ({
  requestLogger: (req, res, next) => next(),
}));

await jest.unstable_mockModule("../middleware/errorHandler.js", () => ({
  errorHandler: (err, req, res, next) => {
    res.status(500).json({ error: "Test error handler triggered" });
  },
}));

// After mocks → import the server (VERY IMPORTANT)
const { default: app } = await import("../server.js");

describe("SERVER.JS – Core Express Setup", () => {
  test("App loads successfully", () => {
    expect(app).toBeDefined();
  });

  test("GET /health returns JSON ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  test("EJS engine renders index page", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("<!DOCTYPE");
  });
});

describe("Session Middleware", () => {
  test("Session cookie should be created", async () => {
    const res = await request(app).get("/");
    const cookies = res.headers["set-cookie"] || [];
    const sid = cookies.find(c => c.includes("connect.sid"));
    expect(sid).toBeDefined();
  });
});

describe("Unknown Route Redirect", () => {
  test("GET /random/path redirects to /", async () => {
    const res = await request(app).get("/random/not-found-path");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/");
  });
});
