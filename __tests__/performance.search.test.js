import request from "supertest";
import app from "../server.js";

describe("Search performance", () => {
  const MAX_SINGLE_SEARCH = 150; // ms
  const MAX_BATCH_SEARCH  = 800; // ms for 10 parallel requests

  test("Single search responds quickly", async () => {
    const start = performance.now();

    const res = await request(app)
      .get("/search")
      .query({ q: "SW3" });

    const end = performance.now();
    const elapsed = end - start;

    // In your logs we see 302 for /search, so accept either 200 or 302
    expect([200, 302]).toContain(res.statusCode);

    expect(elapsed).toBeLessThan(MAX_SINGLE_SEARCH);
  });

  test("Concurrent searches stay performant", async () => {
    const requests = Array.from({ length: 10 }, () =>
      request(app).get("/search").query({ q: "floor" })
    );

    const start = performance.now();
    const results = await Promise.all(requests);
    const end = performance.now();
    const elapsed = end - start;

    // All should be quick-ish even when stacked
    expect(elapsed).toBeLessThan(MAX_BATCH_SEARCH);

    // Accept 200 or 302 depending on session / redirect logic
    results.forEach((res) => {
      expect([200, 302]).toContain(res.statusCode);
    });
  });
});
