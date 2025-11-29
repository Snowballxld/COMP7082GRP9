import request from "supertest";
import app from "../server.js";

// Prevent Firebase from initializing during tests
process.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";

describe("Basic server routes", () => {
  
  test("GET / should return HTML and status 200", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("<!DOCTYPE"); // rendered EJS HTML
  });

  test("GET /health returns JSON {status: 'ok'}", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  test("GET /random-route should redirect to /", async () => {
    const res = await request(app).get("/random-route");
    expect(res.status).toBe(302);
    expect(res.header.location).toBe("/");
  });

});

describe("Protected routes", () => {
  test("GET /map redirects when session missing", async () => {
    const res = await request(app).get("/map");
    expect(res.status).toBe(302); // redirect to login
  });
});
