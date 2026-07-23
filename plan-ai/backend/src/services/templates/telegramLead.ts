const APP_URL = process.env.APP_URL || "https://plan-ai.blueberrybytes.com";

/**
 * The brief comes from a stranger on Telegram, so it is escaped before it goes
 * anywhere near an HTML email. Nothing in this template interpolates prospect
 * text without passing through here.
 */
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export interface TelegramLeadEmailInput {
  handle: string;
  chatId: string;
  brief: string;
  transcriptId: string;
  /** Whether the prospect sent a voice note rather than typing. */
  viaVoice: boolean;
}

export function renderTelegramLeadEmail(input: TelegramLeadEmailInput): string {
  const transcriptUrl = `${APP_URL}/transcripts/${input.transcriptId}`;
  const brief = escapeHtml(input.brief).slice(0, 2000);
  const handle = escapeHtml(input.handle);
  const channel = input.viaVoice ? "nota de voz" : "texto";

  return `
    <div style="font-family: Inter, sans-serif; max-width: 520px; margin: 0 auto; background: #0b0d11; color: #f8fafc; border-radius: 16px; overflow: hidden; border: 1px solid rgba(167,139,250,0.2);">
      <div style="background: linear-gradient(135deg, #4361EE 0%, #a78bfa 100%); padding: 28px; text-align: center;">
        <h1 style="margin: 0; font-size: 22px; font-weight: 800;">Nuevo lead en Telegram</h1>
      </div>
      <div style="padding: 28px;">
        <p style="color: #94a3b8; line-height: 1.7; margin: 0 0 20px;">
          <strong style="color: #f8fafc;">${handle}</strong> ha pedido una propuesta por ${channel}.
          Berry ya le ha enviado el documento y el diagrama.
        </p>
        <div style="background: rgba(255,255,255,0.04); border-left: 3px solid #a78bfa; padding: 16px; border-radius: 8px; margin: 0 0 24px;">
          <p style="color: #cbd5e1; line-height: 1.6; margin: 0; font-size: 14px; white-space: pre-wrap;">${brief}</p>
        </div>
        <a href="${transcriptUrl}" style="display: inline-block; background: linear-gradient(135deg, #4361EE 0%, #a78bfa 100%); color: #fff; text-decoration: none; font-weight: 600; padding: 13px 28px; border-radius: 8px; font-size: 15px;">
          Ver el lead
        </a>
        <p style="color: #475569; font-size: 13px; margin: 24px 0 0;">
          Chat de Telegram: <strong>${escapeHtml(input.chatId)}</strong> ·
          El cliente está esperando. Cuanto antes le llames, mejor.
        </p>
      </div>
    </div>
  `;
}
