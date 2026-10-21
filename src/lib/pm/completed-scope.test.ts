import { describe, it, expect } from "vitest";
import { parseCompletedScope } from "./completed-scope";

describe("parseCompletedScope", () => {
  it("passes the two narrowing scopes through", () => {
    expect(parseCompletedScope("none")).toBe("none");
    expect(parseCompletedScope("recent")).toBe("recent");
  });

  it("falls back to all, so callers that never asked keep every task", () => {
    expect(parseCompletedScope(null)).toBe("all");
    expect(parseCompletedScope("all")).toBe("all");
    expect(parseCompletedScope("bogus")).toBe("all");
  });
});
