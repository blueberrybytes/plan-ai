import type { components } from "../../types/api";

export type FeatureUsageReport = components["schemas"]["FeatureUsageReport"];
export type FeatureUsageRow = components["schemas"]["FeatureUsageRow"];

export const FEATURE_CLIENTS = ["web", "recorder", "mobile", "api", "mcp"] as const;

export interface FeatureTableOptions {
  /** Text to find in the name or the description. */
  query?: string;
  /** Keep only the features with no use in the period. */
  onlyUnused?: boolean;
}

export interface FeatureTable {
  /** Features with at least one use, most used first. */
  used: FeatureUsageRow[];
  /** Features with no use in the period: the candidates to cut. */
  unused: FeatureUsageRow[];
}

const byName = (a: FeatureUsageRow, b: FeatureUsageRow): number =>
  a.feature.localeCompare(b.feature);

/**
 * Splits the features into used and unused. Used ones are sorted by uses,
 * then by users. Unused ones show the most recently used first and the ones
 * never used last.
 */
export const buildFeatureTable = (
  rows: readonly FeatureUsageRow[],
  options: FeatureTableOptions = {},
): FeatureTable => {
  const query = (options.query ?? "").trim().toLowerCase();
  const matching = query
    ? rows.filter(
        (row) =>
          row.feature.toLowerCase().includes(query) ||
          row.description.toLowerCase().includes(query),
      )
    : [...rows];

  const used = options.onlyUnused
    ? []
    : matching
        .filter((row) => row.total > 0)
        .sort((a, b) => b.total - a.total || b.users - a.users || byName(a, b));
  const unused = matching
    .filter((row) => row.total === 0)
    .sort((a, b) => (b.lastUsedDay ?? "").localeCompare(a.lastUsedDay ?? "") || byName(a, b));
  return { used, unused };
};

/** "web 7, mobile 5" for the clients that used the feature, most uses first. */
export const clientsSummary = (row: FeatureUsageRow): string =>
  FEATURE_CLIENTS.map((client) => ({ client, count: row.byClient[client] }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((entry) => `${entry.client} ${entry.count.toLocaleString("en")}`)
    .join(", ");

const csvCell = (value: string | number | null): string => {
  const text = value === null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The report as CSV: one line per feature, most used first, unused at the end. */
export const featureUsageCsv = (report: FeatureUsageReport): string => {
  const { used, unused } = buildFeatureTable(report.features);
  const header = [
    "feature",
    "description",
    "counted_by",
    "uses",
    "users",
    "workspaces",
    ...FEATURE_CLIENTS,
    "last_used_day",
  ];
  const lines = [...used, ...unused].map((row) =>
    [
      row.feature,
      row.description,
      row.source,
      row.total,
      row.users,
      row.workspaces,
      ...FEATURE_CLIENTS.map((client) => row.byClient[client]),
      row.lastUsedDay,
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
};
