import { renderWorkspaceInvitationEmail } from "./workspaceInvitation";
import { renderTelegramLeadEmail } from "./telegramLead";

export { renderWorkspaceInvitationEmail, renderTelegramLeadEmail };

export function getAllEmailTemplates() {
  return [
    {
      id: "workspace_invitation",
      name: "Workspace Invitation",
      html: renderWorkspaceInvitationEmail("admin@plan.ai", "Jane Doe", "Acme Corp Workspace"),
    },
    {
      id: "telegram_lead",
      name: "Telegram Lead",
      html: renderTelegramLeadEmail({
        handle: "@cliente",
        chatId: "123456789",
        brief: "Quiero una app para que mis camareros tomen comandas y vayan directas a cocina.",
        transcriptId: "clx0000000000",
        viaVoice: true,
      }),
    },
  ];
}
