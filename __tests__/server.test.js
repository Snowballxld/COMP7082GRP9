// __tests__/server.test.js
import request from "supertest";
import app from "../server.js";

describe("SERVER.JS – Core Express Setup", () => {
  test("App instance exists", () => {
    expect(app).toBeDefined();
  });

  test("Session middleware is installed", () => {
    const middlewares = app._router.stack
      .filter(r => r.name === "session" || r.handle.name === "session");
    expect(middlewares.length).toBeGreaterThan(0);
  });
});

describe("Public routes", () => {
  test("GET / returns 200 and HTML content", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("<!DOCTYPE");
  });

  test("GET /about returns 200 and contains 'about'", async () => {
    const res = await request(app).get("/about");
    expect(res.status).toBe(200);
    expect(res.text.toLowerCase()).toContain("about");
  });

  test("GET /health returns JSON status ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("Protected routes (check session redirect)", () => {
  const protectedRoutes = ["/map", "/bcit-map", "/nodes", "/favorites"];

  protectedRoutes.forEach(route => {
    test(`GET ${route} redirects when session missing`, async () => {
      const res = await request(app).get(route);
      expect(res.status).toBe(302);
    });
  });
});

describe("Catch-all route", () => {
  test("GET /some/random/path redirects to /", async () => {
    const res = await request(app).get("/some/random/path");
    expect(res.status).toBe(302);
    expect(res.header.location).toBe("/");
  });
});
