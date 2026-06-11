/**
 * One-shot data migration: pair every Context with a Project and vice-versa (1:1).
 *
 * Run from plan-ai/backend AFTER applying the schema migration that adds
 * `Context.projectId` and `Project.context`:
 *
 *   npx ts-node -r tsconfig-paths/register src/scripts/migrateContextsToProjects.ts
 *
 * What it does:
 *   1. For every Context that has no projectId → create a Project with the
 *      same workspaceId/userId/name and link them.
 *   2. For every Project that has no Context → create an empty Context with
 *      the same workspaceId/userId/title and link them.
 *
 * Safe to re-run: skips already-linked rows. Idempotent.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔗 Starting Context ↔ Project pairing migration...\n");

  // --- Step 1: orphan Contexts → create Projects ---
  const orphanContexts = await prisma.context.findMany({
    where: { projectId: null },
    select: {
      id: true,
      userId: true,
      workspaceId: true,
      name: true,
      description: true,
    },
  });

  console.log(`Found ${orphanContexts.length} orphan Context(s) without a Project.`);

  let createdProjects = 0;
  for (const ctx of orphanContexts) {
    await prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          userId: ctx.userId,
          workspaceId: ctx.workspaceId,
          title: ctx.name,
          description: ctx.description,
          metadata: {
            createdFromContextMigration: true,
            originalContextId: ctx.id,
          },
        },
      });
      await tx.context.update({
        where: { id: ctx.id },
        data: { projectId: project.id },
      });
      createdProjects++;
    });
  }
  console.log(`✅ Created ${createdProjects} Project(s) for orphan Contexts.\n`);

  // --- Step 2: Projects without Context → create empty Context ---
  const orphanProjects = await prisma.project.findMany({
    where: { context: null },
    select: {
      id: true,
      userId: true,
      workspaceId: true,
      title: true,
      description: true,
    },
  });

  console.log(`Found ${orphanProjects.length} Project(s) without a Context.`);

  let createdContexts = 0;
  for (const proj of orphanProjects) {
    await prisma.context.create({
      data: {
        userId: proj.userId,
        workspaceId: proj.workspaceId,
        name: proj.title.slice(0, 120),
        description: proj.description,
        projectId: proj.id,
        metadata: {
          createdFromProjectMigration: true,
          originalProjectId: proj.id,
        },
      },
    });
    createdContexts++;
  }
  console.log(`✅ Created ${createdContexts} empty Context(s) for existing Projects.\n`);

  // --- Sanity check ---
  const stillOrphanContexts = await prisma.context.count({ where: { projectId: null } });
  const stillOrphanProjects = await prisma.project.count({ where: { context: null } });
  console.log("--- Sanity check ---");
  console.log(`Contexts still without project: ${stillOrphanContexts}`);
  console.log(`Projects still without context: ${stillOrphanProjects}`);
  if (stillOrphanContexts === 0 && stillOrphanProjects === 0) {
    console.log("🎉 All Projects and Contexts are now paired 1:1.");
  } else {
    console.warn("⚠️  Some rows are still unpaired. Re-run the script or investigate.");
  }
}

main()
  .catch((err) => {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
