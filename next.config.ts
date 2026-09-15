import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
