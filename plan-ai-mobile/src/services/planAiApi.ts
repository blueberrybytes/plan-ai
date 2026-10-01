import { Platform } from "react-native";
import * as Sentry from '@sentry/react-native';
import * as LegacyFileSystem from "expo-file-system/legacy";
import type { components, operations } from '../types/api';
import { featureOfUrl, reportUnexpected, stripQuery } from '../utils/reportError';

// ── Types sourced from the generated backend swagger ──────────────────────────
export type Workspace              = components['schemas']['WorkspaceResponse'];
export type WorkspaceMemberResponse = components['schemas']['WorkspaceMemberResponse'];
export type WorkspaceTeamResponse  = components['schemas']['WorkspaceTeamResponse'];
export type Project                = components['schemas']['ProjectResponse'];
export type Task                   = components['schemas']['TaskResponse'];
// StandaloneTranscriptResponse includes mobile-specific fields:
// durationSeconds, speakerCount, sentiment, tasks, utterances, chatThread
export type TranscriptMetadata = components['schemas']['TranscriptMetadata'];

export type Transcript = Omit<components['schemas']['StandaloneTranscriptResponse'], 'metadata'> & {
  metadata?: TranscriptMetadata | null;
};
export type Context                = components['schemas']['ContextResponse'];
export type ContextFileResponse    = components['schemas']['ContextFileResponse'];
export type AiModel                = components['schemas']['AiModelResponse'];
export type UserIntegrationSummary = components['schemas']['IntegrationSummaryResponse'];
export type TwentyCompanyItem      = components['schemas']['TwentyCompanyItem'];
export type PushTranscriptToTwentyRequest = components['schemas']['PushTranscriptToTwentyRequest'];
export type PushTranscriptToTwentyResponse = components['schemas']['PushTranscriptToTwentyResponse'];
export type DocDocumentResponse    = components['schemas']['DocDocumentResponse'];
export type UserResponse           = components['schemas']['UserResponse'];
export type CreateStandaloneTranscriptBody = components['schemas']['CreateStandaloneTranscriptBody'];
export type SubscriptionStatusResponse = components['schemas']['SubscriptionStatusResponse'];
export type UpdateSpeakerNamesBody = components['schemas']['UpdateSpeakerNamesBody'];
export type TranscriptAudio        = components['schemas']['TranscriptAudioResponse'];
export type RecordingBookmark      = components['schemas']['RecordingBookmark'];
export type MeetingCalendarEvent   = components['schemas']['MeetingCalendarEvent'];
export type Note                   = components['schemas']['NoteResponse'];
export type NoteList               = components['schemas']['NoteListResponse'];
export type CreateNoteRequest      = components['schemas']['CreateNoteRequest'];
export type UpdateNoteRequest      = components['schemas']['UpdateNoteRequest'];
export type NoteVisibility         = components['schemas']['NoteVisibilityValue'];
export type NotePeriod             = components['schemas']['NotePeriodValue'];
/** Which notes GET /api/notes returns. Mirrors the backend's list of scopes. */
export type NoteScope = "all" | "inbox" | "pinned" | "mine" | "shared" | "trash";
export type WorkspaceKind          = components['schemas']['WorkspaceKind'];
export type PersonalStatus         = components['schemas']['PersonalStatusResponse'];
export type Tracker                = components['schemas']['TrackerResponse'];
export type TrackerStats           = components['schemas']['TrackerStatsResponse'];
export type TrackerDay             = components['schemas']['TrackerDayValue'];
export type TrackerEntry           = components['schemas']['TrackerEntryResponse'];
export type TrackerEntryStatus     = components['schemas']['TrackerEntryStatusValue'];
export type AddTrackerEntryRequest = components['schemas']['AddEntryRequest'];
export type UpdateTrackerEntryRequest = components['schemas']['UpdateEntryRequest'];
export type ReviewTrackerEntriesRequest = components['schemas']['ReviewEntriesRequest'];
export type ExtractTrackerEntriesRequest = components['schemas']['ExtractRequest'];
export type ExtractTrackerEntriesResponse = components['schemas']['ExtractResponse'];
export type TrackerStatsQuery      = operations['GetTrackerStats']['parameters']['query'];
export type TrackerEntriesQuery    = NonNullable<operations['ListTrackerEntries']['parameters']['query']>;
export type DailyReportStatus      = components['schemas']['DailyReportStatusResponse'];
export type TaskUpdateProposal     = components['schemas']['TaskUpdateProposalResponse'];
export type TaskUpdateKind         = components['schemas']['TaskUpdateKindValue'];
export type DailyReportExtractResponse = components['schemas']['DailyReportExtractResponse'];
export type ReviewProposalItem     = components['schemas']['ReviewProposalItem'];
export type ReviewProposalsResponse = components['schemas']['ReviewProposalsResponse'];

/**
 * An API error that keeps the HTTP status, so callers can tell a request
 * worth retrying (network, 5xx, 429) from one that will never succeed (4xx).
 * `status` is undefined when the request never got an answer.
 */
export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * A note PATCH sent with a baseVersion the server has moved past. `current`
 * is the server's copy when the answer carried it, null otherwise (the app
 * then fetches the note).
 */
export class NoteConflictError extends HttpError {
  constructor(
    message: string,
    public readonly current: Note | null,
  ) {
    super(message, 409);
    this.name = "NoteConflictError";
  }
}

/**
 * A refused trackers call. `code` is the backend's reason when it sent one,
 * e.g. "missing_api_key" or "personal_mode_required".
 */
export class TrackerApiError extends HttpError {
  constructor(
    message: string,
    status?: number,
    public readonly code?: string,
  ) {
    super(message, status);
    this.name = "TrackerApiError";
  }
}

// Trackers calls never show an alert: the screen says what went wrong.
// Reading text with AI can take a while, so extract gets longer.
const TRACKERS_TIMEOUT_MS = 20000;
const TRACKERS_EXTRACT_TIMEOUT_MS = 90000;
// Refusals the trackers screen explains. Any other failed status is reported.
const EXPECTED_TRACKER_STATUSES = new Set([400, 401, 402, 403, 404, 409, 422, 429]);

// Notes calls run in the background outbox. They never show an alert and
// give up sooner than the default 60 s, so a bad network does not hold the queue.
const NOTES_TIMEOUT_MS = 20000;

let rawBaseUrl = process.env.EXPO_PUBLIC_PLAN_AI_API_URL ?? "http://localhost:8080";
if (__DEV__ && Platform.OS === 'android') {
  rawBaseUrl = rawBaseUrl.replace("localhost", "10.0.2.2").replace("127.0.0.1", "10.0.2.2");
}
let BASE_URL = rawBaseUrl.replace(/\/+$/, "");

// A 5xx is always unexpected. The URL goes without its query string: a
// note search puts the user's words there.
function report5xx(res: Response): void {
  if (res.status < 500) return;
  const url = stripQuery(res.url);
  const errorMsg = `API 5xx Error: ${res.status} on ${url}`;
  console.error(errorMsg);
  Sentry.captureException(new Error(errorMsg), {
    tags: { url, status: res.status.toString(), feature: featureOfUrl(url) },
    extra: { statusText: res.statusText }
  });
}

// A 2xx whose body is not JSON. Reported, then thrown as before.
async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch (err) {
    const url = stripQuery(res.url);
    reportUnexpected(err, featureOfUrl(url), { url, status: res.status });
    throw err;
  }
}

async function handleResponseWithRetry<T>(
  res: Response,
  retryRequest: () => Promise<Response>,
): Promise<T> {
  report5xx(res);

  // 403 = role-based permission failure — refreshing the token won't help, return error immediately
  if (res.status === 403) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new HttpError((body as { message?: string }).message ?? `HTTP 403`, 403);
  }

  // 401 = token expired/invalid — refresh and retry once
  if (res.status === 401) {
    console.log(`HTTP 401 encountered, attempting token refresh...`);
    const refreshedRes = await retryRequest();
    if (!refreshedRes.ok) {
      report5xx(refreshedRes);
      const body = await refreshedRes.json().catch(() => ({ message: refreshedRes.statusText }));
      throw new HttpError(
        (body as { message?: string }).message ?? `HTTP ${refreshedRes.status}`,
        refreshedRes.status,
      );
    }
    const json = await readJson(refreshedRes);
    return json.data !== undefined ? json.data : json;
  }

  // 429 = rate limit — show a friendly message instead of a raw error
  if (res.status === 429) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const data = body as Record<string, unknown>;
    if (data.code === "usage_limit_exceeded") {
      const limitType = data.limitType as string;
      const friendly = limitType === "llm" ? "AI token" : limitType === "recording" ? "recording hour" : "generation";
      throw new HttpError(
        `You've reached your monthly ${friendly} limit. Upgrade your plan or wait until next billing cycle.`,
        429,
      );
    }
    throw new HttpError("Rate limit reached. Please wait a moment before trying again.", 429);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new HttpError((body as { message?: string }).message ?? `HTTP ${res.status}`, res.status);
  }
  const json = await readJson(res);
  return json.data !== undefined ? json.data : json;
}

export const createPlanAiApi = (
  getToken: (forceRefresh?: boolean) => Promise<string | null>,
  getWorkspaceId: () => string | null,
) => {
  const getAuthHeaders = async (forceRefresh = false): Promise<HeadersInit> => {
    console.log(`[planAiApi] Requesting auth token (force: ${forceRefresh})...`);
    const token = await getToken(forceRefresh);
    console.log(`[planAiApi] Token received.`);
    if (!token) throw new Error("No auth token available");
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    const wsId = getWorkspaceId();
    if (wsId) {
      headers["X-Workspace-Id"] = wsId;
    }
    return headers;
  };

  const safeFetch = async (url: string, init?: RequestInit, silent = false, timeoutMs = 60000): Promise<Response> => {
    console.log(`[planAiApi] Invoking fetch to URL: ${url}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs); // configurable timeout

    try {
      const res = await fetch(url, { ...init, signal: controller.signal as any });
      clearTimeout(timeoutId);
      console.log(`[planAiApi] Fetch successful, status: ${res.status}`);
      return res;
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.error("[planAiApi] Network/CORS/DNS Error:", err);
      if (err.name === 'AbortError') {
         Sentry.captureException(new Error(`API Connection Timeout`), { tags: { url: stripQuery(url) } });
         if (!silent) alert(`API Connection Timeout: The server did not respond after ${timeoutMs/1000}s. \nURL: ${url}`);
      } else {
         Sentry.captureException(err, { tags: { url: stripQuery(url) } });
         if (!silent) alert(`API Connection Error: ${err instanceof Error ? err.message : String(err)} \nURL: ${url}`);
      }
      throw err;
    }
  };

  // Variant of safeFetch that suppresses the alert banner on network errors.
  // Use this when the caller already handles the error gracefully (e.g. .catch(() => [])).
  const silentFetch = (url: string, init?: RequestInit, timeoutMs = 60000) => safeFetch(url, init, true, timeoutMs);

  // Auth headers with the workspace of a note. Falls back to the active one.
  const noteHeaders = async (force: boolean, workspaceId?: string | null): Promise<HeadersInit> => {
    const headers = { ...(await getAuthHeaders(force)) } as Record<string, string>;
    if (workspaceId) headers["X-Workspace-Id"] = workspaceId;
    return headers;
  };

  // Fetch for the notes outbox. Being offline is normal for it, so a network
  // error is not sent to Sentry and never shows an alert. It becomes an
  // HttpError with no status, which the outbox retries later.
  const noteFetch = async (url: string, init: RequestInit): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), NOTES_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal as any });
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      throw new HttpError(aborted ? "The server did not answer in time" : "No connection");
    } finally {
      clearTimeout(timeoutId);
    }
  };

  /**
   * One trackers call. A network error becomes a TrackerApiError with no
   * status (offline). A refusal keeps the status and the backend's code.
   * Only the status goes to Sentry: bodies may hold health data.
   */
  const trackerRequest = async <T>(
    path: string,
    opts: {
      method?: string;
      body?: unknown;
      workspaceId?: string | null;
      timeoutMs?: number;
      /** Sentry tag. The daily report shares this helper. */
      feature?: string;
    } = {},
  ): Promise<T> => {
    const send = async (force: boolean): Promise<Response> => {
      const headers = await noteHeaders(force, opts.workspaceId);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs ?? TRACKERS_TIMEOUT_MS);
      try {
        return await fetch(`${BASE_URL}${path}`, {
          method: opts.method ?? "GET",
          headers,
          body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
          signal: controller.signal as any,
        });
      } catch (err) {
        const aborted = err instanceof Error && err.name === "AbortError";
        throw new TrackerApiError(aborted ? "The server did not answer in time" : "No connection");
      } finally {
        clearTimeout(timeoutId);
      }
    };
    let res = await send(false);
    if (res.status === 401) res = await send(true);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        message?: string;
        code?: string;
        limitType?: string;
      };
      // 5xx, and statuses the screen has no words for (413, 405...). The
      // usual refusals (400, 401, 402, 403, 404, 409, 422, 429) are expected.
      if (!EXPECTED_TRACKER_STATUSES.has(res.status)) {
        Sentry.captureMessage("Trackers request failed", {
          level: res.status >= 500 ? "error" : "warning",
          tags: { status: String(res.status), feature: opts.feature ?? "trackers" },
          extra: { path: stripQuery(path), method: opts.method ?? "GET", code: body.code },
        });
      }
      let message = body.message ?? `HTTP ${res.status}`;
      if (res.status === 429) {
        message =
          body.code === "usage_limit_exceeded"
            ? "You have reached the monthly AI limit of this workspace."
            : "Too many requests. Wait a moment and try again.";
      }
      throw new TrackerApiError(message, res.status, body.code);
    }
    let json: any;
    try {
      json = await res.json();
    } catch (err) {
      // The server said yes but the body is not JSON. Thrown as before.
      reportUnexpected(err, "trackers", { path: stripQuery(path), status: res.status });
      throw err;
    }
    return json && json.data !== undefined ? json.data : json;
  };

  const query = (params: Record<string, string | undefined>): string => {
    const parts = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`);
    return parts.length ? `?${parts.join("&")}` : "";
  };

  return {
    getAuthHeaders,
    /**
     * Fetch the user's workspaces. Does NOT require X-Workspace-Id (BearerAuth).
     */
    async getMyWorkspaces(): Promise<Workspace[]> {
      const req = async (force: boolean) =>
        safeFetch(`${BASE_URL}/api/workspaces`, {
          headers: await getAuthHeaders(force),
        });

      const res = await req(false);
      return handleResponseWithRetry<Workspace[]>(res, () => req(true));
    },

    async getWorkspaceMembers(): Promise<WorkspaceTeamResponse> {
      const req = async (force: boolean) =>
        safeFetch(`${BASE_URL}/api/workspaces/members`, {
          headers: await getAuthHeaders(force),
        });

      const res = await req(false);
      return handleResponseWithRetry<WorkspaceTeamResponse>(res, () => req(true));
    },

    async listDocuments(): Promise<DocDocumentResponse[]> {
      const req = async (force: boolean) =>
        safeFetch(`${BASE_URL}/api/documents`, {
          headers: await getAuthHeaders(force),
        });

      const res = await req(false);
      return handleResponseWithRetry<DocDocumentResponse[]>(res, () => req(true));
    },

    async getDocument(id: string): Promise<DocDocumentResponse> {
      const req = async (force: boolean) =>
        safeFetch(`${BASE_URL}/api/documents/${encodeURIComponent(id)}`, {
          headers: await getAuthHeaders(force),
        });

      const res = await req(false);
      return handleResponseWithRetry<DocDocumentResponse>(res, () => req(true));
    },

    async listProjects(): Promise<Project[]> {
      const req = async (force: boolean) =>
        silentFetch(`${BASE_URL}/api/projects?pageSize=50`, {
          headers: await getAuthHeaders(force),
        });

      const res = await req(false);
      return handleResponseWithRetry<{ projects: Project[] }>(res, () => req(true)).then(
        (d) => d.projects,
      );
    },

    async createProject(payload: { title: string; description?: string }): Promise<Project> {
      const req = async (force: boolean) =>
        safeFetch(`${BASE_URL}/api/projects`, {
          method: "POST",
          headers: await getAuthHeaders(force),
          body: JSON.stringify(payload),
        });

      const res = await req(false);
      return handleResponseWithRetry<Project>(res, () => req(true));
    },

    async listProjectTasks(projectId: string): Promise<Task[]> {
      const req = async (force: boolean) =>
        safeFetch(`${BASE_URL}/api/projects/${encodeURIComponent(projectId)}/tasks?pageSize=200`, {
          headers: await getAuthHeaders(force),
        });

      const res = await req(false);
      return handleResponseWithRetry<{ tasks: Task[] }>(res, () => req(true)).then(
        (d) => d.tasks,
      );
    },

    async createProjectTask(
      projectId: string,
      payload: { 
        title: string; 
        description?: string; 
        summary?: string;
        acceptanceCriteria?: string;
        status?: string; 
        priority?: string;
        type?: string;
        dueDate?: string;
        metadata?: components['schemas']['TaskMetadata'];
      },
    ): Promise<Task> {
      const req = async (force: boolean) =>
        safeFetch(`${BASE_URL}/api/projects/${encodeURIComponent(projectId)}/tasks`, {
          method: "POST",
          headers: await getAuthHeaders(force),
          body: JSON.stringify(payload),
        });

      const res = await req(false);
      return handleResponseWithRetry<Task>(res, () => req(true));
    },

    async refineProjectTask(
      projectId: string,
      payload: {
        title: string;
        summary?: string | null;
        description?: string | null;
        acceptanceCriteria?: string | null;
        type: string;
        priority: string;
      }
    ): Promise<any> {
      const req = async (force: boolean) =>
        safeFetch(`${BASE_URL}/api/projects/${encodeURIComponent(projectId)}/tasks/refine`, {
          method: "POST",
          headers: await getAuthHeaders(force),
          body: JSON.stringify(payload),
        });

      const res = await req(false);
      return handleResponseWithRetry<any>(res, () => req(true));
    },

    async updateProjectTask(
      projectId: string,
      taskId: string,
      payload: Partial<Pick<Task, "status" | "priority" | "dueDate" | "title">>,
    ): Promise<Task> {
      const req = async (force: boolean) =>
        safeFetch(`${BASE_URL}/api/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`, {
          method: "PUT",
          headers: await getAuthHeaders(force),
          body: JSON.stringify(payload),
        });

      const res = await req(false);
      return handleResponseWithRetry<Task>(res, () => req(true));
    },

    async getProjectTask(projectId: string, taskId: string): Promise<Task> {
      const req = async (force: boolean) =>
        safeFetch(`${BASE_URL}/api/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`, {
          headers: await getAuthHeaders(force),
        });

      const res = await req(false);
      return handleResponseWithRetry<Task>(res, () => req(true));
    },

    async listContexts(): Promise<Context[]> {
      const req = async (force: boolean) =>
        silentFetch(`${BASE_URL}/api/contexts?pageSize=50`, {
          headers: await getAuthHeaders(force),
        });

      const res = await req(false);
      return handleResponseWithRetry<{ contexts: Context[] }>(res, () => req(true)).then(
        (d) => d.contexts,
      );
    },

    async getContext(id: string): Promise<Context> {
      const req = async (force: boolean) =>
        safeFetch(`${BASE_URL}/api/contexts/${encodeURIComponent(id)}`, {
          headers: await getAuthHeaders(force),
        });

      const res = await req(false);
      return handleResponseWithRetry<Context>(res, () => req(true));
    },

    async uploadContextFile(
      contextId: string,
      fileInfo: { uri: string; name: string; type: string }
    ): Promise<Context> {
      const req = async (force: boolean) => {
        const formData = new FormData();
        formData.append("files", {
          uri: fileInfo.uri,
          name: fileInfo.name,
          type: fileInfo.type || "application/octet-stream",
        } as any);

        const token = await getToken(force);
        if (!token) throw new Error("No auth token available");

        const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
        const wsId = getWorkspaceId();
        if (wsId) headers["X-Workspace-Id"] = wsId;

        return safeFetch(`${BASE_URL}/api/contexts/${encodeURIComponent(contextId)}/files`, {
          method: "POST",
          headers,
          body: formData,
        }, false, 300000);
      };

      const res = await req(false);
      return handleResponseWithRetry<Context>(res, () => req(true));
    },

    async deleteContextFile(contextId: string, fileId: string): Promise<Context> {
      const req = async (force: boolean) =>
        safeFetch(`${BASE_URL}/api/contexts/${encodeURIComponent(contextId)}/files/${encodeURIComponent(fileId)}`, {
          method: "DELETE",
          headers: await getAuthHeaders(force),
        });

      const res = await req(false);
      return handleResponseWithRetry<Context>(res, () => req(true));
    },

    async listAiModels(): Promise<AiModel[]> {
      const req = async (force: boolean) =>
        safeFetch(`${BASE_URL}/api/ai/models`, {
          headers: await getAuthHeaders(force),
        });

      const res = await req(false);
      return handleResponseWithRetry<AiModel[]>(res, () => req(true));
    },

    async listTranscripts(q?: string): Promise<Transcript[]> {
      const req = async (force: boolean) => {
        const url = new URL(`${BASE_URL}/api/transcripts`);
        url.searchParams.set("pageSize", "50");
        // RECORDING + TELEGRAM: this list is where the team sees inbound work,
        // and Berry's Telegram leads are inbound work. Filtering on RECORDING
        // alone hid every prospect from the app entirely.
        url.searchParams.set("sources", "RECORDING,TELEGRAM");
        if (q) url.searchParams.set("q", q);

        return silentFetch(url.toString(), {
          headers: await getAuthHeaders(force),
        });
      };

      const res = await req(false);
      return handleResponseWithRetry<{ transcripts: Transcript[] }>(res, () => req(true)).then(
        (d) => d.transcripts,
      );
    },

    /** Push a processed meeting into Twenty as a note linked to a company. */
    async pushTranscriptToTwenty(
      body: PushTranscriptToTwentyRequest,
    ): Promise<PushTranscriptToTwentyResponse> {
      const req = async (force: boolean) =>
        safeFetch(`${BASE_URL}/api/twenty/push-transcript`, {
          method: "POST",
          headers: await getAuthHeaders(force),
          body: JSON.stringify(body),
        });

      const res = await req(false);
      return handleResponseWithRetry<PushTranscriptToTwentyResponse>(res, () => req(true));
    },

    /** Companies from the connected Twenty CRM, for the post-recording picker. */
    async searchTwentyCompanies(q: string): Promise<TwentyCompanyItem[]> {
      const req = async (force: boolean) =>
        silentFetch(`${BASE_URL}/api/twenty/companies?q=${encodeURIComponent(q)}`, {
          headers: await getAuthHeaders(force),
        });

      const res = await req(false);
      return handleResponseWithRetry<TwentyCompanyItem[]>(res, () => req(true));
    },

    async listIntegrations(): Promise<UserIntegrationSummary[]> {
      const req = async (force: boolean) =>
        silentFetch(`${BASE_URL}/api/integrations`, {
          headers: await getAuthHeaders(force),
        });

      const res = await req(false);
      return handleResponseWithRetry<UserIntegrationSummary[]>(res, () => req(true));
    },

    async startAudioStream(
      language?: string,
      contextIds?: string[],
      projectIds?: string[],
    ): Promise<WebSocket> {
      const token = await getToken(false);
      if (!token) throw new Error("No auth token available");

      const wsProtocol = BASE_URL.startsWith("https") ? "wss:" : "ws:";
      const wsUrl = new URL(`${wsProtocol}//${BASE_URL.replace(/^https?:\/\//, "")}/api/audio/stream`);
      wsUrl.searchParams.set("token", token);

      if (language) {
        wsUrl.searchParams.set("language", language);
      }
      if (contextIds && contextIds.length > 0) {
        wsUrl.searchParams.set("contextIds", contextIds.join(","));
      }
      if (projectIds && projectIds.length > 0) {
        wsUrl.searchParams.set("projectIds", projectIds.join(","));
      }

      const wsId = getWorkspaceId();
      if (wsId) {
        wsUrl.searchParams.set("workspaceId", wsId);
      }

      const ws = new WebSocket(wsUrl.toString());
      return ws;
    },


    async getCurrentUser(): Promise<UserResponse> {
      const req = async (force: boolean) =>
        safeFetch(`${BASE_URL}/api/session/me`, {
          headers: await getAuthHeaders(force),
        });

      const res = await req(false);
      return handleResponseWithRetry<UserResponse>(res, () => req(true));
    },

    async getSubscription(): Promise<SubscriptionStatusResponse> {
      const req = async (force: boolean) =>
        safeFetch(`${BASE_URL}/api/billing/subscription`, {
          headers: await getAuthHeaders(force),
        });

      const res = await req(false);
      return handleResponseWithRetry<SubscriptionStatusResponse>(res, () => req(true));
    },

    async deleteMyAccount(): Promise<void> {
      const req = async (force: boolean) =>
        safeFetch(`${BASE_URL}/api/session/me`, {
          method: "DELETE",
          headers: await getAuthHeaders(force),
        });

      const res = await req(false);
      await handleResponseWithRetry(res, () => req(true));
    },

    async saveVoiceProfile(voiceFile?: { uri: string; name: string; type: string }): Promise<void> {
      const req = async (force: boolean) => {
        const token = await getToken(force);
        if (!token) throw new Error("No auth token available");

        const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
        const wsId = getWorkspaceId();
        if (wsId) headers["X-Workspace-Id"] = wsId;

        const formData = new FormData();
        if (voiceFile) {
          formData.append("voiceFile", {
            uri: voiceFile.uri.startsWith("file://") ? voiceFile.uri : `file://${voiceFile.uri}`,
            name: voiceFile.name,
            type: voiceFile.type,
          } as any);
        }

        return safeFetch(`${BASE_URL}/api/session/me/voice-profile`, {
          method: "POST",
          headers,
          body: formData,
        });
      };

      const res = await req(false);
      await handleResponseWithRetry(res, () => req(true));
    },

    async saveRecording(payload: CreateStandaloneTranscriptBody & {
      skipAi?: boolean;
      micFile?: Blob;
      sysFile?: Blob;
      location?: { latitude: number; longitude: number; accuracy?: number | null };
      /** Mic audio already sent in slices with uploadRecordingPart. */
      micUploadId?: string;
      micPartCount?: number;
      /** Recording session id: a retry with the same id is not duplicated. */
      clientSessionId?: string;
      recordingMode?: "in_person" | "remote";
      recordingStartedAt?: string;
      recordingWallClockSeconds?: number;
      /** Moments marked while recording, in seconds of the saved audio. */
      bookmarks?: RecordingBookmark[];
      /** Calendar event the meeting belongs to. */
      calendarEvent?: MeetingCalendarEvent;
      /** Original name of an imported file sent in slices ("memo.m4a"). */
      micFileName?: string;
      /** Workspace the meeting was recorded in (defaults to the active one). */
      workspaceId?: string | null;
      /** No alert on network errors: the caller keeps the meeting and retries. */
      silent?: boolean;
    }): Promise<Transcript> {
      const req = async (force: boolean) => {
        const formData = new FormData();

        // Append all text payload properties individually or as serialized JSON.
        // The backend `transcriptsController.ts` will parse them.
        formData.append("source", "RECORDING");
        if (payload.micUploadId) formData.append("micUploadId", payload.micUploadId);
        if (payload.micPartCount) formData.append("micPartCount", String(payload.micPartCount));
        if (payload.clientSessionId) formData.append("clientSessionId", payload.clientSessionId);
        if (payload.recordingMode) formData.append("recordingMode", payload.recordingMode);
        if (payload.recordingStartedAt) {
          formData.append("recordingStartedAt", payload.recordingStartedAt);
        }
        if (payload.recordingWallClockSeconds) {
          formData.append("recordingWallClockSeconds", String(payload.recordingWallClockSeconds));
        }
        if (payload.content) formData.append("content", payload.content);
        if (payload.title) formData.append("title", payload.title);
        if (payload.recordedAt) formData.append("recordedAt", payload.recordedAt);
        if (payload.projectId) formData.append("projectId", payload.projectId);
        // ASR language the user picked ("ca", "es", …) — the backend stores it
        // so batch re-diarization honours it instead of defaulting to "multi".
        if (payload.language) formData.append("language", payload.language);
        if (payload.modelKey) formData.append("modelKey", payload.modelKey);
        if (payload.complexityLevel) formData.append("complexityLevel", payload.complexityLevel);
        if (payload.syncToJira) formData.append("syncToJira", "true");
        if (payload.syncToLinear) formData.append("syncToLinear", "true");
        if (payload.syncToTrello) formData.append("syncToTrello", "true");
        if (payload.syncToNotion) formData.append("syncToNotion", "true");
        if (payload.syncToAsana) formData.append("syncToAsana", "true");
        if (payload.syncToTwenty) formData.append("syncToTwenty", "true");
        if (payload.twentyCompanyId) formData.append("twentyCompanyId", payload.twentyCompanyId);
        if (payload.exportToGoogleDrive) formData.append("exportToGoogleDrive", "true");
        if (payload.exportToOneDrive) formData.append("exportToOneDrive", "true");
        if (payload.createDoc) formData.append("createDoc", "true");
        if (payload.createSlides) formData.append("createSlides", "true");
        if (payload.taskStrategy) formData.append("taskStrategy", payload.taskStrategy);
        if (payload.taskCount) formData.append("taskCount", payload.taskCount.toString());
        if (payload.skipAi) formData.append("skipAi", "true");
        
        if (payload.contextIds && payload.contextIds.length > 0) {
          formData.append("contextIds", JSON.stringify(payload.contextIds));
        }
        if (payload.chatHistory) {
          formData.append("chatHistory", JSON.stringify(payload.chatHistory));
        }
        if (payload.location) {
          formData.append("location", JSON.stringify(payload.location));
        }
        if (payload.bookmarks && payload.bookmarks.length > 0) {
          formData.append("bookmarks", JSON.stringify(payload.bookmarks));
        }
        if (payload.calendarEvent) {
          formData.append("calendarEvent", JSON.stringify(payload.calendarEvent));
        }
        if (payload.micFileName) formData.append("micFileName", payload.micFileName);

        // Determine mime types based on platform or defaults
        if (payload.micFile) {
          formData.append("micFile", payload.micFile as any);
        }
        if (payload.sysFile) {
          formData.append("sysFile", payload.sysFile as any);
        }

        const token = await getToken(force);
        if (!token) throw new Error("No auth token available");

        const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
        const wsId = payload.workspaceId || getWorkspaceId();
        if (wsId) headers["X-Workspace-Id"] = wsId;

        // Audio sent in slices makes this request small; a whole file inline
        // still gets the long timeout.
        const timeoutMs = payload.micFile || payload.sysFile ? 300000 : 120000;
        return safeFetch(`${BASE_URL}/api/transcripts/recorder-upload`, {
          method: "POST",
          headers,
          body: formData,
        }, payload.silent ?? false, timeoutMs);
      };

      let res: Response;
      try {
        res = await req(false);
      } catch (err) {
        throw new HttpError(err instanceof Error ? err.message : String(err));
      }
      return handleResponseWithRetry<Transcript>(res, () => req(true));
    },

    /**
     * Sends one slice of a recording (see recordingUploader.ts). Uses the
     * native uploader, which reads the slice from disk instead of JS memory
     * and on iOS keeps going while the app is in the background.
     */
    async uploadRecordingPart(args: {
      uploadId: string;
      index: number;
      fileUri: string;
      workspaceId?: string | null;
    }): Promise<void> {
      const send = async (force: boolean) => {
        const token = await getToken(force);
        if (!token) throw new HttpError("No auth token available", 401);
        const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
        const wsId = args.workspaceId || getWorkspaceId();
        if (wsId) headers["X-Workspace-Id"] = wsId;
        return LegacyFileSystem.uploadAsync(
          `${BASE_URL}/api/transcripts/recorder-upload/parts`,
          args.fileUri,
          {
            httpMethod: "POST",
            uploadType: LegacyFileSystem.FileSystemUploadType.MULTIPART,
            fieldName: "part",
            mimeType: "application/octet-stream",
            parameters: { uploadId: args.uploadId, index: String(args.index) },
            headers,
            sessionType: LegacyFileSystem.FileSystemSessionType.BACKGROUND,
          },
        );
      };
      let result: LegacyFileSystem.FileSystemUploadResult;
      try {
        result = await send(false);
        if (result.status === 401) result = await send(true);
      } catch (err) {
        if (err instanceof HttpError) throw err;
        throw new HttpError(err instanceof Error ? err.message : String(err));
      }
      if (result.status < 200 || result.status >= 300) {
        let message = `HTTP ${result.status}`;
        try {
          message = (JSON.parse(result.body) as { message?: string }).message ?? message;
        } catch {
          // body was not JSON
        }
        throw new HttpError(message, result.status);
      }
    },

    /** Drops the slices of a recording the user discarded. Best effort. */
    async deleteRecordingParts(uploadId: string, workspaceId?: string | null): Promise<void> {
      const token = await getToken(false);
      if (!token) return;
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      const wsId = workspaceId || getWorkspaceId();
      if (wsId) headers["X-Workspace-Id"] = wsId;
      await safeFetch(
        `${BASE_URL}/api/transcripts/recorder-upload/parts/${encodeURIComponent(uploadId)}`,
        { method: "DELETE", headers },
        true,
      ).catch(() => undefined);
    },

    async getTranscript(id: string): Promise<Transcript> {
      const req = async (force: boolean) =>
        safeFetch(`${BASE_URL}/api/transcripts/${encodeURIComponent(id)}`, {
          headers: await getAuthHeaders(force),
        });

      const res = await req(false);
      return handleResponseWithRetry<Transcript>(res, () => req(true));
    },

    /**
     * Links to listen to a meeting (valid 12 h) and the offset between its
     * two files. No alert on network errors: the screen just shows no player.
     */
    async getTranscriptAudio(id: string): Promise<TranscriptAudio> {
      const req = async (force: boolean) =>
        silentFetch(`${BASE_URL}/api/transcripts/${encodeURIComponent(id)}/audio`, {
          headers: await getAuthHeaders(force),
        });

      const res = await req(false);
      const data = await handleResponseWithRetry<TranscriptAudio | null>(res, () => req(true));
      return data ?? {};
    },

    /**
     * Deletes a meeting's audio files for good. The transcript, summary and
     * tasks stay. 403: not the recorder or an owner. 409: still processing.
     */
    async deleteTranscriptAudio(id: string): Promise<void> {
      const req = async (force: boolean) =>
        silentFetch(`${BASE_URL}/api/transcripts/${encodeURIComponent(id)}/audio`, {
          method: "DELETE",
          headers: await getAuthHeaders(force),
        });

      let res: Response;
      try {
        res = await req(false);
      } catch (err) {
        throw new HttpError(err instanceof Error ? err.message : String(err));
      }
      await handleResponseWithRetry(res, () => req(true));
    },

    async updateTranscript(id: string, payload: { title?: string }): Promise<Transcript> {
      const req = async (force: boolean) =>
        safeFetch(`${BASE_URL}/api/transcripts/${encodeURIComponent(id)}`, {
          method: "PUT",
          headers: await getAuthHeaders(force),
          body: JSON.stringify(payload),
        });

      const res = await req(false);
      return handleResponseWithRetry<Transcript>(res, () => req(true));
    },

    /**
     * Correct AI-inferred speaker names. `overrides` maps the stable diarization
     * label ("Speaker 0", "User 1") to the corrected human name; a blank value
     * clears the identification. Returns the updated transcript.
     */
    async updateTranscriptSpeakers(
      id: string,
      overrides: UpdateSpeakerNamesBody["overrides"],
    ): Promise<Transcript> {
      const body: UpdateSpeakerNamesBody = { overrides };
      const req = async (force: boolean) =>
        safeFetch(`${BASE_URL}/api/transcripts/${encodeURIComponent(id)}/speakers`, {
          method: "PUT",
          headers: await getAuthHeaders(force),
          body: JSON.stringify(body),
        });

      const res = await req(false);
      return handleResponseWithRetry<Transcript>(res, () => req(true));
    },

    async deleteTranscript(id: string): Promise<void> {
      const req = async (force: boolean) =>
        safeFetch(`${BASE_URL}/api/transcripts/${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: await getAuthHeaders(force),
        });

      const res = await req(false);
      await handleResponseWithRetry(res, () => req(true));
    },

    async reprocessTranscript(id: string): Promise<Transcript> {
      const req = async (force: boolean) =>
        safeFetch(`${BASE_URL}/api/transcripts/${encodeURIComponent(id)}/reprocess`, {
          method: "POST",
          headers: await getAuthHeaders(force),
        });

      const res = await req(false);
      return handleResponseWithRetry<Transcript>(res, () => req(true));
    },

    async retryPostMeetingTask(
      transcriptId: string,
      kind: components["schemas"]["PostMeetingTaskKind"],
    ): Promise<{ success: boolean }> {
      const req = async (force: boolean) =>
        safeFetch(
          `${BASE_URL}/api/transcripts/${encodeURIComponent(transcriptId)}/post-meeting-tasks/${encodeURIComponent(kind)}/retry`,
          {
            method: "POST",
            headers: await getAuthHeaders(force),
          },
        );

      const res = await req(false);
      return handleResponseWithRetry<{ success: boolean }>(res, () => req(true));
    },

    async sendLiveChatMessage(payload: {
      content: string;
      liveTranscript: string;
      contextIds?: string[];
      projectIds?: string[];
      history?: { role: "user" | "assistant"; content: string }[];
      modelKey?: string;
      complexityLevel?: string;
    }): Promise<{ response: string }> {
      const req = async (force: boolean) =>
        safeFetch(`${BASE_URL}/api/chat/live`, {
          method: "POST",
          headers: await getAuthHeaders(force),
          body: JSON.stringify(payload),
        }, false, 300000);

      const res = await req(false);
      return handleResponseWithRetry<{ response: string }>(res, () => req(true));
    },

    async getLiveSummary(payload: components['schemas']['LiveSummaryRequest']): Promise<string> {
      // Background update during a meeting: silent (no alert mid-recording)
      // and a 90 s timeout; if it is slow, the next update tries again.
      const req = async (force: boolean) =>
        silentFetch(`${BASE_URL}/api/chat/live-summary`, {
          method: "POST",
          headers: await getAuthHeaders(force),
          body: JSON.stringify(payload),
        }, 90000);

      const res = await req(false);
      return handleResponseWithRetry<{ summary: string }>(res, () => req(true)).then(
        (d) => d.summary,
      );
    },

    async autoSyncTranscript(
      transcriptId: string,
    ): Promise<{ pushed: number; skipped: number; errors: string[] }> {
      const req = async (force: boolean) =>
        safeFetch(`${BASE_URL}/api/tasks/auto-sync-transcript/${encodeURIComponent(transcriptId)}`, {
          method: "POST",
          headers: await getAuthHeaders(force),
          body: JSON.stringify({}),
        });

      const res = await req(false);
      return handleResponseWithRetry<{ pushed: number; skipped: number; errors: string[] }>(
        res,
        () => req(true),
      );
    },

    /**
     * The meeting on now, or starting within 15 minutes, from the user's
     * connected Google or Outlook calendar. Null when there is none, no
     * calendar is connected or the request fails. Silent (no alert) with a
     * 15 s timeout, so it never gets in the way of a recording.
     */
    async getCurrentMeeting(): Promise<components['schemas']['CurrentMeeting'] | null> {
      try {
        const req = async (force: boolean) =>
          silentFetch(`${BASE_URL}/api/calendar/current-meeting`, {
            headers: await getAuthHeaders(force),
          }, 15000);

        const res = await req(false);
        const data = await handleResponseWithRetry<
          components['schemas']['CurrentMeetingResponse'] | null
        >(res, () => req(true));
        return data?.event ?? null;
      } catch (err) {
        console.warn("[planAiApi] getCurrentMeeting failed:", err);
        return null;
      }
    },

    // ── Notes ──────────────────────────────────────────────────────────────
    // Every notes call takes the note's own workspace. A note written in one
    // workspace must reach that workspace even if the user switched since.
    // A network error throws HttpError with no status, so the outbox retries.

    async listNotes(
      opts: {
        scope?: NoteScope;
        projectId?: string;
        transcriptId?: string;
        q?: string;
        limit?: number;
        cursor?: string;
      } = {},
      workspaceId?: string | null,
    ): Promise<NoteList> {
      const url = new URL(`${BASE_URL}/api/notes`);
      if (opts.scope) url.searchParams.set("scope", opts.scope);
      if (opts.projectId) url.searchParams.set("projectId", opts.projectId);
      if (opts.transcriptId) url.searchParams.set("transcriptId", opts.transcriptId);
      if (opts.q) url.searchParams.set("q", opts.q);
      if (opts.limit) url.searchParams.set("limit", String(opts.limit));
      if (opts.cursor) url.searchParams.set("cursor", opts.cursor);
      const req = async (force: boolean) =>
        noteFetch(url.toString(), { headers: await noteHeaders(force, workspaceId) });
      return handleResponseWithRetry<NoteList>(await req(false), () => req(true));
    },

    async getNote(id: string, workspaceId?: string | null): Promise<Note> {
      const req = async (force: boolean) =>
        noteFetch(`${BASE_URL}/api/notes/${encodeURIComponent(id)}`, {
          headers: await noteHeaders(force, workspaceId),
        });
      return handleResponseWithRetry<Note>(await req(false), () => req(true));
    },

    /** The user's daily or weekly note for a local date (YYYY-MM-DD), created empty the first time. */
    async getPeriodNote(
      period: NotePeriod,
      date: string,
      workspaceId?: string | null,
    ): Promise<Note> {
      const req = async (force: boolean) =>
        noteFetch(
          `${BASE_URL}/api/notes/period/${encodeURIComponent(period)}/${encodeURIComponent(date)}`,
          { headers: await noteHeaders(force, workspaceId) },
        );
      return handleResponseWithRetry<Note>(await req(false), () => req(true));
    },

    /** Idempotent when `payload.id` is set: sending it again returns the first note. */
    async createNote(payload: CreateNoteRequest, workspaceId?: string | null): Promise<Note> {
      const req = async (force: boolean) =>
        noteFetch(`${BASE_URL}/api/notes`, {
          method: "POST",
          headers: await noteHeaders(force, workspaceId),
          body: JSON.stringify(payload),
        });
      return handleResponseWithRetry<Note>(await req(false), () => req(true));
    },

    /** Throws NoteConflictError when `baseVersion` is older than the server's. */
    async updateNote(
      id: string,
      payload: UpdateNoteRequest,
      workspaceId?: string | null,
    ): Promise<Note> {
      const req = async (force: boolean) =>
        noteFetch(`${BASE_URL}/api/notes/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: await noteHeaders(force, workspaceId),
          body: JSON.stringify(payload),
        });
      let res = await req(false);
      if (res.status === 401) res = await req(true);
      if (res.status === 409) {
        const body = (await res.json().catch(() => ({}))) as {
          code?: string;
          message?: string;
          current?: Note | null;
        };
        const message = body.message ?? "HTTP 409";
        if (body.code === "note_version_conflict") {
          throw new NoteConflictError(message, body.current ?? null);
        }
        throw new HttpError(message, 409);
      }
      return handleResponseWithRetry<Note>(res, () => req(true));
    },

    /** Moves a note to the trash (kept 30 days). */
    async trashNote(id: string, workspaceId?: string | null): Promise<void> {
      const req = async (force: boolean) =>
        noteFetch(`${BASE_URL}/api/notes/${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: await noteHeaders(force, workspaceId),
        });
      await handleResponseWithRetry<{ success: boolean }>(await req(false), () => req(true));
    },

    async restoreNote(id: string, workspaceId?: string | null): Promise<Note> {
      const req = async (force: boolean) =>
        noteFetch(`${BASE_URL}/api/notes/${encodeURIComponent(id)}/restore`, {
          method: "POST",
          headers: await noteHeaders(force, workspaceId),
        });
      return handleResponseWithRetry<Note>(await req(false), () => req(true));
    },

    // ── Personal mode and trackers ─────────────────────────────────────────
    // Trackers live only in the user's personal workspace. Every call takes
    // that workspace id and falls back to the active one.

    /** Whether personal mode exists for this account, consent and settings. */
    async getPersonalStatus(): Promise<PersonalStatus> {
      return trackerRequest<PersonalStatus>("/api/personal");
    },

    async listTrackers(workspaceId?: string | null): Promise<Tracker[]> {
      return trackerRequest<Tracker[]>("/api/trackers", { workspaceId });
    },

    /** Values per day, today, this week, goals and streaks. `today` is the local date. */
    async getTrackerStats(q: TrackerStatsQuery, workspaceId?: string | null): Promise<TrackerStats[]> {
      return trackerRequest<TrackerStats[]>(
        `/api/trackers/stats${query({ today: q.today, from: q.from, to: q.to })}`,
        { workspaceId },
      );
    },

    /** Entries, newest first. status=PROPOSED lists what waits to be accepted. */
    async listTrackerEntries(
      q: TrackerEntriesQuery = {},
      workspaceId?: string | null,
    ): Promise<TrackerEntry[]> {
      return trackerRequest<TrackerEntry[]>(
        `/api/trackers/entries${query({
          status: q.status,
          noteId: q.noteId,
          trackerId: q.trackerId,
          from: q.from,
          to: q.to,
        })}`,
        { workspaceId },
      );
    },

    /** A value the user typed. Counts at once. Idempotent when `body.id` is set. */
    async addTrackerEntry(
      trackerId: string,
      body: AddTrackerEntryRequest,
      workspaceId?: string | null,
    ): Promise<TrackerEntry> {
      return trackerRequest<TrackerEntry>(
        `/api/trackers/${encodeURIComponent(trackerId)}/entries`,
        { method: "POST", body, workspaceId },
      );
    },

    async updateTrackerEntry(
      entryId: string,
      body: UpdateTrackerEntryRequest,
      workspaceId?: string | null,
    ): Promise<TrackerEntry> {
      return trackerRequest<TrackerEntry>(
        `/api/trackers/entries/${encodeURIComponent(entryId)}`,
        { method: "PATCH", body, workspaceId },
      );
    },

    async deleteTrackerEntry(entryId: string, workspaceId?: string | null): Promise<void> {
      await trackerRequest<{ success: boolean }>(
        `/api/trackers/entries/${encodeURIComponent(entryId)}`,
        { method: "DELETE", workspaceId },
      );
    },

    /** Accepts or refuses several proposals at once. */
    async reviewTrackerEntries(
      body: ReviewTrackerEntriesRequest,
      workspaceId?: string | null,
    ): Promise<{ updated: number }> {
      return trackerRequest<{ updated: number }>("/api/trackers/entries/review", {
        method: "POST",
        body,
        workspaceId,
      });
    },

    /**
     * Reads a note or a line of text with AI and returns proposals. A note is
     * read once per version: asking again for an unchanged note costs nothing.
     */
    async extractTrackerEntries(
      body: ExtractTrackerEntriesRequest,
      workspaceId?: string | null,
    ): Promise<ExtractTrackerEntriesResponse> {
      return trackerRequest<ExtractTrackerEntriesResponse>("/api/trackers/extract", {
        method: "POST",
        body,
        workspaceId,
        timeoutMs: TRACKERS_EXTRACT_TIMEOUT_MS,
      });
    },

    // ── Daily report ──────────────────────────────────────────────────────

    async getDailyReportStatus(workspaceId?: string | null): Promise<DailyReportStatus> {
      return trackerRequest<DailyReportStatus>("/api/daily-report/status", {
        workspaceId,
        feature: "daily_report",
      });
    },

    /** true accepts the text, false withdraws the consent. */
    async setDailyReportConsent(
      accept: boolean,
      workspaceId?: string | null,
    ): Promise<DailyReportStatus> {
      return trackerRequest<DailyReportStatus>("/api/daily-report/consent", {
        method: "POST",
        body: { accept },
        workspaceId,
        feature: "daily_report",
      });
    },

    /** Reads the day note with AI. The proposals wait for the member. */
    async extractDailyReport(
      noteId: string,
      workspaceId?: string | null,
    ): Promise<DailyReportExtractResponse> {
      return trackerRequest<DailyReportExtractResponse>("/api/daily-report/extract", {
        method: "POST",
        body: { noteId },
        workspaceId,
        timeoutMs: TRACKERS_EXTRACT_TIMEOUT_MS,
        feature: "daily_report",
      });
    },

    async listDailyReportProposals(
      status: "PROPOSED" | "ACCEPTED" | "REJECTED",
      workspaceId?: string | null,
    ): Promise<TaskUpdateProposal[]> {
      return trackerRequest<TaskUpdateProposal[]>(
        `/api/daily-report/proposals${query({ status })}`,
        { workspaceId, feature: "daily_report" },
      );
    },

    async reviewDailyReportProposals(
      items: ReviewProposalItem[],
      workspaceId?: string | null,
    ): Promise<ReviewProposalsResponse> {
      return trackerRequest<ReviewProposalsResponse>("/api/daily-report/proposals/review", {
        method: "POST",
        body: { items },
        workspaceId,
        feature: "daily_report",
      });
    },
  };
};
