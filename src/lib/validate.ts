import { z, ZodSchema } from 'zod';
import { NextResponse } from 'next/server';

export function validate<T>(schema: ZodSchema<T>, data: unknown):
  { success: true; data: T } | { success: false; response: NextResponse } {
  const result = schema.safeParse(data);
  if (!result.success) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Validation error', details: result.error.flatten() },
        { status: 400 }
      ),
    };
  }
  return { success: true, data: result.data };
}

export const CreateTaskSchema = z.object({
  title: z.string().min(1).max(500),
  projectId: z.string().uuid(),
  sectionId: z.string().uuid().optional(),
  description: z.string().max(50_000).optional(),
  status: z.enum(['not_started', 'in_progress', 'completed', 'blocked']).default('not_started'),
  priority: z.enum(['none', 'low', 'medium', 'high', 'urgent']).default('none'),
  assigneeId: z.string().uuid().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  labels: z.array(z.string().max(50)).max(10).default([]),
  estimatedMinutes: z.number().int().min(0).max(100_000).optional(),
  parentTaskId: z.string().uuid().optional(),
});

/**
 * The only fields PATCH /api/pm/tasks/[taskId] may write.
 *
 * It used to spread the request body straight into the update, so a caller
 * could set `orgId`, `projectId`, `createdBy` or `deletedAt` — including moving
 * a task into another organization. Moving between projects has its own route
 * (`move-project`) that checks membership; it is deliberately not here.
 * Unknown keys are stripped, not rejected, so an old client sending extra
 * fields keeps working.
 */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(50_000).nullable(),
  status: z.enum(['not_started', 'in_progress', 'completed', 'blocked']),
  priority: z.enum(['none', 'low', 'medium', 'high', 'urgent']),
  sectionId: z.string().uuid().nullable(),
  assigneeId: z.string().uuid().nullable(),
  dueDate: isoDate.nullable(),
  dueTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable(),
  startDate: isoDate.nullable(),
  labels: z.array(z.string().max(50)).max(50),
  estimatedMinutes: z.number().int().min(0).max(100_000).nullable(),
  actualMinutes: z.number().int().min(0).max(100_000).nullable(),
  customFields: z.record(z.string().max(200), z.union([z.string().max(5_000), z.number(), z.boolean(), z.null()])),
  parentTaskId: z.string().uuid().nullable(),
  isMilestone: z.boolean(),
}).partial();

export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5_000).optional(),
  teamId: z.string().uuid().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#2563eb'),
  icon: z.string().max(10).optional(),
  defaultView: z.enum(['list', 'board', 'calendar', 'timeline']).default('list'),
  isPublic: z.boolean().default(false),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const CommentSchema = z.object({
  content: z.string().min(1).max(50_000),
});

export const BulkActionSchema = z.object({
  taskIds: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum([
    'complete', 'assign', 'change_status', 'change_priority',
    'move_section', 'add_label', 'remove_label', 'delete',
  ]),
  value: z.string().optional(),
});

/**
 * PATCH allow-lists for the other `.set({...body})` mass-assignment routes
 * (orgId/projectId/id/createdBy — and anything else not listed — were all
 * writable before these existed; see the audit that added them). Same
 * reasoning as UpdateTaskSchema above: unknown keys are stripped, not
 * rejected, so an older client sending extra fields keeps working.
 */
export const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5_000).nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().max(10).nullable(),
  defaultView: z.enum(['list', 'board', 'calendar', 'timeline']),
  isPublic: z.boolean(),
  teamId: z.string().uuid().nullable(),
  startDate: isoDate.nullable(),
  dueDate: isoDate.nullable(),
  status: z.enum(['active', 'on_hold', 'completed', 'archived']),
}).partial();

export const UpdateGoalSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5_000).nullable(),
  dueDate: isoDate.nullable(),
  teamId: z.string().uuid().nullable(),
  status: z.enum(['on_track', 'at_risk', 'off_track', 'completed']),
  progressType: z.enum(['percent', 'number', 'boolean']),
  // The column is Postgres `numeric`, which drizzle types as string.
  progressValue: z.union([z.string(), z.number()]).transform(String),
  targetValue: z.union([z.string(), z.number()]).transform(String),
}).partial();

export const UpdateMilestoneSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5_000).nullable(),
  dueDate: isoDate,
}).partial();

export const UpdateTeamSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2_000).nullable(),
  icon: z.string().max(10).nullable(),
}).partial();

export const UpdateProjectSettingsSchema = z.object({
  messagingChannelId: z.string().max(200).nullable(),
  notifyOn: z.array(z.string().max(50)).max(20),
}).partial();

export const UpdateAutomationSchema = z.object({
  name: z.string().min(1).max(200),
  triggerType: z.string().min(1).max(100),
  triggerConditions: z.record(z.string(), z.unknown()).nullable(),
  actionType: z.string().min(1).max(100),
  actionParams: z.record(z.string(), z.unknown()).nullable(),
  isEnabled: z.boolean(),
}).partial();
