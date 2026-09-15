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
