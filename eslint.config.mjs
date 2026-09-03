import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
  ]),
  {
    rules: {
      // Syncing local state from the URL or localStorage inside an effect is intentional in the
      // shells, filters and theme toggle. Keep it visible as a warning rather than a build blocker.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
