/**
 * Stamps every Qdrant point with the workspace that owns it. The logic and
 * the reasons are in services/qdrantWorkspaceBackfill.ts. In production it is
 * run from the admin maintenance page; this is the same thing for a shell.
 *
 *   yarn qdrant:backfill-workspace           # counts, changes nothing
 *   yarn qdrant:backfill-workspace --apply   # writes the stamp
 */
import prisma from "../prisma/prismaClient";
import { runQdrantWorkspaceBackfill } from "../services/qdrantWorkspaceBackfill";

const APPLY = process.argv.includes("--apply");

async function main() {
  const r = await runQdrantWorkspaceBackfill(APPLY);
  if (r.state === "failed") throw new Error(r.error ?? "The run failed.");
  if (!r.collectionExists) {
    console.log(`Collection ${r.collection} does not exist. Nothing to do.`);
    return;
  }
  if (APPLY) {
    console.log(`Collection ${r.collection}: ${r.totalPoints} points. Stamped ${r.stamped}.`);
    console.log(
      `${r.missing} points are still without workspaceId (their contexts no longer exist).`,
    );
  } else {
    console.log(
      `Collection ${r.collection}: ${r.totalPoints} points, ${r.missing} without workspaceId.`,
    );
    console.log("Nothing was changed. Run again with --apply to write.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
