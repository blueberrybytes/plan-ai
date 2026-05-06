import { renderWorkspaceInvitationEmail } from "./workspaceInvitation";

export { renderWorkspaceInvitationEmail };

export function getAllEmailTemplates() {
  return [
    {
      id: "workspace_invitation",
      name: "Workspace Invitation",
      html: renderWorkspaceInvitationEmail("admin@plan.ai", "Jane Doe", "Acme Corp Workspace"),
    },
  ];
}
