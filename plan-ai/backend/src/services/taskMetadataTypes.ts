export interface TaskMetadata {
  jira?: {
    issueId: string;
    issueKey: string;
    url: string;
  };
  linear?: {
    issueId: string;
    identifier: string;
    url: string;
  };
  trello?: {
    cardId: string;
    url: string;
    shortLink: string;
  };
}
