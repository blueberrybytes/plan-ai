/**
 * Stamps every Qdrant point with the workspace that owns it. The logic and
 * the reasons are in services/qdrantWorkspaceBackfill.ts. In production it is
 * run from the admin maintenance page; this is the same thing for a shell.
 *
 *   yarn qdrant:backfill-workspace           # counts, changes nothing
 *   yarn qdrant:backfill-workspace --apply   # writes the stamp
 */
import prisma from "../prisma/prismaClient";
import {
  applyQdrantWorkspaceBackfill,
  checkQdrantWorkspaceBackfill,
} from "../services/qdrantWorkspaceBackfill";

const APPLY = process.argv.includes("--apply");

async function main() {
  const r = await (APPLY ? applyQdrantWorkspaceBackfill() : checkQdrantWorkspaceBackfill());
  if (!r.collectionExists) {
    console.log(`Collection ${r.collection} does not exist. Nothing to do.`);
    return;
  }
  console.log(
    `Collection ${r.collection}: ${r.totalPoints} points, ${r.missingBefore} without workspaceId.`,
  );
  console.log(
    `${APPLY ? "Stamped" : "Would stamp"} ${r.stamped} points in ${r.contextsTouched} of ${r.contextsTotal} contexts.`,
  );
  console.log(`${r.orphans} points belong to contexts that no longer exist. Left as they are.`);
  console.log(
    APPLY
      ? `Now without workspaceId: ${r.missingAfter}.`
      : "Nothing was changed. Run again with --apply to write.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
