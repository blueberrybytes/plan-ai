/** Names, titles and the comment are written by people: all of it is escaped. */
const esc = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export interface CommentMentionEmailInput {
  /** Who wrote the comment. */
  authorName: string;
  targetKind: "task" | "meeting";
  /** Title of the task or meeting. */
  targetTitle: string;
  /** The comment as plain text. */
  text: string;
  /** Link to the task or meeting in Plan AI. */
  url: string;
}

const MAX_TEXT = 2000;

/** Tells a member that someone mentioned them in a comment. */
export function renderCommentMentionEmail(input: CommentMentionEmailInput): string {
  const author = esc(input.authorName);
  const title = esc(input.targetTitle);
  const where = input.targetKind === "task" ? "the task" : "the meeting";
  const text =
    input.text.length > MAX_TEXT ? `${input.text.slice(0, MAX_TEXT).trimEnd()}...` : input.text;
  const button = input.targetKind === "task" ? "Open the task" : "Open the meeting";

  return `
    <div style="font-family: Inter, sans-serif; max-width: 520px; margin: 0 auto; background: #0b0d11; color: #f8fafc; border-radius: 16px; overflow: hidden; border: 1px solid rgba(167,139,250,0.2);">
      <div style="background: linear-gradient(135deg, #4361EE 0%, #a78bfa 100%); padding: 28px; text-align: center;">
        <h1 style="margin: 0; font-size: 22px; font-weight: 800;">Plan AI</h1>
      </div>
      <div style="padding: 28px;">
        <p style="color: #94a3b8; line-height: 1.7; margin: 0 0 20px;">
          <strong style="color: #f8fafc;">${author}</strong> mentioned you in a comment on ${where}
          <strong style="color: #f8fafc;">${title}</strong>.
        </p>
        <div style="background: rgba(255,255,255,0.04); border-left: 3px solid #a78bfa; padding: 16px; border-radius: 8px; margin: 0 0 24px;">
          <p style="color: #cbd5e1; line-height: 1.6; margin: 0; font-size: 14px; white-space: pre-wrap;">${esc(text)}</p>
        </div>
        <a href="${esc(input.url)}" style="display: inline-block; background: linear-gradient(135deg, #4361EE 0%, #a78bfa 100%); color: #fff; text-decoration: none; font-weight: 600; padding: 13px 28px; border-radius: 8px; font-size: 15px;">
          ${button}
        </a>
      </div>
    </div>
  `;
}
