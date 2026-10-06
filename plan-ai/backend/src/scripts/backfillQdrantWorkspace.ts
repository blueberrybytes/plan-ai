/**
 * Stamps every Qdrant point with the workspace that owns it.
 *
 * All workspaces share one collection. Points written since October 2026
 * carry `workspaceId`, and reads refuse a point stamped with another
 * workspace. Older points have no stamp. This script adds it, taking the
 * workspace from the point's Context row.
 *
 *   yarn qdrant:backfill-workspace           # counts, changes nothing
 *   yarn qdrant:backfill-workspace --apply   # writes the stamp
 *
 * Safe to run more than once and while the backend is serving: it only adds
 * a payload field, and reads accept points with or without it.
 *
 * Points whose context no longer exists in the database are counted and left
 * alone. No read can reach them, because every read starts from a Context row.
 */
import prisma from "../prisma/prismaClient";
import { getContextCollectionName, qdrantClient } from "../vector/qdrantClient";

const APPLY = process.argv.includes("--apply");

const countPoints = async (name: string, must: object[]) =>
  (await qdrantClient.count(name, { filter: { must }, exact: true })).count;

async function main() {
  const name = getContextCollectionName();
  const unstamped = { is_empty: { key: "workspaceId" } };
  const total = await countPoints(name, []);
  const missingBefore = await countPoints(name, [unstamped]);
  console.log(`Collection ${name}: ${total} points, ${missingBefore} without workspaceId.`);

  const contexts = await prisma.context.findMany({ select: { id: true, workspaceId: true } });
  let stamped = 0;
  let touchedContexts = 0;
  for (const context of contexts) {
    const must = [{ key: "contextId", match: { value: context.id } }, unstamped];
    const pending = await countPoints(name, must);
    if (pending === 0) continue;
    touchedContexts++;
    stamped += pending;
    if (APPLY) {
      await qdrantClient.setPayload(name, {
        payload: { workspaceId: context.workspaceId },
        filter: { must },
        wait: true,
      });
    }
  }

  if (APPLY) {
    // The filter on reads uses this field on every search.
    await qdrantClient
      .createPayloadIndex(name, { field_name: "workspaceId", field_schema: "keyword", wait: true })
      .catch((e: unknown) => console.warn("Payload index not created:", (e as Error)?.message));
  }

  const orphans = missingBefore - stamped;
  console.log(
    `${APPLY ? "Stamped" : "Would stamp"} ${stamped} points in ${touchedContexts} of ${contexts.length} contexts.`,
  );
  console.log(`${orphans} points belong to contexts that no longer exist. Left as they are.`);
  if (APPLY) {
    console.log(`Now without workspaceId: ${await countPoints(name, [unstamped])}.`);
  } else {
    console.log("Nothing was changed. Run again with --apply to write.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
