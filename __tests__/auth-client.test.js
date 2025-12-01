/**
 * __tests__/auth-client.test.js
 *
 * Complete working test file for browser Firebase code.
 * Requires Jest in ESM mode ("type": "module" in package.json).
 */

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

// ---- Setup JSDOM DOM elements ----
document.body.innerHTML = `
  <form id="loginForm">
    <input id="email" value="test@test.com" />
    <input id="password" value="123456" />
    <button type="submit">Login</button>
  </form>

  <div id="error"></div>
  <button id="logoutBtn" style="display:none"></button>
`;

// Mock fetch because auth-client.js calls it
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ status: "ok" }),
  })
);

// ---- Import script after mocks and dom exist ----
await import("../public/js/auth-client.js");


// ----------------------
// Actual Tests
// ----------------------
describe("auth-client.js", () => {
  test("dummy test runs", () => {
    expect(true).toBe(true);
  });

  test("login form triggers Firebase signIn", async () => {
    const loginForm = document.getElementById("loginForm");

    // Submit event
    loginForm.dispatchEvent(new Event("submit"));

    // Let promises resolve
    await Promise.resolve();
    await Promise.resolve();

    // Check fetch call
    expect(global.fetch).toHaveBeenCalled();
  });
});
