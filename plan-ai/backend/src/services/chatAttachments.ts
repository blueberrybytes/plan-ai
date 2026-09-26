import type { UIMessage } from "ai";
import {
  DISPLAY_URL_TTL_MS,
  objectPathOf,
  signedUrlForPath,
  storageUri,
} from "../firebase/privateStorage";
import { logger } from "../utils/logger";

/**
 * Chat attachments are uploaded under chat-attachments/<userId>/ and stay
 * private. The client sends back whatever URL the upload gave it, and only
 * the user's own uploads are accepted: nobody can point the server, or the
 * model, at another user's file or at an arbitrary URL.
 */

export interface ChatAttachmentRef {
  url: string;
  type: string;
  name: string;
  size?: number;
}

export const ownedAttachmentPath = (ref: string, userId: string): string | null => {
  const path = objectPathOf(ref);
  return path && path.startsWith(`chat-attachments/${userId}/`) ? path : null;
};

const isAttachmentRef = (v: unknown): v is ChatAttachmentRef => {
  const a = v as Partial<ChatAttachmentRef> | null;
  return (
    typeof a === "object" &&
    a !== null &&
    typeof a.url === "string" &&
    typeof a.type === "string" &&
    typeof a.name === "string"
  );
};

/** What gets saved with a message: the user's own uploads, as gs:// URIs. */
export const toStoredAttachments = (raw: unknown, userId: string): ChatAttachmentRef[] => {
  if (!Array.isArray(raw)) return [];
  const out: ChatAttachmentRef[] = [];
  for (const a of raw) {
    if (!isAttachmentRef(a)) continue;
    const path = ownedAttachmentPath(a.url, userId);
    if (!path) {
      logger.warn(`[Chat] Dropped attachment "${a.name}": not an upload of this user`);
      continue;
    }
    out.push({
      url: storageUri(path),
      type: a.type,
      name: a.name,
      ...(typeof a.size === "number" ? { size: a.size } : {}),
    });
  }
  return out;
};

/** Saved attachments with URLs the browser can show for a while. */
export const toDisplayAttachments = async (
  raw: unknown,
  userId: string,
): Promise<ChatAttachmentRef[] | null> => {
  if (!Array.isArray(raw)) return null;
  const out: ChatAttachmentRef[] = [];
  for (const a of raw) {
    if (!isAttachmentRef(a)) continue;
    const path = ownedAttachmentPath(a.url, userId);
    if (!path) continue;
    out.push({ ...a, url: await signedUrlForPath(path, DISPLAY_URL_TTL_MS) });
  }
  return out;
};

/**
 * The workspace assistant keeps its conversation in the browser and sends it
 * whole on every turn, file parts included. Each file part is re-signed so
 * the model can fetch it even when the URL the browser kept has expired.
 * Inline data: URLs pass through; anything else is dropped.
 */
export const withSignedFileParts = async (
  messages: UIMessage[],
  userId: string,
): Promise<UIMessage[]> =>
  Promise.all(
    messages.map(async (m) => {
      if (!Array.isArray(m.parts)) return m;
      const parts = await Promise.all(
        m.parts.map(async (p) => {
          if (p.type !== "file" || p.url.startsWith("data:")) return p;
          const path = ownedAttachmentPath(p.url, userId);
          if (!path) {
            logger.warn(
              `[Assistant] Dropped file part "${p.filename ?? ""}": not an upload of this user`,
            );
            return null;
          }
          return { ...p, url: await signedUrlForPath(path) };
        }),
      );
      return { ...m, parts: parts.filter((p): p is UIMessage["parts"][number] => p !== null) };
    }),
  );
