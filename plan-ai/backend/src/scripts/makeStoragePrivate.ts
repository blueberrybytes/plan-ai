/**
 * Removes public access from uploads made before storage went private.
 *
 * Recordings, voice profiles, context files and chat attachments used to be
 * uploaded with public read access: anyone holding the URL could download a
 * meeting. The backend now keeps them private and signs a URL for every read
 * (src/firebase/privateStorage.ts), which also covers rows that still hold
 * the old public URL. This script closes the old objects.
 *
 *   yarn storage:make-private           # counts the public files, changes nothing
 *   yarn storage:make-private --apply   # makes them private
 *   yarn storage:make-private --prefix smoke-tests/   # one folder only, for testing
 *
 * Run --apply only once the backend that signs URLs is deployed. Until then
 * the running backend still hands the old public URLs to Deepgram, the voice
 * service and the apps, and those reads would fail.
 *
 * Google caches public objects at the edge. After --apply, an old public URL
 * can keep answering from that cache until it expires: an hour for most
 * files, a day for chat attachments (uploaded with max-age=86400). A read
 * that skips the cache is refused straight away.
 *
 * Generated images, logos and anything outside these folders keep their
 * current access: they are embedded in documents and slides meant to be shared.
 */
import { firebaseAdmin } from "../firebase/firebaseAdmin";

const PREFIXES = ["transcripts/", "voice-profiles/", "contexts/", "chat-attachments/"];
const PAGE_SIZE = 500;
const CONCURRENCY = 16;

type Bucket = ReturnType<ReturnType<typeof firebaseAdmin.storage>["bucket"]>;
type StorageFile = ReturnType<Bucket["file"]>;

const inBatches = async <T>(items: T[], fn: (item: T) => Promise<void>): Promise<void> => {
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    await Promise.all(items.slice(i, i + CONCURRENCY).map(fn));
  }
};

const main = async () => {
  const apply = process.argv.includes("--apply");
  const prefixArg = process.argv.indexOf("--prefix");
  const prefixes = prefixArg >= 0 ? [process.argv[prefixArg + 1]] : PREFIXES;
  if (prefixes.some((p) => !p)) throw new Error("--prefix needs a folder, e.g. smoke-tests/");
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET?.trim();
  if (!bucketName) throw new Error("FIREBASE_STORAGE_BUCKET is not set");
  const bucket = firebaseAdmin.storage().bucket(bucketName);

  console.log(`Bucket ${bucket.name}, ${apply ? "making public files private" : "dry run"}`);
  let totalPublic = 0;
  let totalFailed = 0;

  for (const prefix of prefixes) {
    let scanned = 0;
    let publicCount = 0;
    let failed = 0;
    let pageToken: string | undefined;
    do {
      const [files, next] = await bucket.getFiles({
        prefix,
        maxResults: PAGE_SIZE,
        autoPaginate: false,
        pageToken,
      });
      pageToken = (next as { pageToken?: string } | null)?.pageToken;
      scanned += files.length;

      await inBatches(files, async (file: StorageFile) => {
        try {
          // Decided by the ACL, not by file.isPublic(): that one tries an
          // anonymous read, and Google's cache keeps answering 200 for up to
          // an hour after the file went private.
          const [acl] = await file.acl.get();
          const isPublic = (acl as unknown as Array<{ entity?: string }>).some(
            (entry) => entry.entity === "allUsers",
          );
          if (!isPublic) return;
          publicCount++;
          if (apply) await file.makePrivate();
        } catch (err) {
          failed++;
          console.warn(`  ${file.name}: ${err instanceof Error ? err.message : err}`);
        }
      });
    } while (pageToken);

    console.log(
      `${prefix.padEnd(18)} ${scanned} files, ${publicCount} public${apply && publicCount > 0 ? ", now private" : ""}${failed ? `, ${failed} failed` : ""}`,
    );
    totalPublic += publicCount;
    totalFailed += failed;
  }

  if (!apply && totalPublic > 0) {
    console.log(`\n${totalPublic} files are public. Run again with --apply to make them private.`);
  }
  process.exit(totalFailed > 0 ? 1 : 0);
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
