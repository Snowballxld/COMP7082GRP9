// __tests__/authMiddleware.test.js
import { verifyFirebaseToken, checkSession } from "../middleware/authMiddleware.js";

// --- Mock Firebase Admin ---
jest.mock("../config/firebase.js", () => ({
  default: {
    auth: () => ({
      verifyIdToken: jest.fn((token) => {
        if (token === "valid-token") return Promise.resolve({ uid: "123" });
        return Promise.reject(new Error("Invalid token"));
      }),
    }),
  },
}));

describe("Auth Middleware", () => {
  let req, res, next;

  beforeEach(() => {
   
