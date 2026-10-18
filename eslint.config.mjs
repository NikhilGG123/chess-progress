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
    // Cloudflare's build output. Linting it reports some 30,000 problems in
    // bundled third-party code and buries anything real in ours.
    ".open-next/**",
    ".wrangler/**",
    "coverage/**",
    // Local editor tooling, gitignored and not part of the app.
    ".claude/**",
  ]),
]);

export default eslintConfig;
