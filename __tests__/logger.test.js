// __tests__/logger.test.js
import { jest } from "@jest/globals";

// --- Mock firebase-admin before importing logger ---
const mockAdd = jest.fn().mockResolvedValue({});
const mockCollection = jest.fn(() => ({ add: mockAdd }));
await jest.unstable_mockModule("firebase-admin", () => ({
  default: {
    firestore: () => ({ collection: mockCollection }),
  },
}));

// --- Mock winston ---
const mockInfo = jest.fn();
const mockWarn = jest.fn();
const mockError = jest.fn();

await jest.unstable_mockModule("winston", () => ({
  createLogger: () => ({
    info: mockInfo,
    warn: mockWarn,
    error: mockError,
  }),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    printf: jest.fn(),
  },
  transports: {
    DailyRotateFile: jest.fn(),
    Console: jest.fn(),
  },
}));

// --- Mock morgan ---
await jest.unstable_mockModule("morgan", () => jest.fn(() => () => null));

// --- Mock chalk correctly (named exports, not default) ---
await jest.unstable_mockModule("chalk", () => ({
  red: (s) => s,
  yellow: (s) => s,
  cyan: (s) => s,
  green: (s) => s,
  gray: (s) => s,
  magenta: (s) => s,
}));

// --- Import the actual logger now ---
const { logCritical } = await import("../middleware/logger.js");

describe("logger.js – logCritical", () => {
  beforeEach(() => {
    mockAdd.mockClear();
    mockCollection.mockClear();
    mockWarn.mockClear();
    mockError.mockClear();
  });

  test("logs critical event to Firestore and calls logger.warn", async () => {
    const details = { foo: "bar" };
    await logCritical("TEST_EVENT", details);

    expect(mockCollection).toHaveBeenCalledWith("logs");
    expect(mockAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "TEST_EVENT",
        details,
        level: "critical",
        timestamp: expect.any(Date),
      })
    );
    expect(mockWarn).toHaveBeenCalledWith("Critical event logged to Firestore: TEST_EVENT");
  });

  test("handles Firestore errors gracefully", async () => {
    mockAdd.mockRejectedValueOnce(new Error("Firestore down"));
    await logCritical("FAIL_EVENT");

    expect(mockError).toHaveBeenCalledWith(
      expect.stringContaining("Failed to log critical event to Firestore")
    );
  });
});
