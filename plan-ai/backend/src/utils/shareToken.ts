import { randomBytes } from "crypto";

/**
 * Public links carry a random share token instead of the record id. The id
 * is not a secret: every member sees it, and it stays valid after someone
 * leaves the workspace. A token is made each time sharing is turned on, so
 * turning it off and on again kills the old links.
 */

export const newShareToken = (): string => randomBytes(24).toString("base64url");

/**
 * The share token to store for a change of `isPublic`: a new one when the
 * record goes from private to public, none when it goes private. A record
 * that stays public keeps its token, or its old id link if it was shared
 * before tokens existed.
 */
export const shareTokenUpdate = (
  wasPublic: boolean,
  isPublic: boolean | undefined,
): { shareToken?: string | null } => {
  if (isPublic === undefined || isPublic === wasPublic) return {};
  return { shareToken: isPublic ? newShareToken() : null };
};

/**
 * Prisma `where` for a public lookup by the key in the link: the share token,
 * or the id of a record shared before tokens existed.
 */
export const publicLinkWhere = (key: string) => ({
  isPublic: true,
  OR: [{ shareToken: key }, { id: key, shareToken: null }],
});
