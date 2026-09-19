import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", ".test-build/**", "node_modules/**", ".husky/_/**"] },
  {
    files: ["**/*.{js,mjs,ts}"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["**/*.ts"],
    extends: [tseslint.configs.recommended],
  },
  {
    files: ["tests/**/*.ts"],
    /* Output assertions intentionally match ANSI escapes and exact indentation. */
    rules: { "no-control-regex": "off", "no-regex-spaces": "off" },
  },
);
