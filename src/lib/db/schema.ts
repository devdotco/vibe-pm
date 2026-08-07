import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  doublePrecision,
  timestamp,
  date,
  jsonb,
  uniqueIndex,
  index,
  numeric,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ── Teams ─────────────────────────────────────────────────────────────────────

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: text("org_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon"),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const teamMembers = pgTable(
  "team_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    orgId: text("org_id").notNull(),
    userId: uuid("user_id").notNull(),
    role: text("role").default("member").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("team_members_team_user_idx").on(t.teamId, t.userId)]
);

// ── Projects ──────────────────────────────────────────────────────────────────

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: text("org_id").notNull(),
    teamId: uuid("team_id").references(() => teams.id),
    name: text("name").notNull(),
    description: text("description"),
    color: text("color").default("#2f5cff").notNull(),
    icon: text("icon"),
    status: text("status").default("active").notNull(),
    defaultView: text("default_view").default("list").notNull(),
    isPublic: boolean("is_public").default(false).notNull(),
    startDate: date("start_date"),
    dueDate: date("due_date"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("projects_org_status_idx").on(t.orgId, t.status),
    index("projects_team_idx").on(t.teamId),
  ]
);

export const projectMembers = pgTable(
  "project_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    orgId: text("org_id").notNull(),
    userId: uuid("user_id").notNull(),
    role: text("role").default("editor").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("project_members_project_user_idx").on(t.projectId, t.userId)]
);

export const projectSettings = pgTable("project_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: "cascade" }),
  orgId: text("org_id").notNull(),
  messagingChannelId: text("messaging_channel_id"),
  notifyOn: text("notify_on")
    .array()
    .default(["task.created", "task.completed", "task.overdue"])
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Sections ──────────────────────────────────────────────────────────────────

export const sections = pgTable(
  "sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    orgId: text("org_id").notNull(),
    name: text("name").notNull(),
    position: doublePrecision("position").default(0).notNull(),
    color: text("color"),
    isArchived: boolean("is_archived").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("sections_project_position_idx").on(t.projectId, t.position)]
);

// ── Tasks ─────────────────────────────────────────────────────────────────────

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id").references(() => sections.id),
    orgId: text("org_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").default("not_started").notNull(),
    priority: text("priority").default("none").notNull(),
    assigneeId: uuid("assignee_id"),
    dueDate: date("due_date"),
    startDate: date("start_date"),
    position: doublePrecision("position").default(0).notNull(),
    parentTaskId: uuid("parent_task_id"),
    isMilestone: boolean("is_milestone").default(false).notNull(),
    labels: text("labels").array().default([]).notNull(),
    estimatedMinutes: integer("estimated_minutes"),
    actualMinutes: integer("actual_minutes"),
    customFields: jsonb("custom_fields").default({}).notNull(),
    sourceMessageId: text("source_message_id"),
    sourceChannelId: text("source_channel_id"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: uuid("completed_by"),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("tasks_project_section_position_idx").on(t.projectId, t.sectionId, t.position),
    index("tasks_assignee_due_idx").on(t.assigneeId, t.dueDate),
    index("tasks_org_status_idx").on(t.orgId, t.status),
    index("tasks_parent_idx").on(t.parentTaskId),
    index("tasks_source_message_idx").on(t.sourceMessageId),
  ]
);

export const taskAssignees = pgTable(
  "task_assignees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    orgId: text("org_id").notNull(),
    userId: uuid("user_id").notNull(),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow().notNull(),
    assignedBy: uuid("assigned_by"),
  },
  (t) => [uniqueIndex("task_assignees_task_user_idx").on(t.taskId, t.userId)]
);

export const taskDependencies = pgTable(
  "task_dependencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id").notNull(),
    dependsOnTaskId: uuid("depends_on_task_id").notNull(),
    orgId: text("org_id").notNull(),
    type: text("type").default("finish_to_start").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("task_deps_unique_idx").on(t.taskId, t.dependsOnTaskId)]
);

// ── Task Activity & Comments ───────────────────────────────────────────────────

export const taskComments = pgTable("task_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  orgId: text("org_id").notNull(),
  userId: uuid("user_id").notNull(),
  content: text("content").notNull(),
  source: text("source").default("app").notNull(), // 'app' | 'email'
  isEdited: boolean("is_edited").default(false).notNull(),
  editedAt: timestamp("edited_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const taskAttachments = pgTable("task_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  orgId: text("org_id").notNull(),
  userId: uuid("user_id").notNull(),
  url: text("url").notNull(),
  filename: text("filename").notNull(),
  fileType: text("file_type").notNull(),
  fileSize: integer("file_size"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const taskActivity = pgTable(
  "task_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    orgId: text("org_id").notNull(),
    userId: uuid("user_id").notNull(),
    action: text("action").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("task_activity_task_idx").on(t.taskId, t.createdAt),
    index("task_activity_project_idx").on(t.projectId, t.createdAt),
  ]
);

// ── Milestones ────────────────────────────────────────────────────────────────

export const milestones = pgTable("milestones", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  orgId: text("org_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: date("due_date").notNull(),
  status: text("status").default("upcoming").notNull(),
  reachedAt: timestamp("reached_at", { withTimezone: true }),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Goals ─────────────────────────────────────────────────────────────────────

export const goals = pgTable("goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: text("org_id").notNull(),
  teamId: uuid("team_id").references(() => teams.id),
  title: text("title").notNull(),
  description: text("description"),
  ownerId: uuid("owner_id").notNull(),
  dueDate: date("due_date"),
  status: text("status").default("on_track").notNull(),
  progressType: text("progress_type").default("percent").notNull(),
  progressValue: numeric("progress_value").default("0").notNull(),
  targetValue: numeric("target_value").default("100").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const goalProjectLinks = pgTable(
  "goal_project_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => goals.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    orgId: text("org_id").notNull(),
  },
  (t) => [uniqueIndex("goal_project_unique_idx").on(t.goalId, t.projectId)]
);

// ── Automations ────────────────────────────────────────────────────────────────

export const automations = pgTable("automations", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  orgId: text("org_id").notNull(),
  name: text("name").notNull(),
  triggerType: text("trigger_type").notNull(),
  triggerConditions: jsonb("trigger_conditions"),
  actionType: text("action_type").notNull(),
  actionParams: jsonb("action_params"),
  isEnabled: boolean("is_enabled").default(true).notNull(),
  runCount: integer("run_count").default(0).notNull(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdBy: uuid("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Notifications ──────────────────────────────────────────────────────────────

export const pmNotifications = pgTable(
  "pm_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    orgId: text("org_id").notNull(),
    type: text("type").notNull(),
    taskId: uuid("task_id"),
    projectId: uuid("project_id"),
    triggeredByUserId: uuid("triggered_by_user_id"),
    isRead: boolean("is_read").default(false).notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("pm_notifications_user_idx").on(t.userId, t.isRead, t.createdAt)]
);

// ── Webhook Outbox ─────────────────────────────────────────────────────────────

export const webhookOutbox = pgTable(
  "webhook_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: text("org_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    targetUrl: text("target_url").notNull(),
    status: text("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    lastAttemptedAt: timestamp("last_attempted_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("webhook_outbox_pending_idx").on(t.status, t.createdAt)]
);

// ── Project Channel Links ──────────────────────────────────────────────────────

export const projectChannelLinks = pgTable(
  "project_channel_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: text("org_id").notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull(),
    channelName: text("channel_name").notNull(),
    webhookUrl: text("webhook_url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("project_channel_links_unique_idx").on(t.projectId, t.channelId)]
);

// ── Auth tables (shared with other ViBe modules) ──────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: text("org_id").notNull(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  status: text("status").default("active").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Relations ─────────────────────────────────────────────────────────────────

export const teamsRelations = relations(teams, ({ many }) => ({
  members: many(teamMembers),
  projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  team: one(teams, { fields: [projects.teamId], references: [teams.id] }),
  members: many(projectMembers),
  settings: one(projectSettings, { fields: [projects.id], references: [projectSettings.projectId] }),
  sections: many(sections),
  tasks: many(tasks),
  milestones: many(milestones),
  automations: many(automations),
}));

export const sectionsRelations = relations(sections, ({ one, many }) => ({
  project: one(projects, { fields: [sections.projectId], references: [projects.id] }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  section: one(sections, { fields: [tasks.sectionId], references: [sections.id] }),
  assignees: many(taskAssignees),
  comments: many(taskComments),
  attachments: many(taskAttachments),
  activity: many(taskActivity),
}));

// ── Type exports ──────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type TeamMember = typeof teamMembers.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type ProjectSettings = typeof projectSettings.$inferSelect;
export type Section = typeof sections.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type TaskAssignee = typeof taskAssignees.$inferSelect;
export type TaskComment = typeof taskComments.$inferSelect;
export type TaskAttachment = typeof taskAttachments.$inferSelect;
export type TaskActivityRow = typeof taskActivity.$inferSelect;
export type Milestone = typeof milestones.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type Automation = typeof automations.$inferSelect;
export type PmNotification = typeof pmNotifications.$inferSelect;
export type WebhookOutboxRow = typeof webhookOutbox.$inferSelect;
export type ProjectChannelLink = typeof projectChannelLinks.$inferSelect;
