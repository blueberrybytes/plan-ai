export type AuthMechanism = "BASIC" | "API_KEY" | "OAUTH" | "PAT";

export interface BaseIntegrationMetadata {
  authType: AuthMechanism;
  connectedAt?: string;
}

export interface JiraIntegrationMetadata extends BaseIntegrationMetadata {
  authType: "BASIC" | "OAUTH";
  jiraSiteUrl?: string | null;
  jiraSiteId?: string | null;
  email?: string;
  scopes?: string[];
  defaultProjectId?: string;
}

export interface LinearIntegrationMetadata extends BaseIntegrationMetadata {
  authType: "API_KEY" | "OAUTH";
  defaultTeamId?: string;
  organizationUrlKey?: string;
  teamKey?: string;
  planAiLabelId?: string;
}

export interface GoogleIntegrationMetadata extends BaseIntegrationMetadata {
  authType: "OAUTH";
  // Add Google specific keys here if needed later
}

export interface GithubIntegrationMetadata extends BaseIntegrationMetadata {
  authType: "OAUTH" | "API_KEY"; // Typical for GitHub
}

export interface TrelloIntegrationMetadata extends BaseIntegrationMetadata {
  authType: "API_KEY" | "OAUTH";
  defaultBoardId?: string;
  defaultListId?: string;
  planAiLabelId?: string;
}

export interface NotionIntegrationMetadata extends BaseIntegrationMetadata {
  authType: "OAUTH";
  defaultDatabaseId?: string;
}

export interface MicrosoftIntegrationMetadata extends BaseIntegrationMetadata {
  authType: "OAUTH";
  userEmail?: string;
}

export interface AsanaIntegrationMetadata extends BaseIntegrationMetadata {
  authType: "OAUTH" | "PAT";
  asanaWorkspaceGid?: string;
  asanaWorkspaceName?: string;
  defaultProjectGid?: string;
}

export type IntegrationMetadata =
  | JiraIntegrationMetadata
  | LinearIntegrationMetadata
  | GoogleIntegrationMetadata
  | GithubIntegrationMetadata
  | TrelloIntegrationMetadata
  | NotionIntegrationMetadata
  | MicrosoftIntegrationMetadata
  | AsanaIntegrationMetadata;
