import { describe, it, expect, afterEach, vi } from "vitest";
import crypto from "crypto";

// WEBHOOK_SECRET is read from process.env at module load time, so each test
// that cares about a specific secret value resets the module registry and
// re-imports after setting (or clearing) the env var.
const ORIGINAL_SECRET = process.env.VIBE_WEBHOOK_SECRET;

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.VIBE_WEBHOOK_SECRET;
  else process.env.VIBE_WEBHOOK_SECRET = ORIGINAL_SECRET;
  vi.resetModules();
});

describe("verifyWebhookSignature", () => {
  it("fails closed when no secret is configured, for any signature", async () => {
    delete process.env.VIBE_WEBHOOK_SECRET;
    vi.resetModules();
    const { verifyWebhookSignature } = await import("./webhooks");

    expect(verifyWebhookSignature("body", "")).toBe(false);
    expect(verifyWebhookSignature("body", "0".repeat(64))).toBe(false);
    // Even a signature that would have been valid under SOME secret must
    // not be waved through just because none is configured.
    const wouldBeValid = crypto.createHmac("sha256", "anything").update("body").digest("hex");
    expect(verifyWebhookSignature("body", wouldBeValid)).toBe(false);
  });

  it("rejects a malformed signature without throwing", async () => {
    process.env.VIBE_WEBHOOK_SECRET = "test-secret";
    vi.resetModules();
    const { verifyWebhookSignature } = await import("./webhooks");

    const malformed = ["not-hex-at-all!!", "ab", "", "🙂".repeat(10), "g".repeat(64)];
    for (const sig of malformed) {
      expect(() => verifyWebhookSignature("body", sig)).not.toThrow();
      expect(verifyWebhookSignature("body", sig)).toBe(false);
    }
  });

  it("accepts a validly signed body", async () => {
    process.env.VIBE_WEBHOOK_SECRET = "test-secret";
    vi.resetModules();
    const { verifyWebhookSignature } = await import("./webhooks");

    const body = JSON.stringify({ event: "task.created", payload: { taskId: "t1" } });
    const sig = crypto.createHmac("sha256", "test-secret").update(body).digest("hex");
    expect(verifyWebhookSignature(body, sig)).toBe(true);
  });

  it("rejects a signature computed with the wrong secret", async () => {
    process.env.VIBE_WEBHOOK_SECRET = "test-secret";
    vi.resetModules();
    const { verifyWebhookSignature } = await import("./webhooks");

    const body = JSON.stringify({ event: "task.created" });
    const sig = crypto.createHmac("sha256", "wrong-secret").update(body).digest("hex");
    expect(verifyWebhookSignature(body, sig)).toBe(false);
  });

  it("rejects a signature computed over a different body", async () => {
    process.env.VIBE_WEBHOOK_SECRET = "test-secret";
    vi.resetModules();
    const { verifyWebhookSignature } = await import("./webhooks");

    const sig = crypto.createHmac("sha256", "test-secret").update("original").digest("hex");
    expect(verifyWebhookSignature("tampered", sig)).toBe(false);
  });
});

describe("isSafeWebhookUrl", () => {
  it("accepts a normal https url", async () => {
    const { isSafeWebhookUrl } = await import("./webhooks");
    expect(isSafeWebhookUrl("https://hooks.slack.com/services/T000/B000/xxx")).toBe(true);
  });

  it("rejects non-https protocols", async () => {
    const { isSafeWebhookUrl } = await import("./webhooks");
    expect(isSafeWebhookUrl("http://example.com/webhook")).toBe(false);
    expect(isSafeWebhookUrl("ftp://example.com/webhook")).toBe(false);
  });

  it("rejects loopback, private, and link-local hosts", async () => {
    const { isSafeWebhookUrl } = await import("./webhooks");
    const unsafe = [
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://127.0.0.2/x",
      "https://0.0.0.0/x",
      "https://169.254.169.254/latest/meta-data/", // cloud metadata endpoint
      "https://10.0.0.5/x",
      "https://172.16.0.5/x",
      "https://172.31.255.255/x",
      "https://192.168.1.5/x",
      "https://[::1]/x",
      "https://internal.local/x",
    ];
    for (const url of unsafe) {
      expect(isSafeWebhookUrl(url)).toBe(false);
    }
  });

  it("does not reject unrelated public hosts that merely start similarly", async () => {
    const { isSafeWebhookUrl } = await import("./webhooks");
    // 172.32.x.x is outside the private 172.16.0.0/12 range.
    expect(isSafeWebhookUrl("https://172.32.0.1/x")).toBe(true);
  });

  it("rejects malformed urls without throwing", async () => {
    const { isSafeWebhookUrl } = await import("./webhooks");
    expect(() => isSafeWebhookUrl("not a url")).not.toThrow();
    expect(isSafeWebhookUrl("not a url")).toBe(false);
  });
});
