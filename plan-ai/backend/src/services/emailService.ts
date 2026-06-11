import { renderWorkspaceInvitationEmail } from "./templates";

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
