import { randomUUID } from "crypto";
import type { IncomingHttpHeaders } from "http";
import { Prisma } from "@prisma/client";
import { rawPrisma } from "../prisma/prismaClient";
import { callerOfRequest, setCallerForRequest } from "./accessScope";
import { logger } from "../utils/logger";

/**
 * Which features people use, as counts.
 *
 * One row per person, feature, client and UTC day, with a counter. It holds a
 * user id and a workspace id and nothing else: no titles, no text, no URLs, no
 * IP address, no user agent. Nothing is sent outside this database.
 *
 * A feature name must be in FEATURE_CATALOGUE. Any other name is dropped, so a
 * client cannot invent names or attach data to one.
 */

export const FEATURE_CLIENTS = ["web", "recorder", "mobile", "api", "mcp"] as const;
export type FeatureClient = (typeof FEATURE_CLIENTS)[number];

/** Who reports the count: the server where the thing happens, or the web app. */
export type FeatureSource = "server" | "client";

export interface FeatureDefinition {
  name: string;
  description: string;
  source: FeatureSource;
}

const server = (name: string, description: string): FeatureDefinition => ({
  name,
  description,
  source: "server",
});
const client = (name: string, description: string): FeatureDefinition => ({
  name,
  description,
  source: "client",
});

/** Tools of the MCP server. Each one is counted as "mcp.<tool_name>". */
export const MCP_TOOL_NAMES = [
  "get_recent_meetings",
  "get_meeting_detail",
  "search_meetings",
  "get_projects",
  "get_tasks",
  "search_tasks",
  "get_task_detail",
  "add_comment",
  "get_project_detail",
  "list_workspace_members",
  "create_task",
  "update_task",
  "semantic_search",
  "generate_document",
] as const;

/**
 * Every feature that is counted. The admin page lists all of them, also the
 * ones with zero uses: those are the candidates to cut.
 */
export const FEATURE_CATALOGUE: readonly FeatureDefinition[] = [
  // Meetings
  server("meeting.recorded", "A recording was uploaded from the recorder or the phone"),
  server("meeting.imported", "An audio or text file was uploaded as a meeting"),
  server("meeting.created_manual", "A meeting was created from pasted or typed text"),
  server("meeting.linked_to_project", "An existing meeting was added to a project"),
  server("meeting.opened", "A meeting was opened (once per person and meeting every 30 minutes)"),
  server("meeting.reprocessed", "A meeting was processed again"),
  server("meeting.audio_played", "The audio of a meeting was requested by the player"),
  server("meeting.audio_deleted", "The audio of a meeting was deleted by hand"),
  server("meeting.notes_emailed", "Meeting notes were sent by email"),
  server("meeting.translated", "A saved transcript was translated"),
  server("meeting.exported", "A transcript was exported as a file"),
  server("meeting.clip_created", "A clip of a meeting was created"),
  server("meeting.live_translation", "Live translation was turned on during a recording"),
  server("meeting.personal_data_hidden", "The view with personal data hidden was opened"),
  server("meeting.speakers_renamed", "Speaker names of a meeting were changed"),
  server("meeting.pushed_to_twenty", "A meeting was pushed to Twenty CRM by hand"),
  // Chat
  server("chat.project_message", "A message was sent in a project chat"),
  server("chat.meeting_message", "A message was sent in the chat of a meeting"),
  server("chat.assistant_message", "A message was sent to the assistant"),
  server("chat.live_message", "A question was asked during a live recording"),
  server("chat.live_summary", "A live summary was asked for during a recording"),
  // Tasks
  server("task.created_manual", "A task was created by hand"),
  server("task.status_changed", "The status of a task was changed"),
  server("task.refined", "A task was rewritten with AI"),
  server("task.created_from_pain_point", "A pain point was turned into a task"),
  server("task.synced.jira", "A task was sent to Jira"),
  server("task.synced.linear", "A task was sent to Linear"),
  server("task.synced.trello", "A task was sent to Trello"),
  server("task.synced.asana", "A task was sent to Asana"),
  server("task.synced.notion", "A task was sent to Notion"),
  // Documents, slides and diagrams
  server("doc.generated", "A document was generated"),
  server("doc.imported", "A document was imported from a file"),
  server("slides.generated", "A presentation was generated"),
  server("slides.slide_generated", "One more slide was generated for a presentation"),
  server("diagram.generated", "A diagram was generated"),
  server("diagram.assistant_edit", "A diagram was changed through its assistant"),
  server("doc.shared_public", "A public link was created for a document"),
  server("slides.shared_public", "A public link was created for a presentation"),
  server("diagram.shared_public", "A public link was created for a diagram"),
  // Themes and templates
  server("theme.created", "A brand theme was created"),
  server("theme.imported_from_website", "A brand theme was read from a website"),
  server("slide_template.created", "A slide template was created"),
  // Projects and their files
  server("project.created", "A project was created"),
  server("project.restricted", "A project was restricted to some people"),
  server("project.digest_generated", "A project digest was generated"),
  server("project.file_uploaded", "A file was uploaded to a project"),
  server("project.website_imported", "A website was imported into the files of a project"),
  server("project.drive_imported", "Files were imported from Google Drive"),
  server("project.onedrive_imported", "Files were imported from OneDrive"),
  server("project.github_connected", "A GitHub repository was connected to a project"),
  // Notes, reports and trackers
  server("note.created", "A note was created"),
  server("daily_report.submitted", "A daily report was written and sent for extraction"),
  server("team_report.viewed", "The team report was opened"),
  server("tracker.created", "A tracker was created (personal mode)"),
  server("tracker.entry_added", "A tracker entry was added by hand (personal mode)"),
  server("tracker.entries_extracted", "Tracker entries were extracted from text (personal mode)"),
  // Search, comments, webhooks and the public API
  server("search.used", "A search query was run across the workspace"),
  server("comment.created", "A comment was written on a task or a meeting"),
  server("webhook.created", "A webhook endpoint was created"),
  server("api.request", "A request was made to the public REST API"),
  // Integrations
  server("calendar.connected.google", "Google Calendar was connected"),
  server("calendar.connected.outlook", "Outlook Calendar was connected"),
  server("integration.connected.jira", "Jira was connected"),
  server("integration.connected.linear", "Linear was connected"),
  server("integration.connected.trello", "Trello was connected"),
  server("integration.connected.asana", "Asana was connected"),
  server("integration.connected.notion", "Notion was connected"),
  server("integration.connected.twenty", "Twenty CRM was connected"),
  server("integration.connected.google_drive", "Google Drive was connected"),
  server("integration.connected.onedrive", "OneDrive was connected"),
  server("integration.connected.github", "A GitHub installation was linked"),
  server("mcp.token_created", "An MCP token was created"),
  // Workspace
  server("workspace.member_invited", "A member was invited to a workspace"),
  server("workspace.exported", "The workspace was exported as JSON"),
  server("voice_profile.saved", "A voice profile was recorded"),
  // MCP tools
  ...MCP_TOOL_NAMES.map((tool) => server(`mcp.${tool}`, `MCP tool ${tool} was called`)),
  // Web only: the server cannot see these
  client("nav.projects", "The projects section was opened"),
  client("nav.meetings", "The meetings section was opened"),
  client("nav.tasks", "The task board of a project was opened"),
  client("nav.docs", "The documents section was opened"),
  client("nav.slides", "The slides section was opened"),
  client("nav.diagrams", "The diagrams section was opened"),
  client("nav.notes", "The notes section was opened"),
  client("nav.chat", "The chat section was opened"),
  client("nav.daily_report", "The daily report section was opened"),
  client("nav.team_report", "The team report section was opened"),
  client("nav.trackers", "The trackers section was opened"),
  client("nav.integrations", "The integrations section was opened"),
  client("nav.brand_themes", "The brand themes section was opened"),
  client("doc.printed_pdf", "A document was printed or saved as PDF"),
  client("doc.exported_word", "A document or meeting notes were downloaded as Word"),
  client("slides.exported_pptx", "A presentation was downloaded as PowerPoint"),
  client("theme.template_downloaded", "The theme template file was downloaded"),
  client("workspace.audit_log_csv", "The audit log was downloaded as CSV"),
];

const FEATURES_BY_NAME: ReadonlyMap<string, FeatureDefinition> = new Map(
  FEATURE_CATALOGUE.map((f) => [f.name, f]),
);

export const isFeatureName = (value: unknown): value is string =>
  typeof value === "string" && FEATURES_BY_NAME.has(value);

export const isFeatureClient = (value: unknown): value is FeatureClient =>
  typeof value === "string" && (FEATURE_CLIENTS as readonly string[]).includes(value);

/** Clients that may report through POST /api/usage/feature. */
const REPORTING_CLIENTS: ReadonlySet<string> = new Set(["web", "recorder", "mobile"]);

export interface TrackFeatureInput {
  feature: string;
  /** Left out: the client of the current request, or "api" outside one. */
  client?: FeatureClient;
  /** Left out: the workspace of the current request. */
  workspaceId?: string | null;
  /** Left out: the user of the current request. */
  userId?: string | null;
}

interface Increment {
  day: string;
  feature: string;
  client: FeatureClient;
  workspaceId: string;
  userId: string;
  count: number;
}

/** Most distinct (day, feature, client, workspace, user) keys held in memory. */
export const MAX_BUFFERED_KEYS = 5000;
const FLUSH_INTERVAL_MS = 5000;
/** Rows per INSERT. Six parameters each, far below the Postgres limit. */
const FLUSH_CHUNK = 500;

let buffer = new Map<string, Increment>();
let timer: NodeJS.Timeout | null = null;
let lastFailureLog = 0;

/** The UTC calendar day of a moment, as "YYYY-MM-DD". */
export const utcDay = (at: Date = new Date()): string => at.toISOString().slice(0, 10);

const keyOf = (i: Omit<Increment, "count">): string =>
  `${i.day}|${i.feature}|${i.client}|${i.workspaceId}|${i.userId}`;

/** Adds to the buffer. False when the buffer is full and the key is new. */
const addToBuffer = (target: Map<string, Increment>, inc: Increment): boolean => {
  const key = keyOf(inc);
  const existing = target.get(key);
  if (existing) {
    existing.count += inc.count;
    return true;
  }
  if (target.size >= MAX_BUFFERED_KEYS) return false;
  target.set(key, { ...inc });
  return true;
};

/**
 * Counts one use of a feature. It only touches memory: the database is
 * written later by flushFeatureUsage. It never throws. Returns false when the
 * name or the client is not in the lists, or the buffer is full.
 */
export function trackFeature(input: TrackFeatureInput, now: Date = new Date()): boolean {
  try {
    if (!isFeatureName(input.feature)) return false;
    const caller = callerOfRequest();
    const client = input.client ?? caller?.client ?? "api";
    if (!isFeatureClient(client)) return false;
    const workspaceId = input.workspaceId === undefined ? caller?.workspaceId : input.workspaceId;
    const userId = input.userId === undefined ? caller?.userId : input.userId;
    return addToBuffer(buffer, {
      day: utcDay(now),
      feature: input.feature,
      client,
      workspaceId: typeof workspaceId === "string" ? workspaceId : "",
      userId: typeof userId === "string" ? userId : "",
      count: 1,
    });
  } catch {
    return false;
  }
}

/**
 * A count reported by an app through POST /api/usage/feature. Only names the
 * server cannot count itself are accepted, so an app cannot inflate the rest.
 */
export function trackClientFeature(
  input: { feature: unknown; client: unknown; workspaceId?: string | null; userId?: string | null },
  now: Date = new Date(),
): boolean {
  if (!isFeatureName(input.feature) || !isFeatureClient(input.client)) return false;
  if (FEATURES_BY_NAME.get(input.feature)?.source !== "client") return false;
  if (!REPORTING_CLIENTS.has(input.client)) return false;
  return trackFeature(
    {
      feature: input.feature,
      client: input.client,
      workspaceId: input.workspaceId,
      userId: input.userId,
    },
    now,
  );
}

const writeChunk = async (rows: Increment[]): Promise<void> => {
  const values = rows.map(
    (r) =>
      Prisma.sql`(${randomUUID()}, ${r.day}::date, ${r.feature}, ${r.client}, ${r.workspaceId}, ${r.userId}, ${r.count})`,
  );
  await rawPrisma.$executeRaw`
    INSERT INTO "FeatureUsageDaily" ("id", "day", "feature", "client", "workspaceId", "userId", "count")
    VALUES ${Prisma.join(values)}
    ON CONFLICT ("day", "feature", "client", "workspaceId", "userId")
    DO UPDATE SET "count" = "FeatureUsageDaily"."count" + EXCLUDED."count"`;
};

/**
 * Writes the buffered counts: one INSERT with an atomic increment per 500
 * keys. Safe to call from several places at once, because each call takes its
 * own copy of the buffer before the first await. It never throws. Counts that
 * could not be written go back to the buffer for the next run.
 */
export async function flushFeatureUsage(): Promise<void> {
  if (buffer.size === 0) return;
  const taken = buffer;
  buffer = new Map();
  // Same order in every process, so two servers writing the same rows cannot
  // lock each other.
  const rows = [...taken.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  for (let start = 0; start < rows.length; start += FLUSH_CHUNK) {
    const chunk = rows.slice(start, start + FLUSH_CHUNK).map(([, inc]) => inc);
    try {
      await writeChunk(chunk);
    } catch (err) {
      for (const inc of chunk) addToBuffer(buffer, inc);
      const now = Date.now();
      if (now - lastFailureLog > 60_000) {
        lastFailureLog = now;
        logger.warn("[feature-usage] could not write the counts, will retry", err);
      }
    }
  }
}

/** Starts the periodic write. Called once by the server at startup. */
export function startFeatureUsageFlusher(intervalMs: number = FLUSH_INTERVAL_MS): void {
  if (timer) return;
  timer = setInterval(() => void flushFeatureUsage(), intervalMs);
  // The timer must not keep the process alive on shutdown.
  timer.unref();
}

/** Stops the periodic write and writes what is left. Called on shutdown. */
export async function stopFeatureUsageFlusher(): Promise<void> {
  if (timer) clearInterval(timer);
  timer = null;
  await flushFeatureUsage();
}

/** For tests. */
export function resetFeatureUsageBuffer(): void {
  buffer = new Map();
  lastFailureLog = 0;
}

/** For tests. */
export const bufferedFeatureKeys = (): number => buffer.size;

/**
 * Which app made a request. Read from headers and used only to pick one of
 * five labels: neither the origin nor the user agent is stored.
 */
export function clientFromRequest(
  request?: { headers?: IncomingHttpHeaders } | null,
  fallback: FeatureClient = "api",
): FeatureClient {
  const headers = request?.headers;
  if (!headers) return fallback;
  const origin = typeof headers.origin === "string" ? headers.origin : "";
  const agent = typeof headers["user-agent"] === "string" ? headers["user-agent"] : "";
  if (origin.startsWith("app://") || /Electron\//.test(agent)) return "recorder";
  // The web app sends this header with every call (utils/baseQuery.ts).
  if (headers["x-current-path"] !== undefined) return "web";
  if (/okhttp|CFNetwork|Expo|Dalvik/i.test(agent)) return "mobile";
  if (origin) return "web";
  return fallback;
}

/**
 * Remembers who makes the current request, so code further down can count a
 * feature without being handed the user. Called by BaseWorkspaceController
 * once the workspace access check has passed. Never throws.
 */
export function rememberRequester(
  request: { headers?: IncomingHttpHeaders } | null | undefined,
  userId: string,
  workspaceId: string,
): void {
  try {
    setCallerForRequest({ userId, workspaceId, client: clientFromRequest(request) });
  } catch {
    // Counting must never break a request.
  }
}

/**
 * Counts one request to the public REST API and marks the rest of the
 * request as made by the "api" client, for what is counted further down.
 */
export function countApiRequest(userId: string, workspaceId: string): boolean {
  try {
    setCallerForRequest({ userId, workspaceId, client: "api" });
  } catch {
    // Counting must never break a request.
  }
  return trackFeature({ feature: "api.request", client: "api", workspaceId, userId });
}

/** Counts one use of a feature by whoever makes the current request. */
export const countFeature = (feature: string): boolean => trackFeature({ feature });

/** Counts a feature for a request whose user and workspace the caller already has. */
export const trackFeatureFor = (
  request: { headers?: IncomingHttpHeaders } | null | undefined,
  feature: string,
  userId: string,
  workspaceId: string,
): boolean => trackFeature({ feature, client: clientFromRequest(request), workspaceId, userId });

/** Counts a feature of the endpoints that only the recorder and the phone use. */
export const countRecorderFeature = (
  request: { headers?: IncomingHttpHeaders } | null | undefined,
  feature: string,
): boolean => trackFeature({ feature, client: recordingClient(request) });

/** The feature counted for a chat message, by whether the thread is about a meeting. */
export const chatMessageFeature = (transcriptId?: string | null): string =>
  transcriptId ? "chat.meeting_message" : "chat.project_message";

/** The feature counted when a meeting is created, by where its text or audio came from. */
export const meetingCreatedFeature = (source?: string | null): string => {
  if (source === "RECORDING") return "meeting.recorded";
  if (source === "UPLOAD" || source === "IMPORTED") return "meeting.imported";
  return "meeting.created_manual";
};

/**
 * The recorder or the phone. For the endpoints only those two use: a request
 * that does not look like the desktop recorder comes from the phone.
 */
export const recordingClient = (
  request?: { headers?: IncomingHttpHeaders } | null,
): FeatureClient => (clientFromRequest(request) === "recorder" ? "recorder" : "mobile");

/** The feature counted when each provider is connected. */
const CONNECTED_FEATURES: Readonly<Record<string, string>> = {
  JIRA: "integration.connected.jira",
  LINEAR: "integration.connected.linear",
  TRELLO: "integration.connected.trello",
  ASANA: "integration.connected.asana",
  NOTION: "integration.connected.notion",
  TWENTY: "integration.connected.twenty",
  GITHUB: "integration.connected.github",
  GOOGLE_DRIVE: "integration.connected.google_drive",
  ONEDRIVE: "integration.connected.onedrive",
  GOOGLE_CALENDAR: "calendar.connected.google",
  OUTLOOK_CALENDAR: "calendar.connected.outlook",
};

/**
 * Counts a connection to an external tool. Connections are made from the web
 * settings, and an OAuth callback carries no signed-in request, so the client
 * is "web" unless the current request says otherwise.
 */
export function trackIntegrationConnected(
  provider: string,
  workspaceId?: string | null,
  userId?: string | null,
): boolean {
  const caller = callerOfRequest();
  return trackFeature({
    feature: CONNECTED_FEATURES[provider] ?? "",
    client: isFeatureClient(caller?.client) ? caller.client : "web",
    workspaceId: workspaceId ?? undefined,
    userId: userId ?? undefined,
  });
}

/** The feature counted for each kind of read in services/meetingAccessAudit.ts. */
const MEETING_ACCESS_FEATURES: Readonly<Record<string, string>> = {
  viewed: "meeting.opened",
  audio_accessed: "meeting.audio_played",
  notes_sent: "meeting.notes_emailed",
  translated: "meeting.translated",
  exported: "meeting.exported",
  clip_created: "meeting.clip_created",
};

/** Counts a read of a meeting. Called from the one place that logs them. */
export function trackMeetingAccess(access: {
  kind: string;
  channel: string;
  workspaceId: string;
  userId?: string | null;
  request?: { headers?: IncomingHttpHeaders } | null;
}): boolean {
  const feature = MEETING_ACCESS_FEATURES[access.kind];
  if (!feature) return false;
  const client = isFeatureClient(access.channel)
    ? access.channel
    : clientFromRequest(access.request);
  return trackFeature({
    feature,
    client,
    workspaceId: access.workspaceId,
    userId: access.userId,
  });
}

/**
 * Makes an MCP server count each tool call, by tool name only. The arguments
 * of the call are never read here.
 */
export function countMcpToolCalls(
  mcpServer: { registerTool: unknown },
  userId: string,
  workspaceId: string,
): void {
  const original = mcpServer.registerTool as (...args: unknown[]) => unknown;
  mcpServer.registerTool = (...args: unknown[]): unknown => {
    const name = args[0];
    const handler = args[args.length - 1];
    if (typeof name !== "string" || typeof handler !== "function") {
      return original.apply(mcpServer, args);
    }
    const run = handler as (...handlerArgs: unknown[]) => unknown;
    const counted = (...handlerArgs: unknown[]): unknown => {
      // What the tool does further down (a task status change, a document) is
      // counted for this user as the "mcp" client too.
      setCallerForRequest({ userId, workspaceId, client: "mcp" });
      trackFeature({ feature: `mcp.${name}`, client: "mcp", workspaceId, userId });
      return run(...handlerArgs);
    };
    return original.apply(mcpServer, [...args.slice(0, -1), counted]);
  };
}

// ─── Admin report ──────────────────────────────────────────────────────────

export interface FeatureUsageByClient {
  web: number;
  recorder: number;
  mobile: number;
  api: number;
  mcp: number;
}

export interface FeatureUsageRow {
  feature: string;
  description: string;
  /** "server" when the backend counts it, "client" when the web app reports it. */
  source: FeatureSource;
  /** Uses in the period. */
  total: number;
  /** Distinct users in the period. */
  users: number;
  /** Distinct workspaces in the period. */
  workspaces: number;
  byClient: FeatureUsageByClient;
  /** Last day with a use, in any period ("YYYY-MM-DD"). Null when never used. */
  lastUsedDay: string | null;
  /** Uses per day, one number per entry of `dayLabels`. */
  series: number[];
}

export interface FeatureUsageReport {
  days: number;
  /** The UTC days of the period, oldest first ("YYYY-MM-DD"). */
  dayLabels: string[];
  totalUses: number;
  /** Distinct users with at least one use in the period. */
  activeUsers: number;
  /** Distinct workspaces with at least one use in the period. */
  activeWorkspaces: number;
  /** Every feature of the catalogue, the unused ones included. */
  features: FeatureUsageRow[];
}

export const MAX_REPORT_DAYS = 365;

const clampDays = (days: unknown): number => {
  const n = typeof days === "number" && Number.isFinite(days) ? Math.floor(days) : 30;
  return Math.min(MAX_REPORT_DAYS, Math.max(1, n));
};

const toDayString = (value: Date | string | null | undefined): string | null => {
  if (!value) return null;
  return typeof value === "string" ? value.slice(0, 10) : utcDay(value);
};

interface FeatureTotalsRow {
  feature: string;
  total: bigint | number | null;
  users: bigint | number;
  workspaces: bigint | number;
}

interface ActiveTotalsRow {
  users: bigint | number;
  workspaces: bigint | number;
}

/**
 * Usage per feature over the last `days` UTC days, today included. All sums
 * and distinct counts are done by the database.
 */
export async function getFeatureUsageReport(
  daysInput?: number,
  now: Date = new Date(),
): Promise<FeatureUsageReport> {
  const days = clampDays(daysInput);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dayLabels = Array.from({ length: days }, (_, i) =>
    utcDay(new Date(today - (days - 1 - i) * 86_400_000)),
  );
  const from = new Date(`${dayLabels[0]}T00:00:00.000Z`);
  const inPeriod = { day: { gte: from } };

  const [totals, active, perClient, perDay, lastUsed] = await Promise.all([
    rawPrisma.$queryRaw<FeatureTotalsRow[]>`
      SELECT "feature",
             SUM("count") AS "total",
             COUNT(DISTINCT "userId") FILTER (WHERE "userId" <> '') AS "users",
             COUNT(DISTINCT "workspaceId") FILTER (WHERE "workspaceId" <> '') AS "workspaces"
      FROM "FeatureUsageDaily"
      WHERE "day" >= ${dayLabels[0]}::date
      GROUP BY "feature"`,
    rawPrisma.$queryRaw<ActiveTotalsRow[]>`
      SELECT COUNT(DISTINCT "userId") FILTER (WHERE "userId" <> '') AS "users",
             COUNT(DISTINCT "workspaceId") FILTER (WHERE "workspaceId" <> '') AS "workspaces"
      FROM "FeatureUsageDaily"
      WHERE "day" >= ${dayLabels[0]}::date`,
    rawPrisma.featureUsageDaily.groupBy({
      by: ["feature", "client"],
      where: inPeriod,
      _sum: { count: true },
    }),
    rawPrisma.featureUsageDaily.groupBy({
      by: ["feature", "day"],
      where: inPeriod,
      _sum: { count: true },
    }),
    rawPrisma.featureUsageDaily.groupBy({ by: ["feature"], _max: { day: true } }),
  ]);

  const totalsByFeature = new Map(totals.map((row) => [row.feature, row]));
  const lastByFeature = new Map(lastUsed.map((row) => [row.feature, toDayString(row._max.day)]));
  const dayIndex = new Map(dayLabels.map((label, i) => [label, i]));

  const clientsByFeature = new Map<string, FeatureUsageByClient>();
  for (const row of perClient) {
    if (!isFeatureClient(row.client)) continue;
    const entry = clientsByFeature.get(row.feature) ?? emptyByClient();
    entry[row.client] += row._sum.count ?? 0;
    clientsByFeature.set(row.feature, entry);
  }

  const seriesByFeature = new Map<string, number[]>();
  for (const row of perDay) {
    const index = dayIndex.get(toDayString(row.day) ?? "");
    if (index === undefined) continue;
    const series = seriesByFeature.get(row.feature) ?? new Array<number>(days).fill(0);
    series[index] += row._sum.count ?? 0;
    seriesByFeature.set(row.feature, series);
  }

  // Only the catalogue is reported. A name that was removed from the code
  // keeps its rows in the table and is left out here.
  const features = FEATURE_CATALOGUE.map((definition): FeatureUsageRow => {
    const row = totalsByFeature.get(definition.name);
    return {
      feature: definition.name,
      description: definition.description,
      source: definition.source,
      total: Number(row?.total ?? 0),
      users: Number(row?.users ?? 0),
      workspaces: Number(row?.workspaces ?? 0),
      byClient: clientsByFeature.get(definition.name) ?? emptyByClient(),
      lastUsedDay: lastByFeature.get(definition.name) ?? null,
      series: seriesByFeature.get(definition.name) ?? new Array<number>(days).fill(0),
    };
  });

  return {
    days,
    dayLabels,
    totalUses: features.reduce((sum, f) => sum + f.total, 0),
    activeUsers: Number(active[0]?.users ?? 0),
    activeWorkspaces: Number(active[0]?.workspaces ?? 0),
    features,
  };
}

function emptyByClient(): FeatureUsageByClient {
  return { web: 0, recorder: 0, mobile: 0, api: 0, mcp: 0 };
}
