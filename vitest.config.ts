import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Node environment — nothing here touches the DOM. Both layouts are picked up:
 * `tests/` (the forms logic) and `src/**` co-located tests (the multi-tenancy
 * and auth fixes). The "@/" alias mirrors tsconfig.json so modules import the
 * same way the app does.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
