import {
  renderWorkspaceInvitationEmail,
  renderTelegramLeadEmail,
  renderWeeklyDigestEmail,
  renderTeamReportEmail,
  renderCommentMentionEmail,
} from "./templates";
import type { TelegramLeadEmailInput } from "./templates/telegramLead";
import type { WeeklyDigestEmailInput } from "./templates/weeklyDigest";
import type { TeamReportEmailInput } from "./templates/teamReport";
import type { CommentMentionEmailInput } from "./templates/commentMention";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || "Plan AI <noreply@plan-ai.blueberrybytes.com>";

export async function sendWorkspaceInvitationEmail(
  to: string,
  inviterEmail: string,
  workspaceName: string,
): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn(`[EMAIL] RESEND_API_KEY not set. Skipping invitation email to ${to}`);
    return;
  }

  const html = renderWorkspaceInvitationEmail(to, inviterEmail, workspaceName);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject: `You've been invited to join ${workspaceName} on Plan AI`,
      html,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`[EMAIL] Resend API error ${response.status}: ${body}`);
    throw new Error(`Failed to send invitation email: ${response.status}`);
  }

  console.log(`[EMAIL] Invitation sent to ${to} for workspace "${workspaceName}"`);
}

/**
 * Alerts the sales team that a prospect asked Berry for a proposal.
 *
 * Without this the bot delivers its "wow" and nobody follows up — a lead that
 * arrives at 3am is worth nothing if the first human sees it three days later.
 *
 * Never throws: the prospect has already been served, so a mail failure must not
 * bubble into the intake flow and turn a delivered proposal into an error.
 */
export async function sendTelegramLeadEmail(input: TelegramLeadEmailInput): Promise<void> {
  const to = process.env.TELEGRAM_LEAD_NOTIFY_EMAIL;

  if (!RESEND_API_KEY || !to) {
    console.warn(
      "[EMAIL] Lead notification skipped (RESEND_API_KEY or TELEGRAM_LEAD_NOTIFY_EMAIL unset)",
    );
    return;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: to
          .split(",")
          .map((address) => address.trim())
          .filter(Boolean),
        subject: `Nuevo lead en Telegram — ${input.handle}`,
        html: renderTelegramLeadEmail(input),
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[EMAIL] Lead notification failed ${response.status}: ${body}`);
      return;
    }

    console.log(`[EMAIL] Lead notification sent for ${input.handle}`);
  } catch (err) {
    console.error("[EMAIL] Lead notification threw", err);
  }
}

/**
 * Monday-morning weekly digest. Throws on failure so the caller
 * (`runWeeklyDigest`) can count it as failed and log which user it was —
 * the batch keeps going regardless.
 */
/** Meeting notes a user sends to the people in the meeting. Throws on failure. */
export async function sendMeetingNotesEmail(input: {
  to: string;
  replyTo: string;
  senderName: string;
  subject: string;
  html: string;
}): Promise<void> {
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY not set");
  }
  // "Ana López via Plan AI <noreply@...>": the reader sees who sent it, and
  // the address stays ours. Characters that could break the header go.
  const address = /<([^>]+)>/.exec(FROM_EMAIL)?.[1] ?? FROM_EMAIL;
  const name = input.senderName
    .replace(/["<>\r\n\\]/g, "")
    .slice(0, 80)
    .trim();
  const from = name ? `"${name} via Plan AI" <${address}>` : FROM_EMAIL;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      reply_to: input.replyTo,
      subject: input.subject.replace(/[\r\n]+/g, " ").slice(0, 200),
      html: input.html,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Meeting notes email failed ${response.status}: ${body}`);
  }
}

/** True when this server can send email. */
export const emailConfigured = (): boolean => !!RESEND_API_KEY;

export async function sendWeeklyDigestEmail(
  to: string,
  input: WeeklyDigestEmailInput,
): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn(`[EMAIL] RESEND_API_KEY not set. Skipping weekly digest to ${to}`);
    return;
  }

  const count = input.digest.meetings.length;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject: `Your week: ${count} meeting${count === 1 ? "" : "s"} in ${input.workspaceName}`,
      html: renderWeeklyDigestEmail(input),
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Weekly digest email failed ${response.status}: ${body}`);
  }
}

export async function sendTeamReportEmail(to: string, input: TeamReportEmailInput): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn(`[EMAIL] RESEND_API_KEY not set. Skipping team report to ${to}`);
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject: `Your team's week in ${input.report.workspaceName}`,
      html: renderTeamReportEmail(input),
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Team report email failed ${response.status}: ${body}`);
  }
}

/** Tells a member they were mentioned in a comment. Throws on failure. */
export async function sendCommentMentionEmail(
  to: string,
  input: CommentMentionEmailInput,
): Promise<void> {
  if (!RESEND_API_KEY) return;

  const title = input.targetTitle.replace(/[\r\n]+/g, " ").slice(0, 120);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject: `${input.authorName.replace(/[\r\n]+/g, " ").slice(0, 80)} mentioned you in "${title}"`,
      html: renderCommentMentionEmail(input),
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Comment mention email failed ${response.status}: ${body}`);
  }
}
