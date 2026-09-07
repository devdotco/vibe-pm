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
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "utfs.io" },
      { protocol: "https", hostname: "uploadthing.com" },
    ],
  },
};

export default nextConfig;
