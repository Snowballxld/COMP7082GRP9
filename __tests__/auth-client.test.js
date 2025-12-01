// __tests__/auth-client.test.js
// ESM MODE: must import jest explicitly
import { jest } from "@jest/globals";

// Mock Firebase CDN modules BEFORE importing the script
jest.unstable_mockModule(
  "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js",
  () => ({
    initializeApp: jest.fn(() => "mockApp"),
  })
);

jest.unstable_mockModule(
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
  })
);

// ---- Setup DOM ----
document.body.innerHTML = `
  <form id="loginForm">
    <input id="email" value="test@test.com" />
    <input id="password" value="123456" />
    <button type="submit">Login</button>
  </form>

  <div id="error"></div>
  <button id="logoutBtn" style="display:none"></button>
`;

// Mock fetch globally
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ status: "ok" }),
  })
);

// Import the script after mocks + DOM exist
await import("../public/js/auth-client.js");


// ----------------------
// TESTS
// ----------------------
describe("auth-client.js", () => {
  test("simple test", () => {
    expect(true).toBe(true);
  });

  test("login triggers Firebase signInWithEmailAndPassword", async () => {
    const loginForm = document.getElementById("loginForm");

    loginForm.dispatchEvent(new Event("submit"));

    // allow promises to resolve
    await Promise.resolve();
    await Promise.resolve();

    expect(global.fetch).toHaveBeenCalled();
  });
});
