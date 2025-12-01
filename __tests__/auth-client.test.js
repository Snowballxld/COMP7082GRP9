/**
 * @jest-environment jsdom
 */

import { jest } from "@jest/globals";

// --- Trick Jest into resolving URL imports ---
jest.mock(
  "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js",
  () => ({
    initializeApp: jest.fn(() => "mockApp"),
  }),
  { virtual: true }
);

jest.mock(
  "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js",
  () => ({
    getAuth: jest.fn(() => "mockAuth"),
    signInWithEmailAndPassword: jest.fn(() =>
      Promise.resolve({
        user: {
          getIdToken: jest.fn(() => Promise.resolve("mockToken")),
        },
      })
    ),
    signOut: jest.fn(() => Promise.resolve()),
  }),
  { virtual: true }
);

// --- Setup DOM required by the script ---
document.body.innerHTML = `
  <form id="loginForm">
    <input id="email" />
    <input id="password" />
    <button type="submit">Login</button>
  </form>

  <div id="error"></div>
  <button id="logoutBtn"></button>
`;

// Mock fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ ok: true })
  })
);

// Import AFTER mocks
await import("../public/js/auth-client.js");

describe("auth-client.js", () => {
  test("fake test works", () => {
    expect(true).toBe(true);
  });

  test("login triggers fetch()", async () => {
    const loginForm = document.getElementById("loginForm");
    loginForm.dispatchEvent(new Event("submit"));

    // Let async handlers resolve
    await Promise.resolve();
    await Promise.resolve();

    expect(global.fetch).toHaveBeenCalled();
  });
});
