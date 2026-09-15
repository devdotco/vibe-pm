import { describe, it, expect } from "vitest";
import { classifyChannel, projectChannel, taskChannel, channelChannel } from "./server";

describe("channel name builders", () => {
  it("produce private-prefixed names", () => {
    expect(projectChannel("proj-1", "org-1")).toBe("private-org-org-1-project-proj-1");
    expect(channelChannel("chan-1", "org-1")).toBe("private-org-org-1-channel-chan-1");
    expect(taskChannel("11111111-1111-1111-1111-111111111111")).toBe(
      "private-task-11111111-1111-1111-1111-111111111111"
    );
  });
});

describe("classifyChannel", () => {
  const TASK_ID = "11111111-1111-1111-1111-111111111111";

  it("authorizes an org channel that matches the caller's own org", () => {
    const result = classifyChannel(`private-org-org-1-project-proj-1`, "org-1");
    expect(result).toEqual({ kind: "org", authorized: true });
  });

  it("refuses an org channel for a DIFFERENT org", () => {
    const result = classifyChannel(`private-org-org-2-project-proj-1`, "org-1");
    expect(result).toEqual({ kind: "org", authorized: false });
  });

  it("identifies a task channel for a separate org lookup, never deciding from the name alone", () => {
    const result = classifyChannel(`private-task-${TASK_ID}`, "org-1");
    expect(result).toEqual({ kind: "task", taskId: TASK_ID });
  });

  it("does not authorize a plain (non-private) channel name", () => {
    // These are the pre-fix channel shapes. If either of these were ever
    // classified as authorized, a public Pusher channel would be reachable
    // with no auth call at all — the original bug.
    expect(classifyChannel(`org-org-1-project-proj-1`, "org-1")).toEqual({ kind: "unknown" });
    expect(classifyChannel(`task-${TASK_ID}`, "org-1")).toEqual({ kind: "unknown" });
  });

  it("does not misparse an arbitrary channel name as a task id", () => {
    expect(classifyChannel("private-task-not-a-uuid", "org-1")).toEqual({ kind: "unknown" });
  });
});
