/**
 * What users upload (meeting recordings, voice profiles, context files, chat
 * attachments) stays private in the bucket. The database keeps a gs:// URI,
 * and whoever needs the bytes gets a signed URL that expires.
 *
 * Rows written before this existed hold the object's old public URL
 * (https://storage.googleapis.com/<bucket>/<path>). Both forms resolve to the
 * same object, so old rows keep working once their objects are made private
 * with `yarn storage:make-private`.
 */

type Bucket = ReturnType<
  ReturnType<(typeof import("./firebaseAdmin"))["firebaseAdmin"]["storage"]>["bucket"]
>;

/**
 * For servers that fetch the file right away: Deepgram, the Whisper server,
 * the voice service, the LLM provider, or a browser opening a file on click.
 */
export const SHORT_URL_TTL_MS = 60 * 60 * 1000;
/** For URLs inside API responses the apps keep on screen (chat thumbnails, the voice profile player). */
export const DISPLAY_URL_TTL_MS = 12 * 60 * 60 * 1000;

const bucketName = (): string => {
  const name = process.env.FIREBASE_STORAGE_BUCKET?.trim();
  if (!name) throw new Error("FIREBASE_STORAGE_BUCKET is not set");
  return name;
};

// Loaded on first use. Importing firebase-admin initialises the app, which
// code that only parses references (and its tests) shouldn't pay for.
const getBucket = async (): Promise<Bucket> => {
  const { firebaseAdmin } = await import("./firebaseAdmin");
  return firebaseAdmin.storage().bucket(bucketName());
};

export const storageUri = (storagePath: string): string => `gs://${bucketName()}/${storagePath}`;

/**
 * The object path in our bucket for a stored reference, or null when the
 * reference points anywhere else. Accepts a gs:// URI, the old public URL and
 * a signed URL (the query string is ignored).
 */
export const objectPathOf = (ref: string): string | null => {
  // No bucket configured: nothing can be ours.
  const bucket = process.env.FIREBASE_STORAGE_BUCKET?.trim();
  if (!bucket) return null;
  if (ref.startsWith("gs://")) {
    const rest = ref.slice("gs://".length);
    const slash = rest.indexOf("/");
    if (slash <= 0 || rest.slice(0, slash) !== bucket) return null;
    return rest.slice(slash + 1) || null;
  }
  let url: URL;
  try {
    url = new URL(ref);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "storage.googleapis.com") return null;
  const [, first, ...rest] = url.pathname.split("/");
  if (first !== bucket || rest.length === 0) return null;
  try {
    return decodeURIComponent(rest.join("/")) || null;
  } catch {
    return null;
  }
};

/** Saves a file with no public access and returns its gs:// URI. */
export const uploadPrivateFile = async (
  storagePath: string,
  data: Buffer,
  contentType: string,
): Promise<string> => {
  const bucket = await getBucket();
  await bucket.file(storagePath).save(data, { contentType });
  return storageUri(storagePath);
};

export const signedUrlForPath = async (
  storagePath: string,
  ttlMs: number = SHORT_URL_TTL_MS,
): Promise<string> => {
  const bucket = await getBucket();
  const [url] = await bucket.file(storagePath).getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + ttlMs,
  });
  return url;
};

/**
 * A URL anyone can fetch for the next `ttlMs`. References outside our bucket
 * come back unchanged: the caller decides whether those are acceptable.
 */
export const readableUrl = async (
  ref: string,
  ttlMs: number = SHORT_URL_TTL_MS,
): Promise<string> => {
  const path = objectPathOf(ref);
  return path ? signedUrlForPath(path, ttlMs) : ref;
};

/**
 * Where one part of a recording uploaded in pieces is kept until
 * recorder-upload joins them. Parts live under the uploader's own prefix, so a
 * client can only ever join its own parts. The top-level prefix is separate
 * from finished recordings so a bucket lifecycle rule can delete parts of
 * uploads that were never finished (matchesPrefix "recording-uploads/").
 */
export const RECORDING_PARTS_ROOT = "recording-uploads/";

export const recordingPartsPrefix = (userId: string, uploadId: string): string =>
  `${RECORDING_PARTS_ROOT}${userId}/${uploadId}/`;

export const recordingPartPath = (userId: string, uploadId: string, index: number): string =>
  `${recordingPartsPrefix(userId, uploadId)}part-${String(index).padStart(6, "0")}`;

/** Object paths under a prefix, in name order. */
export const listPaths = async (prefix: string): Promise<string[]> => {
  const bucket = await getBucket();
  const [files] = await bucket.getFiles({ prefix });
  return files.map((f) => f.name).sort();
};

/**
 * Joins objects, in the given order, into one private object and returns its
 * gs:// URI. GCS composes at most 32 sources per call, so longer lists are
 * joined in rounds through temporary objects that are deleted afterwards.
 */
export const composePaths = async (
  sources: string[],
  destination: string,
  contentType: string,
): Promise<string> => {
  if (sources.length === 0) throw new Error("Nothing to compose");
  const bucket = await getBucket();
  const MAX_SOURCES = 32;
  const temporary: string[] = [];
  try {
    let level = sources;
    let round = 0;
    while (level.length > MAX_SOURCES) {
      const next: string[] = [];
      for (let i = 0; i < level.length; i += MAX_SOURCES) {
        const target = `${destination}.part-${round}-${i / MAX_SOURCES}`;
        temporary.push(target);
        await bucket.combine(level.slice(i, i + MAX_SOURCES), target);
        next.push(target);
      }
      level = next;
      round += 1;
    }
    await bucket.combine(level, destination);
    await bucket.file(destination).setMetadata({ contentType });
    return storageUri(destination);
  } finally {
    // Also on failure: they live outside recording-uploads/, where the daily
    // sweep would never find them.
    await Promise.allSettled(temporary.map((p) => bucket.file(p).delete({ ignoreNotFound: true })));
  }
};

/** Deletes objects under a prefix created more than `maxAgeMs` ago. Returns how many. */
export const deleteOlderThan = async (prefix: string, maxAgeMs: number): Promise<number> => {
  const bucket = await getBucket();
  const [files] = await bucket.getFiles({ prefix });
  const cutoff = Date.now() - maxAgeMs;
  const stale = files.filter((f) => {
    const created = Date.parse(String(f.metadata?.timeCreated ?? ""));
    return Number.isFinite(created) && created < cutoff;
  });
  // One object that cannot be deleted must not stop the rest.
  const results = await Promise.allSettled(stale.map((f) => f.delete({ ignoreNotFound: true })));
  return results.filter((r) => r.status === "fulfilled").length;
};

/**
 * Deletes the object a stored reference points to (gs:// URI, old public URL
 * or signed URL). References outside our bucket are left alone. Returns
 * whether the reference was ours.
 */
export const deleteStoredObject = async (ref: string): Promise<boolean> => {
  const path = objectPathOf(ref);
  if (!path) return false;
  const bucket = await getBucket();
  await bucket.file(path).delete({ ignoreNotFound: true });
  return true;
};

/**
 * Deletes one object, whatever form the reference has: a gs:// URI, a
 * storage.googleapis.com URL, or a plain object path ("contexts/...", as
 * context files are stored).
 */
export const deleteObjectRef = async (ref: string): Promise<void> => {
  const path =
    ref.startsWith("gs://") || ref.startsWith("https://")
      ? objectPathOf(ref)
      : ref.replace(/^\/+/, "");
  if (!path) return;
  const bucket = await getBucket();
  await bucket.file(path).delete({ ignoreNotFound: true });
};

/** Deletes every object under a prefix. */
export const deletePrefix = async (prefix: string): Promise<void> => {
  const bucket = await getBucket();
  await bucket.deleteFiles({ prefix, force: true });
};

export const downloadPath = async (storagePath: string): Promise<Buffer> => {
  const bucket = await getBucket();
  const [data] = await bucket.file(storagePath).download();
  return data;
};
