import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { rawPrisma } from "../prisma/prismaClient";
import { decryptSecret, encryptSecret } from "../utils/secretCrypto";
import { assertSafeUrl, safeFetch, SsrfBlockedError } from "../utils/ssrfGuard";
import { logger } from "../utils/logger";
import { recordAudit } from "./auditLogService";

/**
 * Outbound webhooks: Plan AI calls a customer's server when something happens.
 *
 * An endpoint belongs to the workspace, not to a person. Emitting an event
 * writes one WebhookDelivery row per endpoint that wants it and puts a job on
 * the queue. The worker (workers/webhookDeliveryWorker.ts) sends it and
 * retries. Nothing here deletes old deliveries.
 *
 * Queries use the unfiltered client on purpose. Events fire from requests and
 * from workers alike, so what may be sent is decided by one rule
 * (webhookMayCarry), not by whoever happened to trigger the change.
 */

export const WEBHOOK_EVENTS = [
  "meeting.processed",
  "meeting.deleted",
  "task.created",
  "task.updated",
  "task.deleted",
  "document.created",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** The test event. It is not in the list: every endpoint accepts it. */
export const WEBHOOK_PING_EVENT = "ping";

export const WEBHOOK_MAX_ENDPOINTS = 10;
/** Failed deliveries in a row before an endpoint is turned off. */
export const WEBHOOK_DISABLE_AFTER_FAILURES = 20;
export const WEBHOOK_TIMEOUT_MS = 10_000;
const MAX_ERROR_CHARS = 500;
const MAX_URL_CHARS = 2000;
const MAX_DESCRIPTION_CHARS = 200;
const DELIVERIES_SHOWN = 50;
const ENQUEUE_TIMEOUT_MS = 5_000;
const SECRET_PREFIX = "whsec_";

interface ServiceError {
  status: number;
  message: string;
}
const fail = (status: number, message: string): ServiceError => ({ status, message });

// ── Signing ─────────────────────────────────────────────────────────────────

/** `sha256=<hex>`: HMAC SHA-256 of `${timestamp}.${rawBody}` with the endpoint's secret. */
export function signWebhookPayload(secret: string, timestamp: number, rawBody: string): string {
  const hex = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `sha256=${hex}`;
}

export function generateWebhookSecret(): string {
  return `${SECRET_PREFIX}${crypto.randomBytes(32).toString("hex")}`;
}

// ── URL rule ────────────────────────────────────────────────────────────────

const isProduction = (): boolean => process.env.NODE_ENV === "production";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/** A developer's own machine. Only accepted outside production. */
function isLocalDevUrl(url: URL): boolean {
  if (isProduction()) return false;
  return LOCAL_HOSTS.has(url.hostname.replace(/^\[|\]$/g, "").toLowerCase());
}

/**
 * Checks a URL typed by a user. Only https, and never an address inside the
 * server's own network. Outside production, http://localhost is accepted so
 * a developer can test against their machine. Returns the normalised URL.
 */
export function validateWebhookUrl(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) throw fail(400, "A URL is required.");
  const text = raw.trim();
  if (text.length > MAX_URL_CHARS) throw fail(400, "The URL is too long.");
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw fail(400, "That is not a valid URL.");
  }
  if (url.username || url.password) {
    throw fail(400, "URLs with a user name or password are not allowed.");
  }
  if (isLocalDevUrl(url)) {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw fail(400, "The URL must start with https://.");
    }
    return url.toString();
  }
  if (url.protocol !== "https:") throw fail(400, "The URL must start with https://.");
  try {
    assertSafeUrl(url);
  } catch (err) {
    throw fail(400, err instanceof SsrfBlockedError ? err.message : "That URL is not allowed.");
  }
  return url.toString();
}

function validateEvents(raw: unknown): WebhookEvent[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw fail(400, "Events must be a list.");
  const known = new Set<string>(WEBHOOK_EVENTS);
  const unknown = raw.filter((e) => typeof e !== "string" || !known.has(e));
  if (unknown.length > 0) throw fail(400, `Unknown event: ${String(unknown[0])}`);
  return WEBHOOK_EVENTS.filter((e) => raw.includes(e));
}

function validateDescription(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") throw fail(400, "The description must be text.");
  const text = raw.trim();
  if (text.length > MAX_DESCRIPTION_CHARS) throw fail(400, "The description is too long.");
  return text || null;
}

// ── Restricted projects ─────────────────────────────────────────────────────

export interface WebhookSubject {
  /** The project the meeting, task or document belongs to. Null: none. */
  project?: { visibility: string } | null;
  /** Knowledge bases the row is tied to (meetings and documents). */
  contextIds?: string[];
}

/**
 * The one rule about restricted projects. An endpoint belongs to the
 * workspace, so it gets no event about a RESTRICTED project: not its
 * meetings, tasks or documents, and nothing tied to its knowledge base.
 * A meeting or task with no project is visible to the workspace and is sent.
 */
export async function webhookMayCarry(subject: WebhookSubject): Promise<boolean> {
  if (subject.project?.visibility === "RESTRICTED") return false;
  const contextIds = subject.contextIds ?? [];
  if (contextIds.length === 0) return true;
  const restricted = await rawPrisma.context.count({
    where: { id: { in: contextIds }, project: { visibility: "RESTRICTED" } },
  });
  return restricted === 0;
}

// ── Payloads ────────────────────────────────────────────────────────────────

type Json = Prisma.InputJsonObject;

/** Link to a page of the web app, or null when the server does not know its address. */
export function webLink(path: string): string | null {
  const base = (process.env.FRONTEND_URL || process.env.APP_URL || "").replace(/\/+$/, "");
  return base ? `${base}${path}` : null;
}

const iso = (date: Date | null | undefined): string | null => (date ? date.toISOString() : null);

const projectRef = (
  project: { id: string; title: string } | null | undefined,
): { id: string; title: string; url: string | null } | null =>
  project
    ? { id: project.id, title: project.title, url: webLink(`/projects/${project.id}`) }
    : null;

const PROJECT_FOR_PAYLOAD = { select: { id: true, title: true, visibility: true } } as const;

const TASK_FOR_PAYLOAD = {
  id: true,
  title: true,
  status: true,
  priority: true,
  type: true,
  dueDate: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  assignee: { select: { email: true } },
  project: PROJECT_FOR_PAYLOAD,
} as const;
type TaskForPayload = Prisma.TaskGetPayload<{ select: typeof TASK_FOR_PAYLOAD }>;

/** What a task event carries. No description: the receiver reads it through the API. */
export function taskPayload(task: TaskForPayload): Json {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    type: task.type,
    dueDate: iso(task.dueDate),
    completedAt: iso(task.completedAt),
    assigneeEmail: task.assignee?.email ?? null,
    project: projectRef(task.project),
    url: webLink(`/projects/${task.project.id}?task=${task.id}`),
    createdAt: iso(task.createdAt),
    updatedAt: iso(task.updatedAt),
  };
}

const MEETING_FOR_PAYLOAD = {
  id: true,
  title: true,
  summary: true,
  language: true,
  source: true,
  durationSeconds: true,
  speakerCount: true,
  recordedAt: true,
  createdAt: true,
  contextIds: true,
  project: PROJECT_FOR_PAYLOAD,
  taskLinks: {
    select: { task: { select: { id: true, title: true, status: true, priority: true } } },
  },
} as const;
type MeetingForPayload = Prisma.TranscriptGetPayload<{ select: typeof MEETING_FOR_PAYLOAD }>;

/**
 * What a meeting event carries: the summary and the tasks, never the
 * transcript text and never a link to the audio.
 */
export function meetingPayload(meeting: MeetingForPayload): Json {
  return {
    id: meeting.id,
    title: meeting.title,
    summary: meeting.summary,
    durationSeconds: meeting.durationSeconds,
    speakerCount: meeting.speakerCount,
    language: meeting.language,
    source: meeting.source,
    recordedAt: iso(meeting.recordedAt),
    createdAt: iso(meeting.createdAt),
    project: projectRef(meeting.project),
    tasks: meeting.taskLinks.map((link) => ({ ...link.task })),
    url: webLink(`/recordings/${meeting.id}`),
  };
}

const DOCUMENT_FOR_PAYLOAD = {
  id: true,
  title: true,
  status: true,
  contextIds: true,
  transcriptIds: true,
  createdAt: true,
  project: PROJECT_FOR_PAYLOAD,
} as const;
type DocumentForPayload = Prisma.DocDocumentGetPayload<{ select: typeof DOCUMENT_FOR_PAYLOAD }>;

/** What a document event carries. No content. */
export function documentPayload(doc: DocumentForPayload): Json {
  return {
    id: doc.id,
    title: doc.title,
    status: doc.status,
    project: projectRef(doc.project),
    meetingIds: doc.transcriptIds,
    url: webLink(`/docs/view/${doc.id}`),
    createdAt: iso(doc.createdAt),
  };
}

// ── Emitting ────────────────────────────────────────────────────────────────

const newDeliveryId = (): string => `whd_${crypto.randomBytes(12).toString("hex")}`;

async function enqueue(deliveryId: string, manual: boolean): Promise<void> {
  // Loaded here so that importing this service does not open a Redis connection.
  const { enqueueWebhookDelivery } = await import("../queue/webhookDeliveryQueue");
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      enqueueWebhookDelivery(deliveryId, manual),
      // With Redis down the add waits instead of failing.
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("queue timeout")), ENQUEUE_TIMEOUT_MS);
        timer.unref();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Queues a delivery. If the queue is not reachable the row says so and can be redelivered. */
async function enqueueOrMarkFailed(deliveryId: string, manual: boolean): Promise<void> {
  try {
    await enqueue(deliveryId, manual);
  } catch (err) {
    logger.error(`[Webhooks] Could not queue delivery ${deliveryId}`, err);
    await rawPrisma.webhookDelivery
      .update({
        where: { id: deliveryId },
        data: { status: "FAILED", error: "Could not queue the delivery. Redeliver it later." },
      })
      .catch(() => undefined);
  }
}

async function createDelivery(
  endpointId: string,
  workspaceId: string,
  event: string,
  data: Json,
): Promise<string> {
  const id = newDeliveryId();
  const payload: Json = { id, event, createdAt: new Date().toISOString(), workspaceId, data };
  await rawPrisma.webhookDelivery.create({ data: { id, endpointId, event, payload } });
  return id;
}

async function endpointsWanting(workspaceId: string, event: string): Promise<{ id: string }[]> {
  const endpoints = await rawPrisma.webhookEndpoint.findMany({
    where: { workspaceId, enabled: true },
    select: { id: true, events: true },
  });
  return endpoints.filter((e) => e.events.length === 0 || e.events.includes(event));
}

/**
 * Sends an event to every enabled endpoint of the workspace that wants it.
 * Never throws: a failure is logged and the caller goes on. Callers do not
 * await it. `data` must already be allowed by webhookMayCarry: the emit*
 * helpers below check it, use those.
 */
export async function emitWebhookEvent(
  workspaceId: string,
  event: WebhookEvent,
  data: Json,
): Promise<void> {
  try {
    const endpoints = await endpointsWanting(workspaceId, event);
    for (const endpoint of endpoints) {
      const deliveryId = await createDelivery(endpoint.id, workspaceId, event, data);
      await enqueueOrMarkFailed(deliveryId, false);
    }
  } catch (err) {
    logger.error(`[Webhooks] Could not emit ${event} for workspace ${workspaceId}`, err);
  }
}

/**
 * Loads the row, applies the restricted-project rule and emits. Does nothing,
 * and loads nothing, when no endpoint wants the event. Never throws.
 */
async function emitWhenWanted(
  workspaceId: string,
  event: WebhookEvent,
  load: () => Promise<{ subject: WebhookSubject; data: Json } | null>,
): Promise<void> {
  try {
    if ((await endpointsWanting(workspaceId, event)).length === 0) return;
    const loaded = await load();
    if (!loaded || !(await webhookMayCarry(loaded.subject))) return;
    await emitWebhookEvent(workspaceId, event, loaded.data);
  } catch (err) {
    logger.error(`[Webhooks] Could not emit ${event} for workspace ${workspaceId}`, err);
  }
}

export type TaskChange = "status" | "assignee" | "title" | "dueDate";

interface TaskComparable {
  status: string;
  assigneeId: string | null;
  title: string;
  dueDate: Date | null;
}

/** Which of the fields a `task.updated` event is about changed between two versions. */
export function taskChanges(before: TaskComparable, after: TaskComparable): TaskChange[] {
  const changed: TaskChange[] = [];
  if (before.status !== after.status) changed.push("status");
  if (before.assigneeId !== after.assigneeId) changed.push("assignee");
  if (before.title !== after.title) changed.push("title");
  if ((before.dueDate?.getTime() ?? null) !== (after.dueDate?.getTime() ?? null)) {
    changed.push("dueDate");
  }
  return changed;
}

async function loadTask(workspaceId: string, taskId: string) {
  const task = await rawPrisma.task.findFirst({
    where: { id: taskId, project: { workspaceId } },
    select: TASK_FOR_PAYLOAD,
  });
  return task ? { subject: { project: task.project }, data: taskPayload(task) } : null;
}

/** `task.created`. Call after the task is saved. */
export function emitTaskCreated(workspaceId: string, taskId: string): Promise<void> {
  return emitWhenWanted(workspaceId, "task.created", () => loadTask(workspaceId, taskId));
}

/** `task.updated`. `changed` lists what changed. Nothing is sent for an empty list. */
export function emitTaskUpdated(
  workspaceId: string,
  taskId: string,
  changed: TaskChange[],
): Promise<void> {
  if (changed.length === 0) return Promise.resolve();
  return emitWhenWanted(workspaceId, "task.updated", async () => {
    const loaded = await loadTask(workspaceId, taskId);
    return loaded ? { subject: loaded.subject, data: { ...loaded.data, changed } } : null;
  });
}

/** What is needed to announce a row after it is gone. Null: nothing to send. */
export interface DeletedSnapshot {
  data: Json;
}

async function snapshot(
  workspaceId: string,
  event: WebhookEvent,
  load: () => Promise<{ subject: WebhookSubject; data: Json } | null>,
): Promise<DeletedSnapshot | null> {
  try {
    if ((await endpointsWanting(workspaceId, event)).length === 0) return null;
    const loaded = await load();
    if (!loaded || !(await webhookMayCarry(loaded.subject))) return null;
    return { data: loaded.data };
  } catch (err) {
    logger.error(`[Webhooks] Could not prepare ${event} for workspace ${workspaceId}`, err);
    return null;
  }
}

/** Call before deleting a task, then pass the result to emitTaskDeleted. Never throws. */
export function snapshotTaskForDelete(
  workspaceId: string,
  taskId: string,
): Promise<DeletedSnapshot | null> {
  return snapshot(workspaceId, "task.deleted", async () => {
    const loaded = await loadTask(workspaceId, taskId);
    if (!loaded) return null;
    const { id, title, project } = loaded.data;
    return { subject: loaded.subject, data: { id, title, project } };
  });
}

export function emitTaskDeleted(
  workspaceId: string,
  snapshotBefore: DeletedSnapshot | null,
): Promise<void> {
  if (!snapshotBefore) return Promise.resolve();
  return emitWebhookEvent(workspaceId, "task.deleted", snapshotBefore.data);
}

async function loadMeeting(workspaceId: string, transcriptId: string) {
  const meeting = await rawPrisma.transcript.findFirst({
    where: { id: transcriptId, workspaceId },
    select: MEETING_FOR_PAYLOAD,
  });
  return meeting
    ? {
        subject: { project: meeting.project, contextIds: meeting.contextIds },
        data: meetingPayload(meeting),
      }
    : null;
}

/** `meeting.processed`. Call when processing ends and the meeting is ready to read. */
export function emitMeetingProcessed(workspaceId: string, transcriptId: string): Promise<void> {
  return emitWhenWanted(workspaceId, "meeting.processed", () =>
    loadMeeting(workspaceId, transcriptId),
  );
}

/** Call before deleting a meeting, then pass the result to emitMeetingDeleted. Never throws. */
export function snapshotMeetingForDelete(
  workspaceId: string,
  transcriptId: string,
): Promise<DeletedSnapshot | null> {
  return snapshot(workspaceId, "meeting.deleted", async () => {
    const loaded = await loadMeeting(workspaceId, transcriptId);
    if (!loaded) return null;
    const { id, title, project } = loaded.data;
    return { subject: loaded.subject, data: { id, title, project } };
  });
}

export function emitMeetingDeleted(
  workspaceId: string,
  snapshotBefore: DeletedSnapshot | null,
): Promise<void> {
  if (!snapshotBefore) return Promise.resolve();
  return emitWebhookEvent(workspaceId, "meeting.deleted", snapshotBefore.data);
}

/** `document.created`. Call when the generation of a document completes. */
export function emitDocumentCreated(workspaceId: string, documentId: string): Promise<void> {
  return emitWhenWanted(workspaceId, "document.created", async () => {
    const doc = await rawPrisma.docDocument.findFirst({
      where: { id: documentId, workspaceId },
      select: DOCUMENT_FOR_PAYLOAD,
    });
    if (!doc) return null;
    // A document written from a restricted meeting is restricted too.
    const sources =
      doc.transcriptIds.length > 0
        ? await rawPrisma.transcript.findMany({
            where: { id: { in: doc.transcriptIds }, workspaceId },
            select: { contextIds: true, project: { select: { visibility: true } } },
          })
        : [];
    const fromRestricted = sources.some((s) => s.project?.visibility === "RESTRICTED");
    return {
      subject: {
        project: fromRestricted ? { visibility: "RESTRICTED" } : doc.project,
        contextIds: [...doc.contextIds, ...sources.flatMap((s) => s.contextIds)],
      },
      data: documentPayload(doc),
    };
  });
}

// ── Delivery ────────────────────────────────────────────────────────────────

interface SendResult {
  ok: boolean;
  status: number | null;
  error: string | null;
}

/** The start of the answer, read without loading a large body into memory. */
async function readSnippet(res: globalThis.Response): Promise<string> {
  try {
    const reader = res.body?.getReader();
    if (!reader) return "";
    const decoder = new TextDecoder();
    let text = "";
    while (text.length < MAX_ERROR_CHARS) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    await reader.cancel().catch(() => undefined);
    return text.slice(0, MAX_ERROR_CHARS);
  } catch {
    return "";
  }
}

const shortError = (text: string): string =>
  text.replace(/\s+/g, " ").trim().slice(0, MAX_ERROR_CHARS);

export interface SignedRequest {
  body: string;
  headers: Record<string, string>;
}

/** The body and headers of one try. The timestamp is the time of the try. */
export function buildSignedRequest(
  delivery: { id: string; event: string; payload: unknown },
  secret: string,
  now = Date.now(),
): SignedRequest {
  const body = JSON.stringify(delivery.payload);
  const timestamp = Math.floor(now / 1000);
  return {
    body,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "PlanAI-Webhooks/1.0",
      "X-PlanAI-Event": delivery.event,
      "X-PlanAI-Delivery": delivery.id,
      "X-PlanAI-Timestamp": String(timestamp),
      "X-PlanAI-Signature": signWebhookPayload(secret, timestamp, body),
    },
  };
}

async function send(url: string, request: SignedRequest): Promise<SendResult> {
  try {
    const init: globalThis.RequestInit = {
      method: "POST",
      headers: request.headers,
      body: request.body,
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    };
    // safeFetch refuses private addresses and checks every redirect again.
    // A developer's localhost is the one exception, outside production only,
    // and redirects are not followed there.
    const res = isLocalDevUrl(new URL(url))
      ? await globalThis.fetch(url, { ...init, redirect: "manual" })
      : await safeFetch(url, init);
    if (res.status >= 200 && res.status < 300) {
      await res.body?.cancel().catch(() => undefined);
      return { ok: true, status: res.status, error: null };
    }
    const snippet = shortError(await readSnippet(res));
    return {
      ok: false,
      status: res.status,
      error: shortError(snippet ? `HTTP ${res.status}: ${snippet}` : `HTTP ${res.status}`),
    };
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const message =
      name === "TimeoutError" || name === "AbortError"
        ? `No answer in ${WEBHOOK_TIMEOUT_MS / 1000} seconds.`
        : err instanceof SsrfBlockedError
          ? err.message
          : err instanceof Error
            ? causeMessage(err)
            : "The request failed.";
    return { ok: false, status: null, error: shortError(message) };
  }
}

/** fetch hides the reason ("fetch failed") in `cause`. */
function causeMessage(err: Error): string {
  const cause = (err as Error & { cause?: unknown }).cause;
  if (cause instanceof SsrfBlockedError) return cause.message;
  if (cause instanceof Error && cause.message) return `${err.message}: ${cause.message}`;
  return err.message || "The request failed.";
}

export type DeliveryOutcome = "success" | "retry" | "failed";

/**
 * One try of one delivery. Records the try on the row and keeps the
 * endpoint's counters. "retry" means the queue should try again later.
 *
 * `manual` is a test event or a redelivery asked by a person: it is sent even
 * to an endpoint that is off, and a failure does not count towards turning
 * the endpoint off.
 */
export async function runDeliveryAttempt(
  deliveryId: string,
  options: { lastAttempt: boolean; manual: boolean },
): Promise<DeliveryOutcome> {
  const delivery = await rawPrisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { endpoint: true },
  });
  // The endpoint was deleted and took its deliveries with it.
  if (!delivery) return "failed";
  const { endpoint } = delivery;

  if (!endpoint.enabled && !options.manual) {
    await rawPrisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: "FAILED", error: "The endpoint is turned off." },
    });
    return "failed";
  }

  let result: SendResult;
  try {
    const secret = decryptSecret(endpoint.secret);
    result = await send(endpoint.url, buildSignedRequest(delivery, secret));
  } catch (err) {
    logger.error(`[Webhooks] Could not sign delivery ${deliveryId}`, err);
    result = { ok: false, status: null, error: "The signing secret could not be read." };
  }

  const now = new Date();
  if (result.ok) {
    await rawPrisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: "SUCCESS",
        attempts: { increment: 1 },
        responseStatus: result.status,
        error: null,
        deliveredAt: now,
      },
    });
    await rawPrisma.webhookEndpoint.update({
      where: { id: endpoint.id },
      data: { failureCount: 0, lastSuccessAt: now },
    });
    return "success";
  }

  const final = options.lastAttempt || options.manual;
  await rawPrisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: {
      status: final ? "FAILED" : "PENDING",
      attempts: { increment: 1 },
      responseStatus: result.status,
      error: result.error,
    },
  });

  // Only a delivery that used all its tries counts as a failed delivery.
  const counts = final && !options.manual;
  const updated = await rawPrisma.webhookEndpoint.update({
    where: { id: endpoint.id },
    data: { lastFailureAt: now, ...(counts ? { failureCount: { increment: 1 } } : {}) },
    select: { failureCount: true, enabled: true },
  });
  if (counts && updated.enabled && updated.failureCount >= WEBHOOK_DISABLE_AFTER_FAILURES) {
    await rawPrisma.webhookEndpoint.update({
      where: { id: endpoint.id },
      data: { enabled: false },
    });
    await recordAudit({
      workspaceId: endpoint.workspaceId,
      action: "webhook.disabled",
      targetType: "webhook",
      targetId: endpoint.id,
      metadata: { url: endpoint.url, failures: updated.failureCount },
    });
    logger.warn(
      `[Webhooks] Endpoint ${endpoint.id} turned off after ${updated.failureCount} failed deliveries`,
    );
  }
  return final ? "failed" : "retry";
}

// ── Managing endpoints ──────────────────────────────────────────────────────

export interface WebhookActor {
  userId: string;
  email?: string | null;
  role: string | null | undefined;
}

/** Only the workspace owners and admins manage webhooks. */
export function canManageWebhooks(role: string | null | undefined): boolean {
  return role === "OWNER" || role === "ADMIN";
}

function assertCanManage(actor: WebhookActor): void {
  if (!canManageWebhooks(actor.role)) {
    throw fail(403, "Only workspace owners and admins can manage webhooks.");
  }
}

/** Everything about an endpoint except its secret. */
const ENDPOINT_PUBLIC = {
  id: true,
  url: true,
  events: true,
  description: true,
  enabled: true,
  failureCount: true,
  lastSuccessAt: true,
  lastFailureAt: true,
  createdAt: true,
  updatedAt: true,
} as const;
export type WebhookEndpointView = Prisma.WebhookEndpointGetPayload<{
  select: typeof ENDPOINT_PUBLIC;
}>;

export interface WebhookEndpointInput {
  url?: string;
  events?: string[];
  description?: string | null;
  enabled?: boolean;
}

const auditActor = (actor: WebhookActor) => ({ id: actor.userId, email: actor.email ?? null });

async function findEndpoint(workspaceId: string, endpointId: string) {
  const endpoint = await rawPrisma.webhookEndpoint.findFirst({
    where: { id: endpointId, workspaceId },
    select: ENDPOINT_PUBLIC,
  });
  if (!endpoint) throw fail(404, "Webhook not found");
  return endpoint;
}

export async function listWebhookEndpoints(
  workspaceId: string,
  actor: WebhookActor,
): Promise<WebhookEndpointView[]> {
  assertCanManage(actor);
  return rawPrisma.webhookEndpoint.findMany({
    where: { workspaceId },
    select: ENDPOINT_PUBLIC,
    orderBy: { createdAt: "asc" },
  });
}

/** Creates an endpoint. The secret is returned here and never again. */
export async function createWebhookEndpoint(
  workspaceId: string,
  actor: WebhookActor,
  input: WebhookEndpointInput,
): Promise<{ endpoint: WebhookEndpointView; secret: string }> {
  assertCanManage(actor);
  const url = validateWebhookUrl(input.url);
  const events = validateEvents(input.events);
  const description = validateDescription(input.description);
  const existing = await rawPrisma.webhookEndpoint.count({ where: { workspaceId } });
  if (existing >= WEBHOOK_MAX_ENDPOINTS) {
    throw fail(400, `A workspace can have up to ${WEBHOOK_MAX_ENDPOINTS} webhooks.`);
  }
  const secret = generateWebhookSecret();
  const endpoint = await rawPrisma.webhookEndpoint.create({
    data: {
      workspaceId,
      url,
      events,
      description,
      secret: encryptSecret(secret),
      createdById: actor.userId,
    },
    select: ENDPOINT_PUBLIC,
  });
  await recordAudit({
    workspaceId,
    actor: auditActor(actor),
    action: "webhook.created",
    targetType: "webhook",
    targetId: endpoint.id,
    metadata: { url },
  });
  return { endpoint, secret };
}

export async function updateWebhookEndpoint(
  workspaceId: string,
  actor: WebhookActor,
  endpointId: string,
  input: WebhookEndpointInput,
): Promise<WebhookEndpointView> {
  assertCanManage(actor);
  const current = await findEndpoint(workspaceId, endpointId);
  const data: Prisma.WebhookEndpointUpdateInput = {};
  if (input.url !== undefined) data.url = validateWebhookUrl(input.url);
  if (input.events !== undefined) data.events = validateEvents(input.events);
  if (input.description !== undefined) data.description = validateDescription(input.description);
  if (input.enabled !== undefined) {
    data.enabled = input.enabled === true;
    // Turning it back on starts the count again, or one more failure would turn it off.
    if (data.enabled && !current.enabled) data.failureCount = 0;
  }
  return rawPrisma.webhookEndpoint.update({
    where: { id: endpointId },
    data,
    select: ENDPOINT_PUBLIC,
  });
}

/** Replaces the secret. The new one is returned here and never again. */
export async function rotateWebhookSecret(
  workspaceId: string,
  actor: WebhookActor,
  endpointId: string,
): Promise<{ endpoint: WebhookEndpointView; secret: string }> {
  assertCanManage(actor);
  await findEndpoint(workspaceId, endpointId);
  const secret = generateWebhookSecret();
  const endpoint = await rawPrisma.webhookEndpoint.update({
    where: { id: endpointId },
    data: { secret: encryptSecret(secret) },
    select: ENDPOINT_PUBLIC,
  });
  await recordAudit({
    workspaceId,
    actor: auditActor(actor),
    action: "webhook.secret_rotated",
    targetType: "webhook",
    targetId: endpointId,
    metadata: { url: endpoint.url },
  });
  return { endpoint, secret };
}

export async function deleteWebhookEndpoint(
  workspaceId: string,
  actor: WebhookActor,
  endpointId: string,
): Promise<void> {
  assertCanManage(actor);
  const endpoint = await findEndpoint(workspaceId, endpointId);
  await rawPrisma.webhookEndpoint.delete({ where: { id: endpointId } });
  await recordAudit({
    workspaceId,
    actor: auditActor(actor),
    action: "webhook.deleted",
    targetType: "webhook",
    targetId: endpointId,
    metadata: { url: endpoint.url },
  });
}

// ── Deliveries ──────────────────────────────────────────────────────────────

export interface WebhookDeliveryView {
  id: string;
  event: string;
  status: string;
  attempts: number;
  responseStatus: number | null;
  error: string | null;
  createdAt: Date;
  deliveredAt: Date | null;
  /** What was sent. Null when its project became restricted after it was sent. */
  payload: Prisma.JsonValue | null;
}

/** The project id inside a stored payload, if it has one. */
function payloadProjectId(payload: Prisma.JsonValue): string | null {
  const data = (payload as { data?: { project?: { id?: unknown } | null } } | null)?.data;
  const id = data?.project?.id;
  return typeof id === "string" ? id : null;
}

async function restrictedProjectIds(workspaceId: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await rawPrisma.project.findMany({
    where: { workspaceId, id: { in: ids }, visibility: "RESTRICTED" },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

/** The last 50 deliveries of an endpoint, newest first. */
export async function listWebhookDeliveries(
  workspaceId: string,
  actor: WebhookActor,
  endpointId: string,
): Promise<WebhookDeliveryView[]> {
  assertCanManage(actor);
  await findEndpoint(workspaceId, endpointId);
  const rows = await rawPrisma.webhookDelivery.findMany({
    where: { endpointId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: DELIVERIES_SHOWN,
    select: {
      id: true,
      event: true,
      status: true,
      attempts: true,
      responseStatus: true,
      error: true,
      createdAt: true,
      deliveredAt: true,
      payload: true,
    },
  });
  // A project restricted after the event was sent: admins get no pass on
  // restricted projects, so the stored payload is not shown either.
  const projectIds = rows
    .map((r) => payloadProjectId(r.payload))
    .filter((id): id is string => !!id);
  const hidden = await restrictedProjectIds(workspaceId, Array.from(new Set(projectIds)));
  return rows.map((row) => {
    const projectId = payloadProjectId(row.payload);
    return projectId && hidden.has(projectId) ? { ...row, payload: null } : row;
  });
}

/** Sends a `ping` event to one endpoint, through the same queue and signing. */
export async function sendWebhookTestEvent(
  workspaceId: string,
  actor: WebhookActor,
  endpointId: string,
): Promise<{ deliveryId: string }> {
  assertCanManage(actor);
  await findEndpoint(workspaceId, endpointId);
  const deliveryId = await createDelivery(endpointId, workspaceId, WEBHOOK_PING_EVENT, {
    message: "This is a test event from Plan AI.",
  });
  await enqueueOrMarkFailed(deliveryId, true);
  return { deliveryId };
}

/** Sends a past delivery again, with the same id and payload. One try. */
export async function redeliverWebhook(
  workspaceId: string,
  actor: WebhookActor,
  deliveryId: string,
): Promise<{ deliveryId: string }> {
  assertCanManage(actor);
  const delivery = await rawPrisma.webhookDelivery.findFirst({
    where: { id: deliveryId, endpoint: { workspaceId } },
    select: { id: true, status: true, payload: true },
  });
  if (!delivery) throw fail(404, "Delivery not found");
  if (delivery.status === "PENDING") {
    throw fail(409, "This delivery is still being sent.");
  }
  const projectId = payloadProjectId(delivery.payload);
  if (projectId && (await restrictedProjectIds(workspaceId, [projectId])).size > 0) {
    throw fail(409, "This event is about a restricted project and cannot be sent again.");
  }
  await rawPrisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: { status: "PENDING", error: null, responseStatus: null },
  });
  await enqueueOrMarkFailed(deliveryId, true);
  return { deliveryId };
}
