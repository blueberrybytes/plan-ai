/**
 * One-shot script: set isCourtesy = true on ALL existing workspaces.
 *
 * Run from plan-ai/backend:
 *   npx ts-node -r tsconfig-paths/register src/scripts/w.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const total = await prisma.workspace.count();
  console.log(`Found ${total} workspace(s). Setting isCourtesy = true on all...`);

  const result = await prisma.workspace.updateMany({
    where: { isCourtesy: false },
    data: { isCourtesy: true },
  });

  console.log(`✅ Done. Updated ${result.count} workspace(s) → isCourtesy = true.`);

  // Print a quick summary
  const workspaces = await prisma.workspace.findMany({
    select: { id: true, name: true, isCourtesy: true },
    orderBy: { name: "asc" },
  });
  console.table(workspaces);
}

main()
  .catch((e) => {
    console.error("❌ Script failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
