import "dotenv/config";
import { db } from "../src/lib/db";
import {
  teams, teamMembers, projects, projectMembers, projectSettings, sections, tasks, users, sessions,
} from "../src/lib/db/schema";

const ORG_ID = "org_seed_001";

async function seed() {
  console.log("Seeding ViBe PM...");

  // Seed a demo user (normally created by the auth module)
  const [user] = await db.insert(users).values({
    orgId: ORG_ID,
    email: "demo@vb.co",
    name: "Demo User",
    status: "active",
  }).onConflictDoNothing().returning();

  console.log("User:", user?.id ?? "already exists");

  // Team
  const [team] = await db.insert(teams).values({
    orgId: ORG_ID,
    name: "Product Team",
    description: "Core product team",
    createdBy: user?.id ?? "00000000-0000-0000-0000-000000000001",
  }).returning();
  console.log("Team:", team.id);

  if (user) {
    await db.insert(teamMembers).values({
      teamId: team.id, orgId: ORG_ID, userId: user.id, role: "owner",
    }).onConflictDoNothing();
  }

  const DEFAULT_SECTIONS = [
    { name: "Backlog", position: 1000 },
    { name: "To Do", position: 2000 },
    { name: "In Progress", position: 3000 },
    { name: "In Review", position: 4000 },
    { name: "Done", position: 5000 },
  ];

  const sampleProjects = [
    { name: "Onboarding", color: "#2f5cff", description: "User onboarding flow" },
    { name: "Operations", color: "#0d8f80", description: "Internal operations" },
    { name: "Marketing", color: "#6d4be0", description: "Marketing campaigns" },
  ];

  for (const projectData of sampleProjects) {
    const [project] = await db.insert(projects).values({
      orgId: ORG_ID,
      teamId: team.id,
      name: projectData.name,
      description: projectData.description,
      color: projectData.color,
      createdBy: user?.id ?? "00000000-0000-0000-0000-000000000001",
    }).returning();

    console.log("Project:", project.name, project.id);

    if (user) {
      await db.insert(projectMembers).values({
        projectId: project.id, orgId: ORG_ID, userId: user.id, role: "owner",
      }).onConflictDoNothing();
    }

    await db.insert(projectSettings).values({
      projectId: project.id, orgId: ORG_ID,
    }).onConflictDoNothing();

    const [sectionRows] = await Promise.all([
      db.insert(sections).values(
        DEFAULT_SECTIONS.map(s => ({
          projectId: project.id, orgId: ORG_ID, name: s.name, position: s.position,
        }))
      ).returning(),
    ]);

    // Sample tasks in each section
    const sampleTasks = [
      { title: "Set up project structure", priority: "high", status: "completed" },
      { title: "Define requirements", priority: "medium", status: "in_progress" },
      { title: "Design mockups", priority: "medium", status: "not_started" },
      { title: "Implement core features", priority: "high", status: "not_started" },
      { title: "Write tests", priority: "low", status: "not_started" },
    ];

    for (let i = 0; i < sectionRows.length; i++) {
      const section = sectionRows[i];
      const taskData = sampleTasks[i];
      if (!taskData) continue;
      await db.insert(tasks).values({
        projectId: project.id,
        sectionId: section.id,
        orgId: ORG_ID,
        title: taskData.title,
        priority: taskData.priority,
        status: taskData.status,
        position: 1000,
        createdBy: user?.id ?? "00000000-0000-0000-0000-000000000001",
        assigneeId: user?.id,
      });
    }
  }

  console.log("Seed complete!");
  process.exit(0);
}

seed().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
