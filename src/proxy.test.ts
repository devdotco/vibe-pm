import { describe, it, expect } from "vitest";
import { isPublicPath } from "./proxy";

describe("isPublicPath", () => {
  it("keeps every genuinely public path working", () => {
    const publicPaths = [
      "/api/module-links",
      "/api/auth/callback",
      "/api/auth/send-magic",
      "/api/auth/verify",
      "/sign-in",
      "/api/pm/public",
      "/api/pm/public/tasks",
      "/api/pm/public/users",
      "/api/pm/webhook",
      "/api/pm/webhook/messaging",
      "/api/pm/cron",
      "/api/pm/cron/webhooks",
      "/api/pm/cron/overdue",
      "/api/health",
      "/api/pusher",
      "/api/pusher/auth",
      "/api/webhooks/email/inbound",
    ];
    for (const p of publicPaths) {
      expect(isPublicPath(p)).toBe(true);
    }
  });

  it("does not treat /api/pm/webhooks/messaging as public via the singular prefix", () => {
    // This is the actual bug: a bare startsWith("/api/pm/webhook") also
    // matches "/api/pm/webhooks/messaging" because "webhooks" starts with
    // "webhook". The plural route is HMAC-gated, not bearer-token gated, and
    // its exposure here was never a deliberate decision — see proxy.ts.
    expect(isPublicPath("/api/pm/webhooks/messaging")).toBe(false);
  });

  it("does not treat an arbitrary longer path as public via a prefix collision", () => {
    expect(isPublicPath("/api/pm/webhooksomethingelse")).toBe(false);
    expect(isPublicPath("/sign-instant-nonsense")).toBe(false);
    expect(isPublicPath("/api/pm/publicity")).toBe(false);
  });

  it("still allows real subpaths of prefix-style public entries", () => {
    expect(isPublicPath("/api/pm/public/tasks/123/complete")).toBe(true);
    expect(isPublicPath("/api/pm/cron/webhooks")).toBe(true);
  });

  it("rejects private application paths", () => {
    const privatePaths = [
      "/api/pm/tasks",
      "/api/pm/projects/123",
      "/api/pm/webhooks/messaging",
      "/home",
      "/projects/123",
      "/tasks/123",
      "/api/pm/debug-auth",
    ];
    for (const p of privatePaths) {
      expect(isPublicPath(p)).toBe(false);
    }
  });
});
