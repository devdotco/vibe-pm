import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * start.sh applies migrations BY NAME — there is no migrations table, and it
 * greps away every error. A file that is not named in it simply never runs,
 * and the app then 500s on a table that exists only in the repo.
 *
 * That has now happened twice: 0004 (recorded in its own comment) and 0006,
 * which shipped in the image and left `form_templates` missing in production.
 * This test is the guard neither of those had.
 */
describe("start.sh runs every migration", () => {
  const startSh = readFileSync("start.sh", "utf8");
  const files = readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort();

  it("finds migration files to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("applies %s", (file) => {
    expect(startSh).toContain(file);
  });

  it("names each migration exactly once", () => {
    for (const file of files) {
      expect(startSh.split(file).length - 1, `${file} is named more than once`).toBe(1);
    }
  });
});
