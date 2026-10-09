import type { components } from "../../types/api";

type WorkspaceMember = components["schemas"]["WorkspaceMemberResponse"];
type CommentMention = components["schemas"]["CommentMentionResponse"];

/**
 * A mention is stored as `@[Name](user:ID)` and shown in the text field as
 * `@Name`. The field keeps plain text plus the list of people picked from the
 * member list. On submit each `@Name` still in the text becomes the stored
 * form. A mention whose text the user changed no longer matches and is sent
 * as plain text.
 */

export interface PickedMention {
  userId: string;
  name: string;
}

export interface MentionCandidate extends PickedMention {
  email: string;
}

const STORED_MENTION = /@\[([^[\]\r\n]{1,120})\]\(user:([A-Za-z0-9_-]{1,64})\)/g;

/** The name a member is mentioned by. Brackets would break the stored form. */
const mentionName = (member: { name: string | null; email: string }): string =>
  (member.name?.trim() || member.email.split("@")[0]).replace(/[[\]\r\n]/g, "").slice(0, 120);

/** Active members with an account, as people who can be mentioned. */
export function toCandidates(members: WorkspaceMember[]): MentionCandidate[] {
  return members.flatMap((member) =>
    member.status === "ACTIVE" && member.userId
      ? [{ userId: member.userId, name: mentionName(member), email: member.email }]
      : [],
  );
}

const fold = (value: string): string => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Members matching what was typed after `@`, by name or email, ignoring case
 * and accents. Names that start with the query come first.
 */
export function filterCandidates(
  candidates: MentionCandidate[],
  query: string,
  limit = 6,
): MentionCandidate[] {
  const q = fold(query.trim());
  if (!q) return candidates.slice(0, limit);
  const rank = (c: MentionCandidate): number => {
    const name = fold(c.name);
    if (name.startsWith(q)) return 0;
    if (name.split(/\s+/).some((word) => word.startsWith(q))) return 1;
    if (name.includes(q)) return 2;
    if (fold(c.email).includes(q)) return 3;
    return -1;
  };
  return candidates
    .map((candidate, index) => ({ candidate, index, rank: rank(candidate) }))
    .filter((entry) => entry.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.candidate);
}

const MAX_QUERY = 40;

/**
 * The mention being typed at the caret: the position of its `@` and the text
 * after it. Null when the caret is not in one.
 */
export function mentionQueryAt(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf("@");
  if (start < 0) return null;
  // An `@` inside a word is an email address, not a mention.
  if (start > 0 && !/[\s(]/.test(before[start - 1])) return null;
  const query = before.slice(start + 1);
  // A space right after the name closes the list, as after picking someone.
  if (query.length > MAX_QUERY || /[\r\n]/.test(query) || /^\s|\s$/.test(query)) return null;
  return { start, query };
}

/** Replaces the mention being typed with the picked name. Returns the new text and caret. */
export function insertMention(
  text: string,
  start: number,
  caret: number,
  name: string,
): { text: string; caret: number } {
  const rest = text.slice(caret);
  // A space after the name, unless what follows already separates it.
  const inserted = `@${name}${/^[\s.,;:!?)]/.test(rest) ? "" : " "}`;
  return { text: text.slice(0, start) + inserted + rest, caret: start + inserted.length };
}

const isWordChar = (char: string | undefined): boolean => !!char && /[\p{L}\p{N}_]/u.test(char);

/** What the field shows, turned into what is stored. */
export function toStoredBody(text: string, picked: PickedMention[]): string {
  // Longest name first, so "@Ana María" is not read as "@Ana".
  const byLength = picked
    .filter((p) => p.name.length > 0)
    .sort((a, b) => b.name.length - a.name.length);
  if (byLength.length === 0) return text;
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === "@") {
      const match = byLength.find(
        (p) => text.startsWith(p.name, i + 1) && !isWordChar(text[i + 1 + p.name.length]),
      );
      if (match) {
        out += `@[${match.name}](user:${match.userId})`;
        i += 1 + match.name.length;
        continue;
      }
    }
    out += text[i];
    i += 1;
  }
  return out;
}

/** A stored body, turned into what the field shows plus the people in it. For editing. */
export function toFieldText(
  body: string,
  mentions: CommentMention[],
): { text: string; picked: PickedMention[] } {
  const picked: PickedMention[] = [];
  const text = body.replace(STORED_MENTION, (_all, shown: string, userId: string) => {
    const name = mentions.find((m) => m.userId === userId)?.name;
    if (!name) return `@${shown}`;
    if (!picked.some((p) => p.userId === userId)) picked.push({ userId, name });
    return `@${name}`;
  });
  return { text, picked };
}

export type BodyPart =
  | { type: "text"; text: string }
  | { type: "mention"; userId: string; name: string };

/**
 * A stored body as text and mention parts, for rendering. Only the people the
 * server lists as mentioned are shown as a mention, under the name it gives.
 */
export function bodyParts(body: string, mentions: CommentMention[]): BodyPart[] {
  const parts: BodyPart[] = [];
  const pushText = (text: string) => {
    if (!text) return;
    const last = parts[parts.length - 1];
    if (last?.type === "text") last.text += text;
    else parts.push({ type: "text", text });
  };
  let cursor = 0;
  for (const match of body.matchAll(STORED_MENTION)) {
    const index = match.index ?? 0;
    pushText(body.slice(cursor, index));
    const name = mentions.find((m) => m.userId === match[2])?.name;
    if (name) parts.push({ type: "mention", userId: match[2], name });
    else pushText(`@${match[1]}`);
    cursor = index + match[0].length;
  }
  pushText(body.slice(cursor));
  return parts;
}
