import React from "react";
import { Stack } from "@mui/material";
import { WorkspaceResponse } from "../../../store/apis/workspaceApi";
import AuditLogPanel from "./AuditLogPanel";
import SignInRulesPanel from "./SignInRulesPanel";
import WorkspaceDataPanel from "./WorkspaceDataPanel";

interface WorkspaceSecuritySectionProps {
  workspace: WorkspaceResponse;
}

/**
 * Security tab of the team page. Owners and admins read the audit log and the
 * sign-in rules. Only the owner changes rules and manages the workspace data,
 * because the backend allows those actions to the owner only.
 */
const WorkspaceSecuritySection: React.FC<WorkspaceSecuritySectionProps> = ({ workspace }) => {
  const isOwner = workspace.role === "OWNER";

  return (
    <Stack spacing={3}>
      {/* Keyed by workspace so switching workspace resets their state. */}
      <AuditLogPanel key={`audit-${workspace.id}`} workspaceName={workspace.name} />
      <SignInRulesPanel key={`rules-${workspace.id}`} workspace={workspace} canEdit={isOwner} />
      {isOwner ? <WorkspaceDataPanel workspace={workspace} /> : null}
    </Stack>
  );
};

export default WorkspaceSecuritySection;
