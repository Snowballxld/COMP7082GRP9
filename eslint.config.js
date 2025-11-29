import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  // Global ignores (replacement for .eslintignore)
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "build/**",
      "coverage/**",
      "public/vendor/**",
    ],
  },

  // Backend: Node ESM
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
  },

  // Frontend: browser JS
  {
    files: ["public/**/*.js"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        ...globals.browser,
        mapboxgl: "readonly",
        L: "readonly",
        LEVEL_FLOORPLAN_LINKS: "readonly",
      },
    },
  },

  // Tests: Jest in ESM files
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
  },
]);
