const APP_URL = process.env.APP_URL || "https://plan-ai.blueberrybytes.com";

export function renderWorkspaceInvitationEmail(
  to: string,
  inviterEmail: string,
  workspaceName: string,
): string {
  const signupUrl = `${APP_URL}/signup`;
  return `
    <div style="font-family: Inter, sans-serif; max-width: 520px; margin: 0 auto; background: #0b0d11; color: #f8fafc; border-radius: 16px; overflow: hidden; border: 1px solid rgba(167,139,250,0.2);">
      <div style="background: linear-gradient(135deg, #4361EE 0%, #a78bfa 100%); padding: 32px; text-align: center;">
        <img src="${APP_URL}/logos/bbb.png" alt="Plan AI Logo" style="display: block; margin: 0 auto 16px; height: 32px; width: auto;" />
        <h1 style="margin: 0; font-size: 24px; font-weight: 800;">Plan AI</h1>
      </div>
      <div style="padding: 32px;">
        <h2 style="font-size: 20px; font-weight: 700; margin: 0 0 16px;">You've been invited!</h2>
        <p style="color: #94a3b8; line-height: 1.7; margin: 0 0 24px;">
          <strong style="color: #f8fafc;">${inviterEmail}</strong> has invited you to join the
          <strong style="color: #a78bfa;">${workspaceName}</strong> workspace on Plan AI.
        </p>
        <a href="${signupUrl}" style="display: inline-block; background: linear-gradient(135deg, #4361EE 0%, #a78bfa 100%); color: #fff; text-decoration: none; font-weight: 600; padding: 14px 32px; border-radius: 8px; font-size: 15px;">
          Accept Invitation
        </a>
        <p style="color: #475569; font-size: 13px; margin: 24px 0 0;">
          Sign up with the email address <strong>${to}</strong> to be automatically added to the workspace.
        </p>
      </div>
    </div>
  `;
}
