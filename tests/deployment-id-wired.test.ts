import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * `deploymentId` is what stamps every asset URL, so a tab running an older build
 * is recognisable as skew rather than as a plain 404. It only works if the value
 * actually reaches `next build`, and getting that wrong fails SILENTLY: the
 * build succeeds, next.config.ts still reads correct, and nothing is stamped.
 *
 * That is exactly what shipped the first time. next.config.ts read
 * SOURCE_COMMIT, which Coolify exposes to the RUNNING container but does not
 * pass as a build arg, so the value was empty at build time and no `?dpl=`
 * appeared on anything. It was only caught by grepping the deployed HTML.
 *
 * These two assertions are the join between the Dockerfile and the config. They
 * cannot prove a deploy stamped assets, but they do fail if the wiring is ever
 * pulled apart again.
 */
describe("deploymentId is wired from the Dockerfile through to next.config", () => {
  const dockerfile = readFileSync("Dockerfile", "utf8");
  const nextConfig = readFileSync("next.config.ts", "utf8");

  it("next.config.ts sets deploymentId from BUILD_ID", () => {
    expect(nextConfig).toMatch(/process\.env\.BUILD_ID/);
    expect(nextConfig).toMatch(/deploymentId/);
  });

  it("the Dockerfile puts BUILD_ID in the environment of `npm run build`", () => {
    /*
     * Same line as the build: an `ENV`/`ARG` on its own would not prove the
     * value survives to the command that needs it, which is the failure this
     * test exists for.
     */
    expect(dockerfile).toMatch(/BUILD_ID=.*npm run build/);
  });

  it("the Dockerfile falls back when SOURCE_COMMIT is absent or empty", () => {
    // `:-` and not `-`: Coolify may pass the arg through as an empty string,
    // which `-` would accept as a real value and stamp nothing.
    expect(dockerfile).toMatch(/\$\{SOURCE_COMMIT:-/);
  });
});
