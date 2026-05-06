export interface JiraMyselfResponse {
  self: string;
  accountId: string;
  accountType: string;
  emailAddress: string;
  avatarUrls: {
    "16x16": string;
    "24x24": string;
    "32x32": string;
    "48x48": string;
  };
  displayName: string;
  active: boolean;
  timeZone: string;
  locale: string;
}

export interface JiraSummaryResponse {
  totalIssues: string | null;
  totalProjects: number | null;
  latestBoards: string[];
}

export interface JiraSearchResponse {
  issues?: Array<{ id: string }>;
  isLast?: boolean;
}

export interface JiraBoardResponse {
  values: Array<{
    id: number;
    name: string;
    type: string;
  }>;
}
