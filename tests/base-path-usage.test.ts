import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `withBase` belongs on strings the framework does not rewrite — an `<a href>`,
 * a `window.location`, a fetch path. It must NEVER wrap an argument to
 * `router.push` / `router.replace`: Next adds the basePath to those itself, so
 * the result was `/pm/pm/forms/...`, which 404s. That shipped once.
 */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return entry === "node_modules" ? [] : walk(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

describe("withBase is not applied to router navigation", () => {
  const offenders = walk("src").filter((file) =>
    /router\.(push|replace)\(\s*withBase\(/.test(readFileSync(file, "utf8")),
  );

  it("finds no router.push(withBase(...)) anywhere in src", () => {
    expect(offenders).toEqual([]);
  });
});
