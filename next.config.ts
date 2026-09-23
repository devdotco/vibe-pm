import type { NextConfig } from "next";

/*
 * Stamps every asset request with the build's commit, so a request from a tab
 * running an older build is recognisable as skew rather than as a plain 404.
 *
 * Read at BUILD time only, which is correct rather than a shortcut: Next
 * serialises it into .next/required-server-files.json, and the standalone
 * server reads the value from there instead of re-evaluating this file. Build
 * and runtime therefore cannot disagree about it.
 *
 * The Dockerfile computes BUILD_ID, preferring Coolify's SOURCE_COMMIT and
 * falling back to a timestamp. It is deliberately NOT read from SOURCE_COMMIT
 * directly here: Coolify exposes that as a RUNTIME env var and does not pass it
 * as a build ARG, so this silently produced no deploymentId at all when it was
 * wired that way — the config looked right and stamped nothing. Any value
 * unique per build does the job; being the real commit is only a convenience
 * when reading logs.
 *
 * Left undefined rather than empty when absent (a local `next build`): an empty
 * deploymentId still appends a bare `?dpl=` to every asset URL.
 */
const deploymentId = process.env.BUILD_ID?.trim() || undefined;

const nextConfig: NextConfig = {
  ...(deploymentId ? { deploymentId } : {}),
  /*
   * Served from app.erp.io/pm rather than its own subdomain, so the suite
   * shares ONE origin — one session cookie and no cross-site hand-off.
   *
   * Keep in lockstep with BASE_PATH in src/lib/base-path.ts. Next exposes no
   * runtime accessor for this value, so the two are matched by hand.
   */
  basePath: "/pm",
  output: "standalone",
  experimental: {
    /*
     * src/proxy.ts runs on every request, and Next buffers a body for the proxy
     * only up to this size — past it the route handler receives a TRUNCATED
     * body, with a warning in the log and nothing in the response. The 10mb
     * default quietly corrupted any larger attachment. 50mb matches the
     * per-file limit enforced in lib/uploads.ts.
     */
    proxyClientMaxBodySize: "50mb",
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "utfs.io" },
      { protocol: "https", hostname: "uploadthing.com" },
    ],
  },
};

export default nextConfig;
