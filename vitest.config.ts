import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Minimal config for the pure-logic unit tests added alongside the
 * multi-tenancy/auth fixes (see AGENTS.md security notes). Node environment
 * — nothing here touches the DOM. The "@/" alias mirrors tsconfig.json's
 * paths so route/lib modules can be imported the same way the app does.
 */
export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
