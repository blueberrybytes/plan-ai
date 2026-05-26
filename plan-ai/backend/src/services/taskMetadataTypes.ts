/**
 * Work-category tag set by the AI ticket extractor. Lets the frontend split
 * engineering work from support / design / ops / research items so the
 * customer's engineering board only shows engineering tickets.
 */
export type TaskCategory = "engineering" | "design" | "support" | "ops" | "research";

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
  notion?: {
    pageId: string;
    url: string;
  };
  asana?: {
    taskGid: string;
    url: string;
  };
  publicDocUrl?: string;
  publicSlidesUrl?: string;
  /** Set by the AI ticket extractor. Defaults to "engineering" when absent. */
  category?: TaskCategory;
  /**
   * Discrete acceptance-criteria items. Mirrors the bullet list joined into
   * the `Task.acceptanceCriteria` String column. Integrations (Jira / Linear
   * / Notion / Asana) and a future structured API can read this array form.
   */
  acceptanceCriteriaList?: string[];
}
