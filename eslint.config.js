// eslint.config.js
import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  // ---------------------------------------
  // Backend: Node.js (ES Modules)
  // ---------------------------------------
  {
    files: ["**/*.js"],
    ignores: ["public/**"], // don't treat browser files as Node
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
  },

  // ---------------------------------------
  // Frontend: Browser (Mapbox, UI, etc.)
  // ---------------------------------------
  {
    files: ["public/**/*.js"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      // you can tweak browser-specific rules here later
      "no-undef": "warn",
    },
  },
]);
