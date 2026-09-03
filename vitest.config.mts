import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    // Same "@/..." alias the app uses, so tests import the real modules
    // rather than a copy that can drift.
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The database tests talk to the real project and are skipped when its
    // credentials are absent, so `npm test` still works on a fresh clone.
    setupFiles: ["tests/setup.ts"],
  },
});
