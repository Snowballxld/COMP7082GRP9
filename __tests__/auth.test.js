// __tests__/auth.test.js
import request from "supertest";
import express from "express";
import session from "express-session";
import authRouter from "../routes/auth.js";

// Mock Firebase Admin (ESM import)
import * as adminModule from "../config/firebase.js";
jest.mock("../config/firebase.js", () => ({
  default: {
    auth: () => ({
      verifyIdToken: jest.fn(() => Promise.resolve({ uid: "mockUid", email: "test@test.com" })),
      createSessionCookie: jest.fn(() => Promise.resolve("mockSessionCookie")),
    }),
  },
}));

// Mock User model
import User from "../models/user.js";
jest.mock("../models/user.js", () => {
  return jest.fn().mockImplementation(() => ({
    getProfile: jest.fn(() => Promise.resolve(null)),
    setProfile: jest.fn(() => Promise.resolve(true)),
  }));
});

// Mock middleware
import * as authMiddleware from "../middleware/authMiddleware.js";
jest.mock("../middleware/authMiddleware.js", () => ({
  verifyFirebaseToken: (req, res, next) => {
    req.user = { uid: "mockUid", email: "test@test.com" };
    next();
  },
}));

// Setup Express app for testing
const app = express();
app.use(express.json());
app.use(session({ secret: "test", resave: false, saveUninitialized: true }));
app.use("/auth", authRouter);

describe("Auth Routes", () => {
  it("GET /auth/test returns 200 and JSON", async () => {
    const res = await request(app).get("/auth/test");
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Token verified!");
    expect(res.body.user.test).toBe(true);
  });

  it("POST /auth/sessionLogin sets session and returns success", async () => {
    const res = await request(app)
      .post("/auth/sessionLogin")
      .send({ idToken: "mockToken" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
  });

  it("POST /auth/sessionLogout clears session", async () => {
    const agent = request.agent(app);

    await agent.post("/auth/sessionLogin").send({ idToken: "mockToken" });

    const res = await agent.post("/auth/sessionLogout");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("logged out");
  });

  it("POST /auth/verify returns verified user", async () => {
    const res = await request(app).post("/auth/verify").send({});
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("User verified");
    expect(res.body.user.uid).toBe("mockUid");
  });

  it("GET /auth/login renders login page if not logged in", async () => {
    const res = await request(app).get("/auth/login");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Login Page");
  });
});
