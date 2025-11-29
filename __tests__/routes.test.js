// __tests__/routes.test.js
import request from "supertest";
import app from "../server.js";

describe("Public routes", () => {
  test("GET / should render index page", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("<!DOCTYPE"); // EJS-rendered HTML
  });

  test("GET /about should render About page", async () => {
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

describe("Protected routes (checkSession)", () => {
  test("GET /map redirects when session missing", async () => {
    const res = await request(app).get("/map");
    expect(res.status).toBe(302);
  });

  test("GET /bcit-map redirects when session missing", async () => {
    const res = await request(app).get("/bcit-map");
    expect(res.status).toBe(302);
  });

  test("GET /nodes redirects when session missing", async () => {
    const res = await request(app).get("/nodes");
    expect(res.status).toBe(302);
  });

  test("GET /favorites redirects when session missing", async () => {
    const res = await request(app).get("/favorites");
    expect(res.status).toBe(302);
  });
});

describe("Catch-all route", () => {
  test("GET /some/random/path redirects to /", async () => {
    const res = await request(app).get("/some/random/path");
    expect(res.status).toBe(302);
    expect(res.header.location).toBe("/");
  });
});
