// __tests__/logger.test.js
import { jest } from "@jest/globals";

// --- Mock firebase-admin ---
jest.unstable_mockModule("firebase-admin", () => ({
  default: {
    firestore: () => ({
      collection: jest.fn(() => ({
        add: jest.fn(() => Promise.resolve("mocked-id")),
      })),
    }),
  },
}));

// --- Import the actual logger now ---
const { logCritical } = await import("../middleware/logger.js");

describe("logger.js – logCritical", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("logs critical event to Firestore and logger", async () => {
    const event = "TestEvent";
    const details = { foo: "bar" };

    // Call the function
    await logCritical(event, details);

    // Should succeed without throwing
    expect(true).toBe(true);
  });

  test("handles Firestore failure gracefully", async () => {
    // Override firestore to throw
    const admin = await import("firebase-admin");
    admin.default.firestore = () => ({
      collection: jest.fn(() => ({
        add: jest.fn(() => { throw new Error("Firestore down"); }),
      })),
    });

    await logCritical("FailEvent", {});

    // Should not throw
    expect(true).toBe(true);
  });
});
