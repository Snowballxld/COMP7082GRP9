import { jest } from "@jest/globals";     // <-- REQUIRED for ESM tests
import request from "supertest";

// ------------------------
// Mock Needed Modules
// ------------------------
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

// Import the server AFTER mocks
const { default: app } = await import("../server.js");

// ------------------------
// Test Suites
// ------------------------
describe("SERVER.JS – Core Express Setup", () => {
  test("App loads successfully", () => {
    expect(app).toBeDefined();
  });

  test("GET /health returns JSON ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  test("EJS index page renders", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("<!DOCTYPE");
  });
});

describe("Session Middleware", () => {
  test("Session cookie is created", async () => {
    const res = await request(app).get("/");
    const cookies = res.headers["set-cookie"] || [];
    const sid = cookies.find((c) => c.includes("connect.sid"));
    expect(sid).toBeDefined();
  });
});

describe("Unknown Route", () => {
  test("GET /non-existent redirects to /", async () => {
    const res = await request(app).get("/does/not/exist");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/");
  });
});
