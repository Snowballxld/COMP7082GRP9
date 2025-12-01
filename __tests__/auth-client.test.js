// __tests__/auth-client.test.js
/**
 * @jest-environment jsdom
 */

import { jest } from "@jest/globals";

// ------------------------------
// Mock Firebase browser SDK
// ------------------------------
const mockGetIdToken = jest.fn(() => Promise.resolve("mockToken"));
const mockSignIn = jest.fn(() =>
  Promise.resolve({ user: { getIdToken: mockGetIdToken } })
);
const mockSignOut = jest.fn(() => Promise.resolve());

global.initializeApp = jest.fn(() => "mockApp");
global.getAuth = jest.fn(() => "mockAuth");
global.signInWithEmailAndPassword = mockSignIn;
global.signOut = mockSignOut;

// Mock DOM elements for login form
document.body.innerHTML = `
  <form id="loginForm">
    <input id="email" />
    <input id="password" />
  </form>
  <div id="error"></div>
  <button id="logoutBtn" style="display:none"></button>
`;

// Mock fetch for /auth/verify and /auth/sessionLogout
global.fetch = jest.fn((url, options) => {
  if (url === "/auth/verify") {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
  }
  if (url === "/auth/sessionLogout") {
    return Promise.resolve({ ok: true });
  }
  return Promise.reject(new Error("Unknown URL"));
});

// ------------------------------
// Import your auth-client script AFTER mocks
// ------------------------------
import "../public/js/auth-client.js";

// ------------------------------
// Tests
// ------------------------------
describe("auth-client", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  test("login form calls Firebase and fetch", async () => {
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const loginForm = document.getElementById("loginForm");

    emailInput.value = "test@example.com";
    passwordInput.value = "password123";

    // Submit the form
    await loginForm.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    );

    // Check Firebase auth called
    expect(mockSignIn).toHaveBeenCalledWith(
      "mockAuth",
      "test@example.com",
      "password123"
    );

    // Check getIdToken called
    expect(mockGetIdToken).toHaveBeenCalled();

    // Check fetch to /auth/verify
    expect(fetch).toHaveBeenCalledWith("/auth/verify", expect.any(Object));

    // Check localStorage updated
    expect(localStorage.getItem("user")).toBe("true");

    // Check logout button shown
    expect(document.getElementById("logoutBtn").style.display).toBe("block");
  });

  test("logout clears session and localStorage", async () => {
    const logoutBtn = document.getElementById("logoutBtn");
    logoutBtn.style.display = "block"; // make sure it's visible

    await logoutBtn.click();

    // Check fetch to logout
    expect(fetch).toHaveBeenCalledWith("/auth/sessionLogout", { method: "POST" });

    // Check localStorage cleared
    expect(localStorage.getItem("user")).toBe(null);

    // Check login form visible again
    expect(document.getElementById("loginForm").style.display).toBe("block");
    expect(logoutBtn.style.display).toBe("none");
  });
});
