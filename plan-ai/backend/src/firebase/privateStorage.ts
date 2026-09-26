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

export const downloadPath = async (storagePath: string): Promise<Buffer> => {
  const bucket = await getBucket();
  const [data] = await bucket.file(storagePath).download();
  return data;
};
