import { describe, it, expect } from "vitest";
import {
  UpdateTaskSchema,
  UpdateProjectSchema,
  UpdateGoalSchema,
  UpdateMilestoneSchema,
  UpdateTeamSchema,
  UpdateAutomationSchema,
} from "./validate";

/**
 * The whole point of these schemas is that unknown keys are stripped, not
 * merely ignored by convention — a caller sending orgId/id/createdBy (the
 * actual bug in every route these gate) must never see it survive parsing.
 */
describe("PATCH allow-list schemas strip fields outside the allow-list", () => {
  it("UpdateTaskSchema drops orgId/projectId/createdBy/id", () => {
    const result = UpdateTaskSchema.safeParse({
      title: "Renamed",
      orgId: "attacker-org",
      projectId: "someone-elses-project",
      createdBy: "someone-else",
      id: "spoofed-id",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ title: "Renamed" });
      expect(result.data).not.toHaveProperty("orgId");
      expect(result.data).not.toHaveProperty("projectId");
      expect(result.data).not.toHaveProperty("createdBy");
    }
  });

  it("UpdateProjectSchema drops orgId/id/createdBy/completedAt", () => {
    const result = UpdateProjectSchema.safeParse({
      name: "Renamed",
      orgId: "attacker-org",
      createdBy: "someone-else",
      completedAt: "2020-01-01T00:00:00Z",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "Renamed" });
    }
  });

  it("UpdateGoalSchema drops orgId/ownerId", () => {
    const result = UpdateGoalSchema.safeParse({
      status: "at_risk",
      orgId: "attacker-org",
      ownerId: "someone-else",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ status: "at_risk" });
    }
  });

  it("UpdateMilestoneSchema drops status/reachedAt (owned by the reach endpoint)", () => {
    const result = UpdateMilestoneSchema.safeParse({
      title: "Renamed",
      status: "reached",
      reachedAt: "2020-01-01T00:00:00Z",
      orgId: "attacker-org",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ title: "Renamed" });
    }
  });

  it("UpdateTeamSchema drops orgId/createdBy", () => {
    const result = UpdateTeamSchema.safeParse({
      name: "Renamed",
      orgId: "attacker-org",
      createdBy: "someone-else",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: "Renamed" });
    }
  });

  it("UpdateAutomationSchema drops projectId/orgId/runCount/lastRunAt", () => {
    const result = UpdateAutomationSchema.safeParse({
      isEnabled: false,
      projectId: "someone-elses-project",
      orgId: "attacker-org",
      runCount: 999,
      lastRunAt: "2020-01-01T00:00:00Z",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ isEnabled: false });
    }
  });

  it("rejects an invalid status value rather than silently coercing it", () => {
    const result = UpdateProjectSchema.safeParse({ status: "not-a-real-status" });
    expect(result.success).toBe(false);
  });
});
