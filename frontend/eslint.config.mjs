import globals from "globals";
import js from "@eslint/js";
import ts from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  {
    files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
    languageOptions: {
      parser: tsParser, // Use TypeScript parser for TS/JS files
      globals: {
        ...globals.browser, // Include browser globals
        ...globals.node, // Include Node.js globals
      },
    },
    settings: {
      react: {
        version: "detect", // Automatically detect the React version
      },
    },
    plugins: {
      react,
      "@typescript-eslint": ts,
      "react-hooks": reactHooks,
    },
    rules: {
      ...js.configs.recommended.rules, // JS recommended rules
      ...ts.configs.recommended.rules, // TS recommended rules
      ...react.configs.recommended.rules, // React recommended rules
      "react-hooks/rules-of-hooks": "error", // Enforce the rules of hooks
      "react-hooks/exhaustive-deps": "error", // Warn on missing dependencies in useEffect
      "no-undef": "off", // Disable no-undef for TypeScript types like NodeJS
    },
  },
];
