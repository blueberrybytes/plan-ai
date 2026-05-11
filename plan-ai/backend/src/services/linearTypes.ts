export interface LinearManualConnectRequest {
  apiKey: string;
}

export interface LinearSummaryResponse {
  totalIssues: number | null;
  totalProjects: number | null;
  latestTeams: string[];
}
