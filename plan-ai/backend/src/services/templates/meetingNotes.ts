const APP_URL = process.env.APP_URL || "https://plan-ai.blueberrybytes.com";

/** Escape user and AI text: titles, summaries and notes land straight in the HTML. */
const esc = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Line breaks kept, everything else escaped. */
const paragraph = (value: string): string => esc(value.trim()).replace(/\r?\n/g, "<br />");

const fmtDate = (d: Date | null): string =>
  d
    ? d.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

export interface MeetingNotesEmailTask {
  title: string;
  dueDate?: string | null;
}

export interface MeetingNotesEmailInput {
  senderName: string;
  senderEmail: string;
  title: string;
  recordedAt: Date | null;
  summary: string | null;
  keyPoints: string[];
  tasks: MeetingNotesEmailTask[];
  /** Personal note the sender wrote above the notes. */
  message?: string | null;
  /** Link to the meeting in Plan AI. Only for recipients in the workspace. */
  meetingUrl?: string | null;
}

/**
 * Meeting notes sent by a user to the people in the meeting. Most readers
 * have no Plan AI account, so it is readable on its own, says who sent it
 * and that an AI wrote the notes.
 */
export function renderMeetingNotesEmail(input: MeetingNotesEmailInput): string {
  const { senderName, senderEmail, title, recordedAt, summary, keyPoints, tasks } = input;
  const firstName = esc(senderName.split(" ")[0] || senderName);
  const date = fmtDate(recordedAt);

  const message = input.message?.trim()
    ? `<p style="margin: 0 0 24px; color: #1e293b; font-size: 15px; line-height: 1.7;">${paragraph(input.message)}</p>`
    : "";

  const summaryBlock = summary?.trim()
    ? `<h2 style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.6px; color: #64748b; margin: 0 0 8px;">Summary</h2>
       <p style="margin: 0 0 24px; color: #1e293b; font-size: 14px; line-height: 1.7;">${paragraph(summary)}</p>`
    : "";

  const pointsBlock = keyPoints.length
    ? `<h2 style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.6px; color: #64748b; margin: 0 0 8px;">Key points</h2>
       <ul style="margin: 0 0 24px; padding-left: 18px; color: #1e293b; font-size: 14px; line-height: 1.7;">
         ${keyPoints.map((p) => `<li>${esc(p)}</li>`).join("")}
       </ul>`
    : "";

  const tasksBlock = tasks.length
    ? `<h2 style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.6px; color: #64748b; margin: 0 0 8px;">Action items</h2>
       <ul style="margin: 0 0 24px; padding-left: 18px; color: #1e293b; font-size: 14px; line-height: 1.7;">
         ${tasks
           .map((t) => {
             const due = t.dueDate
               ? `<span style="color: #64748b; font-size: 12px;"> · due ${esc(t.dueDate)}</span>`
               : "";
             return `<li style="margin-bottom: 4px;">${esc(t.title)}${due}</li>`;
           })
           .join("")}
       </ul>`
    : "";

  const openLink = input.meetingUrl
    ? `<a href="${esc(input.meetingUrl)}" style="display: inline-block; margin: 0 0 24px; background: #4361EE; color: #fff; text-decoration: none; font-weight: 600; padding: 10px 22px; border-radius: 8px; font-size: 14px;">
         Open the meeting in Plan AI
       </a>`
    : "";

  return `
    <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; color: #1e293b; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
      <div style="background: linear-gradient(135deg, #4361EE 0%, #a78bfa 100%); padding: 24px 32px; color: #ffffff;">
        <p style="margin: 0 0 6px; font-size: 13px; opacity: 0.9;">Meeting notes from ${esc(senderName)}</p>
        <h1 style="margin: 0; font-size: 20px; font-weight: 700; line-height: 1.3;">${esc(title)}</h1>
        ${date ? `<p style="margin: 6px 0 0; font-size: 13px; opacity: 0.9;">${esc(date)}</p>` : ""}
      </div>

      <div style="padding: 28px 32px;">
        ${message}
        ${summaryBlock}
        ${pointsBlock}
        ${tasksBlock}
        ${openLink}

        <p style="color: #64748b; font-size: 12px; margin: 8px 0 0; line-height: 1.6; border-top: 1px solid #e2e8f0; padding-top: 16px;">
          An AI wrote these notes from the meeting recording. Check anything important with the people involved.
          Reply to this email to answer ${firstName} (${esc(senderEmail)}).
        </p>
        <p style="color: #94a3b8; font-size: 12px; margin: 8px 0 0;">
          Sent with <a href="${APP_URL}" style="color: #64748b;">Plan AI</a>.
        </p>
      </div>
    </div>
  `;
}
