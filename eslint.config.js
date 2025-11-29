// eslint.config.js
import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  // Global ignores (replaces .eslintignore)
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "build/**",
      "coverage/**",
      "public/vendor/**",
      "public/js/config.js", // ignore this legacy/browser-unfriendly file
    ],
  },

  // ------------------------------
  // Backend: Node (ES modules)
  // ------------------------------
  {
    files: ["**/*.js"],
    ignores: ["public/**", "__tests__/**"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // allow unused args when prefixed with "_"
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },

  // ------------------------------
  // Frontend: browser ESM (public/js)
  // ------------------------------
  {
    files: ["public/**/*.js"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module", // <- fixes "import/export only with sourceType: module"
      globals: {
        ...globals.browser,
        mapboxgl: "readonly",
        L: "readonly",
        LEVEL_FLOORPLAN_LINKS: "readonly",
      },
    },
    rules: {
      "no-undef": "warn",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },

  // ------------------------------
  // Tests: Jest (ESM)
  // ------------------------------
  {
    files: ["__tests__/**/*.js"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.jest, // describe, test, expect, etc.
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
]);
