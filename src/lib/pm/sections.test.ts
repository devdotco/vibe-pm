import { describe, it, expect } from "vitest";
import { hasNoVisibleSection, NO_SECTION_KEY, NO_SECTION_LABEL } from "./sections";

describe("hasNoVisibleSection", () => {
  const visible = new Set(["sec-todo", "sec-doing"]);

  it("buckets a task with no section at all", () => {
    // Imports, the service API and the chat webhook all create tasks this way.
    expect(hasNoVisibleSection(null, visible)).toBe(true);
    expect(hasNoVisibleSection(undefined, visible)).toBe(true);
    expect(hasNoVisibleSection("", visible)).toBe(true);
  });

  it("buckets a task whose section is archived, so absent from the view", () => {
    expect(hasNoVisibleSection("sec-archived", visible)).toBe(true);
  });

  it("leaves a task in a section that is on screen alone", () => {
    expect(hasNoVisibleSection("sec-todo", visible)).toBe(false);
    expect(hasNoVisibleSection("sec-doing", visible)).toBe(false);
  });

  it("buckets every task when the project has no sections yet", () => {
    expect(hasNoVisibleSection("sec-todo", new Set())).toBe(true);
  });

  it("keeps a bucket key that cannot collide with a section uuid", () => {
    expect(NO_SECTION_KEY).not.toMatch(/^[0-9a-f-]{36}$/);
    expect(NO_SECTION_LABEL.length).toBeGreaterThan(0);
  });
});
