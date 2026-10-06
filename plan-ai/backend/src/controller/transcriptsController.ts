import { BaseWorkspaceController } from "./BaseWorkspaceController";
import {
  Route,
  Tags,
  Security,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Path,
  Query,
  Request,
  FormField,
  UploadedFile,
} from "tsoa";
import { Prisma, Transcript, TranscriptSource } from "@prisma/client";
import prisma from "../prisma/prismaClient";
import type { AuthenticatedRequest } from "../middleware/authMiddleware";
import { type ApiResponse, type TsoaJsonObject, type LiveChatHistoryItem } from "./controllerTypes";
import {
  transcriptCrudService,
  type TranscriptListOptions,
} from "../services/transcriptCrudService";
import { type TaskWithRelations } from "../services/taskCrudService";
import { projectTranscriptService } from "../services/projectTranscriptService";
import { resolveProjectIdsToContextIds } from "../services/projectContextResolver";
import {
  mapTaskResponse,
  mapPainPointResponse,
  type TaskResponse,
  type PainPointResponse,
} from "./projectsModelController";
import { transcriptGenerationQueue } from "../queue/transcriptGenerationQueue";
import { emailConfigured } from "../services/emailService";
import { NotesEmailError, sendMeetingNotes } from "../services/meetingNotesEmailService";
import {
  AudioInUseError,
  audioIsOnlyCopy,
  BUSY_STATUSES,
  deleteTranscriptAudio as deleteAudioFiles,
} from "../services/audioRetentionService";
import { parseBookmarks, parseCalendarEvent } from "../services/meetingNotes";
import {
  DISPLAY_URL_TTL_MS,
  readableUrl,
  uploadPrivateFile,
  recordingPartPath,
  recordingPartsPrefix,
  listPaths,
  composePaths,
  deletePrefix,
} from "../firebase/privateStorage";

// Ids chosen by clients for recording sessions and piecewise uploads. Short
// and path-safe, since they become part of storage paths.
const CLIENT_ID_PATTERN = /^[a-zA-Z0-9-]{8,64}$/;
// A part is a slice of one recording. The mobile app sends 8 MB slices.
const MAX_RECORDING_PART_BYTES = 32 * 1024 * 1024;
const MAX_RECORDING_PARTS = 5000;

export interface RecordingPartResponse {
  index: number;
  size: number;
}

export interface TranscriptAudioResponse {
  /** Signed URL of the microphone file (12 h), when there is one. */
  micUrl?: string;
  /** Signed URL of the system audio file (12 h), when there is one. */
  sysUrl?: string;
  /**
   * How much later the mic file runs than the system file, in seconds. To
   * play both in step: system time = mic time - offset.
   */
  micSysOffsetSeconds?: number;
  /** Set when the audio was deleted (retention rule or by hand). */
  audioDeletedAt?: string;
}

export interface SendMeetingNotesRequest {
  /** Email addresses, usually the people in the calendar invite. At most 30. */
  recipients: string[];
  /** Optional note shown above the notes. At most 2000 characters. */
  message?: string;
}

export interface SendMeetingNotesResponse {
  /** Addresses that got the email. */
  sent: string[];
  /** Addresses the email service refused or could not reach. */
  failed: string[];
  /** Entries that are not email addresses. */
  invalid: string[];
}

// Audio types accepted for files imported into the app and sent in slices.
const IMPORTED_AUDIO_TYPES: Record<string, string> = {
  wav: "audio/wav",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/aac",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  opus: "audio/ogg",
  webm: "audio/webm",
  flac: "audio/flac",
  caf: "audio/x-caf",
};

const importedAudioType = (fileName?: string): { ext: string; contentType: string } => {
  const ext = fileName?.split(".").pop()?.toLowerCase() ?? "";
  return IMPORTED_AUDIO_TYPES[ext]
    ? { ext, contentType: IMPORTED_AUDIO_TYPES[ext] }
    : { ext: "wav", contentType: "audio/wav" };
};
import { DocDocumentResponse } from "./docController";
import { TranscriptMetadata, type PostMeetingTaskKind } from "../services/transcriptMetadataTypes";
import { logger } from "../utils/logger";
import { recordAudit } from "../services/auditLogService";
import {
  translateTranscript,
  type TranscriptTranslationResult,
} from "../services/transcriptTranslationService";

interface TranscriptContextSummary {
  id: string;
  name: string;
  color: string | null;
}

interface StandaloneTranscriptResponse {
  id: string;
  projectId: string | null;
  project?: {
    id: string;
    title: string;
  } | null;
  userId: string;
  title: string | null;
  source: TranscriptSource;
  language: string | null;
  summary: string | null;
  transcript: string | null;
  recordedAt: Date | null;
  metadata: TranscriptMetadata | null;
  durationSeconds?: number | null;
  speakerCount?: number | null;
  sentiment?: string | null;
  utterances?: TsoaJsonObject | null;
  createdAt: Date;
  updatedAt: Date;
  tasks?: TaskResponse[];
  /** AI-extracted pain points, ranked most-severe first. */
  painPoints?: PainPointResponse[];
  documents?: DocDocumentResponse[];
  /** IDs of contexts attached to this transcript. */
  contextIds: string[];
  /** Resolved context summaries (id + name + color). Empty when not enriched by the caller. */
  contexts: TranscriptContextSummary[];
  chatThread?: {
    id: string;
    title: string;
    messages: {
      role: "USER" | "ASSISTANT";
      content: string;
      createdAt: Date;
    }[];
  } | null;
}

interface StandaloneTranscriptListResponse {
  transcripts: StandaloneTranscriptResponse[];
  total: number;
}

interface CreateStandaloneTranscriptBody {
  projectId?: string | null;
  title?: string | null;
  source?: TranscriptSource;
  content?: string | null;
  language?: string | null;
  summary?: string | null;
  recordedAt?: Date | null;
  metadata?: TsoaJsonObject | null;
  contextIds?: string[];
  persona?: "SECRETARY" | "ARCHITECT" | "PRODUCT_MANAGER" | "DEVELOPER";
  objective?: string | null;
  complexityLevel?: string;
  chatHistory?: LiveChatHistoryItem[];
  modelKey?: string;
  syncToJira?: boolean;
  syncToLinear?: boolean;
  syncToTrello?: boolean;
  syncToNotion?: boolean;
  syncToAsana?: boolean;
  syncToTwenty?: boolean;
  twentyCompanyId?: string;
  exportToGoogleDrive?: boolean;
  exportToOneDrive?: boolean;
  taskStrategy?: "AUTO" | "SINGLE_TICKET" | "SPECIFIC_COUNT";
  taskCount?: number;
  agenticInvestigation?: boolean;
  createDoc?: boolean;
  createSlides?: boolean;
}

interface UpdateStandaloneTranscriptBody {
  title?: string | null;
  source?: TranscriptSource;
  language?: string | null;
  summary?: string | null;
  transcript?: string | null;
  metadata?: TsoaJsonObject | null;
  recordedAt?: Date | null;
}

interface UpdateSpeakerNamesBody {
  /** Diarization label ("Speaker 0", "User 1") → corrected name. Blank name clears the identification. */
  overrides: Record<string, string>;
}

export interface TranslateTranscriptRequest {
  /** Language code to translate to, for example "en". */
  language: string;
  /** Translate again even when a stored translation exists. */
  force?: boolean;
}

export type TranscriptTranslationResponse = TranscriptTranslationResult;

@Route("api/transcripts")
@Tags("Transcripts")
export class TranscriptsController extends BaseWorkspaceController {
  private mapTranscriptResponse(
    t: Transcript & {
      project?: { id: string; title: string } | null;
      contexts?: TranscriptContextSummary[];
    },
  ): StandaloneTranscriptResponse {
    return {
      id: t.id,
      projectId: t.projectId,
      project: t.project,
      userId: t.userId,
      title: t.title,
      source: t.source,
      language: t.language,
      summary: t.summary,
      transcript: t.transcript,
      recordedAt: t.recordedAt,
      metadata: t.metadata as unknown as TranscriptMetadata,
      durationSeconds: t.durationSeconds,
      speakerCount: t.speakerCount,
      sentiment: t.sentiment,
      utterances: t.utterances as TsoaJsonObject,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      contextIds: t.contextIds ?? [],
      contexts: t.contexts ?? [],
      // Present when the fetch included the relation (single-transcript GET).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      painPoints: ((t as any).painPoints ?? []).map((p: any) => mapPainPointResponse(p)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chatThread: (t as any).chatThread
        ? {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            id: (t as any).chatThread.id,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            title: (t as any).chatThread.title,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            messages: (t as any).chatThread.messages.map((m: any) => ({
              role: m.role,
              content: m.content,
              createdAt: m.createdAt,
            })),
          }
        : null,
    };
  }

  /**
   * Batch-fetch context summaries (id, name, color) for every context referenced
   * by the supplied transcripts and return one resolved list per transcript.
   * Single SQL hit regardless of page size.
   */
  private async enrichTranscriptsWithContexts(
    workspaceId: string,
    transcripts: Transcript[],
  ): Promise<Map<string, TranscriptContextSummary[]>> {
    const allContextIds = Array.from(new Set(transcripts.flatMap((t) => t.contextIds ?? [])));
    if (allContextIds.length === 0) return new Map();

    const contexts = await prisma.context.findMany({
      where: { id: { in: allContextIds }, workspaceId },
      select: { id: true, name: true, color: true },
    });
    const byId = new Map(contexts.map((c) => [c.id, c]));

    const result = new Map<string, TranscriptContextSummary[]>();
    for (const t of transcripts) {
      const resolved = (t.contextIds ?? [])
        .map((id) => byId.get(id))
        .filter((c): c is TranscriptContextSummary => Boolean(c));
      result.set(t.id, resolved);
    }
    return result;
  }

  @Get()
  @Security("ClientLevel")
  public async listTranscripts(
    @Request() request: AuthenticatedRequest,
    @Query() page = 1,
    @Query() pageSize = 20,
    @Query() source?: TranscriptSource,
    @Query() q?: string,
    @Query() sentiment?: string,
    @Query() dateFilter?: string,
    @Query() sources?: string,
    @Query() projectId?: string,
    /**
     * List view. Each row carries only the first 300 characters of `transcript`
     * and no `utterances`. Opt-in, because installed recorder and mobile
     * versions read the full row from this endpoint.
     */
    @Query() lite?: boolean,
  ): Promise<ApiResponse<StandaloneTranscriptListResponse>> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    // Comma-separated multi-source filter, e.g. "RECORDING,TELEGRAM". Added
    // rather than making `source` an array so existing callers are untouched.
    // Unknown values are dropped instead of 400ing — a stale client asking for
    // a source we removed should get a narrower list, not an error.
    const parsedSources = sources
      ?.split(",")
      .map((value) => value.trim().toUpperCase())
      .filter((value): value is TranscriptSource =>
        Object.values(TranscriptSource).includes(value as TranscriptSource),
      );

    const options: TranscriptListOptions = {
      workspaceId,
      page,
      pageSize,
      source,
      sources: parsedSources,
      query: q,
      sentiment,
      dateFilter,
      // Scope to one project. The service already supported this; it just was
      // never reachable over HTTP, so every client had to filter client-side
      // (which silently only filtered the current page).
      projectId,
      lite: lite === true,
    };

    const result = await transcriptCrudService.listTranscriptsForUser(user.id, options);
    const contextsByTranscript = await this.enrichTranscriptsWithContexts(
      workspaceId,
      result.transcripts,
    );

    return {
      status: 200,
      data: {
        transcripts: result.transcripts.map((t) =>
          this.mapTranscriptResponse({ ...t, contexts: contextsByTranscript.get(t.id) ?? [] }),
        ),
        total: result.total,
      },
    };
  }

  private async buildContextPrompt(userId: string, contextIds: string[]): Promise<string | null> {
    if (!contextIds || contextIds.length === 0) {
      return null;
    }

    const sanitizedIds = Array.from(
      new Set(contextIds.map((id) => id.trim()).filter((id): id is string => id.length > 0)),
    );

    if (sanitizedIds.length === 0) {
      return null;
    }

    const contexts = await prisma.context.findMany({
      where: {
        id: {
          in: sanitizedIds,
        },
        userId,
      },
      include: {
        files: {
          select: {
            id: true,
            fileName: true,
          },
        },
      },
    });

    if (contexts.length !== sanitizedIds.length) {
      this.setStatus(404);
      throw { status: 404, message: "One or more contexts were not found" };
    }

    const sections = contexts.map((context) => {
      const details: string[] = [];

      if (context.description) {
        details.push(`Description: ${context.description}`);
      }

      const fileNames = context.files
        .map((file) => file.fileName)
        .filter((name): name is string => Boolean(name));

      if (fileNames.length > 0) {
        const limited = fileNames.slice(0, 5).join(", ");
        details.push(`Files: ${limited}`);
      }

      const detailsText = details.length > 0 ? ` - ${details.join(" | ")}` : "";
      return `• ${context.name}${detailsText}`;
    });

    return `Use the following context when analyzing the transcript:\n${sections.join("\n")}`;
  }

  /**
   * One slice of a recording sent in pieces. Long meetings from the mobile app
   * (uncompressed WAV, 170 MB per hour) could not finish one upload inside the
   * request timeout, and every retry sent the whole file again. Slices are
   * small, a retry resends only the slice that failed, and sending the same
   * slice twice just overwrites it. recorder-upload joins them in order when
   * it receives `micUploadId`.
   */
  @Post("recorder-upload/parts")
  @Security("ClientLevel")
  public async uploadRecordingPart(
    @Request() request: AuthenticatedRequest,
    @FormField() uploadId: string,
    @FormField() index: string,
    @UploadedFile("part") part: Express.Multer.File,
  ): Promise<ApiResponse<RecordingPartResponse>> {
    const { user } = await this.getAuthorizedWorkspaceAccess(request);
    const partIndex = Number.parseInt(index, 10);
    if (!CLIENT_ID_PATTERN.test(uploadId)) {
      throw { status: 400, message: "Invalid uploadId." };
    }
    if (!Number.isInteger(partIndex) || partIndex < 0 || partIndex >= MAX_RECORDING_PARTS) {
      throw { status: 400, message: "Invalid part index." };
    }
    if (!part || part.size === 0) throw { status: 400, message: "Empty part." };
    if (part.size > MAX_RECORDING_PART_BYTES) {
      throw { status: 413, message: "Part too large." };
    }
    await uploadPrivateFile(
      recordingPartPath(user.id, uploadId, partIndex),
      part.buffer,
      "application/octet-stream",
    );
    return { status: 200, data: { index: partIndex, size: part.size } };
  }

  /** Drops the slices of a recording the user discarded before it was joined. */
  @Delete("recorder-upload/parts/{uploadId}")
  @Security("ClientLevel")
  public async deleteRecordingParts(
    @Request() request: AuthenticatedRequest,
    @Path() uploadId: string,
  ): Promise<ApiResponse<{ success: boolean }>> {
    const { user } = await this.getAuthorizedWorkspaceAccess(request);
    if (!CLIENT_ID_PATTERN.test(uploadId)) {
      throw { status: 400, message: "Invalid uploadId." };
    }
    await deletePrefix(recordingPartsPrefix(user.id, uploadId));
    return { status: 200, data: { success: true } };
  }

  @Post("recorder-upload")
  @Security("ClientLevel")
  public async createTranscriptFromRecording(
    @Request() request: AuthenticatedRequest,
    @FormField() source?: TranscriptSource,
    @FormField() content?: string,
    @FormField() title?: string,
    @FormField() recordedAt?: string,
    @FormField() projectId?: string,
    @FormField() contextIds?: string,
    @FormField() chatHistory?: string,
    @FormField() modelKey?: string,
    @FormField() complexityLevel?: string,
    @FormField() syncToJira?: string,
    @FormField() syncToLinear?: string,
    @FormField() syncToTrello?: string,
    @FormField() syncToNotion?: string,
    @FormField() syncToAsana?: string,
    @FormField() syncToTwenty?: string,
    @FormField() twentyCompanyId?: string,
    @FormField() exportToGoogleDrive?: string,
    @FormField() exportToOneDrive?: string,
    @FormField() skipAi?: string,
    @FormField() taskStrategy?: "AUTO" | "SINGLE_TICKET" | "SPECIFIC_COUNT",
    @FormField() taskCount?: string,
    @FormField() agenticInvestigation?: string,
    @FormField() location?: string,
    @FormField() createDoc?: string,
    @FormField() createSlides?: string,
    @FormField() language?: string,
    @FormField() aecTelemetry?: string,
    @FormField() recordingStartedAt?: string,
    @FormField() recordingWallClockSeconds?: string,
    /** Mic audio already sent in slices to recorder-upload/parts under this id. */
    @FormField() micUploadId?: string,
    /** How many slices were sent for micUploadId (0 … count-1). */
    @FormField() micPartCount?: string,
    /** Client recording session id; a retry with the same id is not duplicated. */
    @FormField() clientSessionId?: string,
    /** "in_person" (one mic, several people in the room) or "remote". */
    @FormField() recordingMode?: string,
    /** JSON array of { atSeconds, note? }: moments marked during the meeting. */
    @FormField() bookmarks?: string,
    /** JSON { title, start?, end?, attendees[{ name?, email }], meetingUrl?, provider? }. */
    @FormField() calendarEvent?: string,
    /**
     * Original file name of audio sent in slices, for imported files (m4a,
     * mp3...). Recordings made in the app are WAV and can omit it.
     */
    @FormField() micFileName?: string,
    @UploadedFile("micFile") micFile?: Express.Multer.File,
    @UploadedFile("sysFile") sysFile?: Express.Multer.File,
  ): Promise<ApiResponse<StandaloneTranscriptResponse>> {
    // A retried upload (the client timed out after the server had already
    // saved it) returns the transcript created the first time. Checked before
    // the subscription and usage checks, and across workspaces: a meeting the
    // server already holds must never be refused or saved twice.
    const sessionId =
      clientSessionId && CLIENT_ID_PATTERN.test(clientSessionId) ? clientSessionId : undefined;
    if (sessionId) {
      const { user: caller } = await this.getAuthorizedWorkspaceAccess(request);
      const existing = await prisma.transcript.findFirst({
        where: {
          userId: caller.id,
          metadata: { path: ["clientSessionId"], equals: sessionId },
        },
      });
      if (existing) {
        logger.info(
          `[recorder-upload] session ${sessionId} already saved as ${existing.id}, returning it`,
        );
        if (micUploadId && CLIENT_ID_PATTERN.test(micUploadId)) {
          void deletePrefix(recordingPartsPrefix(caller.id, micUploadId)).catch(() => undefined);
        }
        // Saved but never queued (the queue failed on the first try): queue it
        // now. The job id is the transcript id, so a job that already exists
        // is not added twice.
        const meta = (existing.metadata as Prisma.JsonObject | null) ?? {};
        if (meta.processingStatus === "PENDING") {
          const options = (meta.generationOptions as Prisma.JsonObject | undefined) ?? {};
          await transcriptGenerationQueue.add(
            "generate-transcript",
            {
              ...(options as object),
              transcriptId: existing.id,
              workspaceId: existing.workspaceId,
              projectId: existing.projectId || undefined,
              userId: caller.id,
              content: existing.transcript === "Processing..." ? "" : (existing.transcript ?? ""),
              source: existing.source,
              ...(meta.transcribeOnly === true ? { transcribeOnly: true } : {}),
            },
            { jobId: existing.id },
          );
        }
        return { status: 200, data: this.mapTranscriptResponse(existing) };
      }
    }

    const { user, workspaceId } = await this.getPaidLlmAccess(request);
    const parsedBookmarks = parseBookmarks(bookmarks);
    const parsedCalendarEvent = parseCalendarEvent(calendarEvent);
    const mode =
      recordingMode === "in_person" || recordingMode === "remote" ? recordingMode : undefined;

    console.log(`[Upload Debug] POST /api/transcripts/recorder-upload hit by user ${user.id}`);
    console.log(
      `[Upload Debug] micFile present? ${!!micFile} (size: ${micFile?.size}, name: ${micFile?.originalname})`,
    );
    console.log(
      `[Upload Debug] sysFile present? ${!!sysFile} (size: ${sysFile?.size}, name: ${sysFile?.originalname})`,
    );

    // Parse JSON arrays which arrived as strings in formData
    let contextIdsArray: string[] = contextIds ? JSON.parse(contextIds) : [];
    const chatHistoryArray = chatHistory ? JSON.parse(chatHistory) : [];
    const locationObj = location ? JSON.parse(location) : undefined;

    // Transcription language the user picked in the recorder ("ca", "es",
    // "pt-BR", …). Validated so an arbitrary string can never reach the ASR
    // call; stored in metadata so batch re-diarization (and any reprocess)
    // honours the choice instead of falling back to "multi".
    const recordingLanguage =
      language && /^[a-z]{2,3}(-[A-Za-z0-9]{2,10})?$/i.test(language) ? language : undefined;

    // Echo-canceller outcome reported by the recorder (previously console-only):
    // records per-recording whether the uploaded mic was cleaned, skipped
    // (cap/headphones) or rejected — the key diagnostic for echoey meetings.
    // Diagnostics must never block an upload, so parse failures are ignored.
    // Real capture window, when the recorder reports it. `recordedAt` above is
    // UPLOAD time, unusable for telling apart two teammates' recordings of the
    // same meeting (see twentyIntegrationService's overlap test) — this is the
    // actual instant the mic/system capture began. Never blocks the upload.
    let recordingWindow: Prisma.JsonObject | undefined;
    if (recordingStartedAt) {
      const startedAtDate = new Date(recordingStartedAt);
      if (!Number.isNaN(startedAtDate.getTime())) {
        const wallClockSeconds = recordingWallClockSeconds
          ? Number.parseInt(recordingWallClockSeconds, 10)
          : undefined;
        recordingWindow = {
          startedAt: startedAtDate.toISOString(),
          ...(wallClockSeconds && Number.isFinite(wallClockSeconds) && wallClockSeconds > 0
            ? { wallClockSeconds }
            : {}),
        };
      }
    }

    let recorderAec: Prisma.JsonObject | undefined;
    if (aecTelemetry && aecTelemetry.length <= 2048) {
      try {
        const parsed = JSON.parse(aecTelemetry);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          recorderAec = parsed as Prisma.JsonObject;
        }
      } catch {
        /* malformed telemetry — ignore */
      }
    }

    // If the client only sent a projectId (mobile / recorder after the Context
    // refactor), auto-derive the project's paired contextId so AI generation,
    // RAG queries, and downstream chat see the project's files.
    if (contextIdsArray.length === 0 && projectId) {
      contextIdsArray = await resolveProjectIdsToContextIds([projectId]);
    }

    // Validate the target project BEFORE touching storage. This used to run
    // after the upload, so a rejected project left orphaned blobs in Firebase
    // AND lost the recording the user had just finished — the worst possible
    // failure for a meeting recorder.
    if (projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId, userId: user.id, workspaceId },
      });
      if (!project) throw { status: 404, message: "Project not found or unauthorized." };
    }

    // Optional Firebase Upload logic inline (if files exist)
    let rawMicUrl: string | undefined;
    let rawSysUrl: string | undefined;

    // Recordings are private: the database keeps gs:// URIs and the
    // speech-to-text and voice services get signed URLs when they need them.
    if (micFile || sysFile) {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

      if (micFile) {
        if (micFile.buffer.length > 44) {
          const riff = micFile.buffer.toString("utf8", 0, 4);
          const sizeHex = micFile.buffer.readUInt32LE(4);
          if (riff === "RIFF" && sizeHex === 0xffffffff) {
            const dataSize = micFile.buffer.length - 44;
            micFile.buffer.writeUInt32LE(dataSize + 36, 4);
            micFile.buffer.writeUInt32LE(dataSize, 40);
            console.log(`[Upload Debug] Patched micFile WAV header. Data Size: ${dataSize}`);
          }
        }

        const ext = micFile.originalname.split(".").pop() || "webm";
        rawMicUrl = await uploadPrivateFile(
          `transcripts/${user.id}/${uniqueSuffix}-mic.${ext}`,
          micFile.buffer,
          micFile.mimetype,
        );
      }

      if (sysFile) {
        if (sysFile.buffer.length > 44) {
          const riff = sysFile.buffer.toString("utf8", 0, 4);
          const sizeHex = sysFile.buffer.readUInt32LE(4);
          if (riff === "RIFF" && sizeHex === 0xffffffff) {
            const dataSize = sysFile.buffer.length - 44;
            sysFile.buffer.writeUInt32LE(dataSize + 36, 4);
            sysFile.buffer.writeUInt32LE(dataSize, 40);
            console.log(`[Upload Debug] Patched sysFile WAV header. Data Size: ${dataSize}`);
          }
        }

        const ext = sysFile.originalname.split(".").pop() || "webm";
        rawSysUrl = await uploadPrivateFile(
          `transcripts/${user.id}/${uniqueSuffix}-sys.${ext}`,
          sysFile.buffer,
          sysFile.mimetype,
        );
      }
    }

    let partsPrefixToDelete: string | undefined;
    // Mic sent in slices: check every slice arrived, then join them in order.
    // The client builds slice 0 as a WAV header with the real sizes, so the
    // joined object is a valid WAV file.
    if (!micFile && micUploadId) {
      if (!CLIENT_ID_PATTERN.test(micUploadId)) {
        throw { status: 400, message: "Invalid micUploadId." };
      }
      const expected = Number.parseInt(micPartCount ?? "", 10);
      if (!Number.isInteger(expected) || expected <= 0 || expected > MAX_RECORDING_PARTS) {
        throw { status: 400, message: "Invalid micPartCount." };
      }
      const prefix = recordingPartsPrefix(user.id, micUploadId);
      const stored = new Set(await listPaths(prefix));
      const parts = Array.from({ length: expected }, (_, i) =>
        recordingPartPath(user.id, micUploadId, i),
      );
      const missing = parts.flatMap((p, i) => (stored.has(p) ? [] : [i]));
      if (missing.length > 0) {
        throw {
          status: 409,
          message: `Recording upload incomplete: missing parts ${missing.slice(0, 20).join(", ")}${
            missing.length > 20 ? "…" : ""
          }`,
        };
      }
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const audioType = importedAudioType(micFileName);
      rawMicUrl = await composePaths(
        parts,
        `transcripts/${user.id}/${uniqueSuffix}-mic.${audioType.ext}`,
        audioType.contentType,
      );
      // Deleted once the transcript row exists (below): if creating it fails,
      // the client retries with the same parts instead of sending them again.
      partsPrefixToDelete = prefix;
    }

    // "Save transcript only" with audio but no live text (the live socket never
    // connected, or the save came from a recovered session) used to be stored
    // as "Processing..." and marked done, so the audio was never transcribed.
    // It now goes through transcription alone, without the AI steps.
    const hasAudio = !!(rawMicUrl || rawSysUrl);
    const transcribeOnly = skipAi === "true" && hasAudio && !content?.trim();

    const contextPrompt = await this.buildContextPrompt(user.id, contextIdsArray);

    const generationOptions = {
      contextIds: contextIdsArray,
      persona: undefined,
      complexityLevel: complexityLevel || undefined,
      modelKey: modelKey || undefined,
      syncToJira: syncToJira === "true",
      syncToLinear: syncToLinear === "true",
      syncToTrello: syncToTrello === "true",
      syncToNotion: syncToNotion === "true",
      syncToAsana: syncToAsana === "true",
      syncToTwenty: syncToTwenty === "true",
      twentyCompanyId,
      exportToGoogleDrive: exportToGoogleDrive === "true",
      exportToOneDrive: exportToOneDrive === "true",
      taskStrategy,
      taskCount: taskCount ? parseInt(taskCount, 10) : undefined,
      contextPrompt: contextPrompt ?? undefined,
      agenticInvestigation: agenticInvestigation === "true",
      createDoc: createDoc === "true",
      createSlides: createSlides === "true",
    };

    // Save initial metadata and live content fallback
    const transcript = await prisma.transcript.create({
      data: {
        userId: user.id,
        workspaceId,
        projectId: projectId ?? null,
        title: title ?? "Generating Transcript...",
        source: source ?? TranscriptSource.RECORDING,
        language: null,
        summary: null,
        transcript: content?.trim() ? content : hasAudio ? "Processing..." : (content ?? ""),
        recordedAt: recordedAt ? new Date(recordedAt) : null,
        rawMicUrl,
        rawSysUrl,
        contextIds: contextIdsArray,
        metadata: {
          processingStatus: skipAi === "true" && !transcribeOnly ? "DONE" : "PENDING",
          ...(locationObj ? { location: locationObj } : {}),
          ...(recordingLanguage ? { recordingLanguage } : {}),
          ...(recorderAec ? { recorderAec } : {}),
          ...(recordingWindow ? { recording: recordingWindow } : {}),
          ...(mode ? { recordingMode: mode } : {}),
          ...(sessionId ? { clientSessionId: sessionId } : {}),
          ...(parsedBookmarks.length > 0
            ? { bookmarks: parsedBookmarks as unknown as Prisma.JsonArray }
            : {}),
          ...(parsedCalendarEvent
            ? { calendarEvent: parsedCalendarEvent as unknown as Prisma.JsonObject }
            : {}),
          ...(transcribeOnly ? { transcribeOnly: true } : {}),
          generationOptions,
        } as Prisma.JsonObject,
      },
    });

    if (partsPrefixToDelete) {
      const prefix = partsPrefixToDelete;
      void deletePrefix(prefix).catch((err) =>
        logger.warn(`[recorder-upload] could not delete parts under ${prefix}`, err),
      );
    }

    if (skipAi !== "true" || transcribeOnly) {
      try {
        await transcriptGenerationQueue.add(
          "generate-transcript",
          {
            transcriptId: transcript.id,
            workspaceId,
            projectId: projectId || undefined,
            userId: user.id,
            content: content ?? "",
            source: source ?? TranscriptSource.RECORDING,
            ...generationOptions,
            ...(transcribeOnly ? { transcribeOnly: true } : {}),
          },
          { jobId: transcript.id },
        );
      } catch (err) {
        // Without a job the row would sit in PENDING forever. The client's
        // retry (same clientSessionId) finds it and queues it again.
        logger.error(`[recorder-upload] could not queue transcript ${transcript.id}`, err);
        throw { status: 503, message: "Could not queue the transcript. Please retry." };
      }
    } else if (generationOptions.syncToTwenty) {
      // "Save transcript only" skips the AI worker entirely — but a CRM note
      // needs no AI, and the user ticked the box. Without this the checkbox
      // silently did nothing on that path.
      void projectTranscriptService
        .autoPushToTwenty(workspaceId, transcript, generationOptions.twentyCompanyId)
        .catch((err) => {
          logger.error(`Failed to push transcript ${transcript.id} to Twenty (skipAi path)`, err);
        });
    }

    if (chatHistoryArray.length > 0) {
      // The meeting is saved and queued at this point; losing the live chat
      // must not turn the upload into an error the client would retry.
      try {
        await prisma.chatThread.create({
          data: {
            transcriptId: transcript.id,
            title: "Live Recording Assistant",
            userId: user.id,
            workspaceId,
            messages: {
              create: chatHistoryArray.map((msg: { role: string; content: string }) => ({
                role: msg.role === "user" ? "USER" : "ASSISTANT",
                content: msg.content,
                createdAt: new Date(),
              })),
            },
          },
        });
      } catch (err) {
        logger.error(`[recorder-upload] could not save the live chat of ${transcript.id}`, err);
      }
    }

    // Reuse map function from standard POST
    return {
      status: 200,
      data: this.mapTranscriptResponse(transcript),
    };
  }

  @Post()
  @Security("ClientLevel")
  public async createTranscript(
    @Request() request: AuthenticatedRequest,
    @Body() body: CreateStandaloneTranscriptBody,
  ): Promise<ApiResponse<StandaloneTranscriptResponse>> {
    try {
      const { user, workspaceId } = await this.getPaidLlmAccess(request);

      let transcript: Transcript;

      if (!body.content) {
        // Empty transcript (just metadata creation)
        const transcriptInput = {
          ...body,
          workspaceId,
          metadata: body.metadata as Prisma.InputJsonValue | undefined,
        };
        transcript = await transcriptCrudService.createTranscriptForUser(user.id, transcriptInput);
      } else {
        const contextPrompt = await this.buildContextPrompt(user.id, body.contextIds ?? []);

        if (body.projectId) {
          // Security check: ensure user has access to this project
          const project = await prisma.project.findUnique({
            where: { id: body.projectId, userId: user.id, workspaceId },
          });

          if (!project) {
            this.setStatus(404);
            throw { status: 404, message: "Project not found or unauthorized to attach." };
          }
        }

        const generationOptions = {
          contextIds: body.contextIds,
          persona: body.persona,
          objective: body.objective ?? undefined,
          complexityLevel: body.complexityLevel ?? undefined,
          modelKey: body.modelKey ?? undefined,
          syncToJira: body.syncToJira,
          syncToLinear: body.syncToLinear,
          syncToTrello: body.syncToTrello,
          syncToNotion: body.syncToNotion,
          syncToAsana: body.syncToAsana,
          syncToTwenty: body.syncToTwenty,
          twentyCompanyId: body.twentyCompanyId,
          exportToGoogleDrive: body.exportToGoogleDrive,
          exportToOneDrive: body.exportToOneDrive,
          taskStrategy: body.taskStrategy,
          taskCount: body.taskCount,
          agenticInvestigation: body.agenticInvestigation,
          createDoc: body.createDoc,
          createSlides: body.createSlides,
          contextPrompt: contextPrompt ?? undefined,
        };

        const pendingResult = await projectTranscriptService.createPendingTranscript({
          projectId: body.projectId || "",
          userId: user.id,
          workspaceId,
          content: body.content,
          title: body.title ?? undefined,
          source: body.source ?? TranscriptSource.MANUAL,
          recordedAt: body.recordedAt ?? null,
          contextIds: body.contextIds,
          metadata: {
            ...((body.metadata as Record<string, unknown>) || {}),
            generationOptions,
          } as Prisma.InputJsonValue,
        });

        transcript = pendingResult.transcript;

        // Push to BullMQ Worker. Use resolved contextIds from transcript row.
        await transcriptGenerationQueue.add("generate-transcript", {
          transcriptId: transcript.id,
          workspaceId,
          projectId: body.projectId || undefined,
          userId: user.id,
          content: body.content,
          source: body.source ?? TranscriptSource.MANUAL,
          ...generationOptions,
          contextIds: transcript.contextIds,
        });

        // Save Chat History for both Standalone and Project-linked transcripts
        if (body.chatHistory && body.chatHistory.length > 0) {
          await prisma.chatThread.create({
            data: {
              userId: user.id,
              workspaceId,
              title: transcript.title || "Live Meeting Chat",
              transcriptId: transcript.id,
              contextIds: transcript.contextIds,
              messages: {
                create: body.chatHistory.map((m) => ({
                  role: m.role.toUpperCase() as "USER" | "ASSISTANT",
                  content: m.content,
                })),
              },
            },
          });
        }

        this.setStatus(202);
        return {
          status: 202,
          data: this.mapTranscriptResponse(transcript),
        };
      }

      this.setStatus(201);
      return {
        status: 201,
        data: this.mapTranscriptResponse(transcript),
      };
    } catch (error) {
      console.error("[ERROR] Failed to create transcript:", error);
      throw error;
    }
  }

  /**
   * Short-lived links to listen to a meeting's audio, plus what the player
   * needs to keep the two files in step.
   */
  /**
   * Emails the summary, key points and action items to the people the user
   * picks. Each gets their own email and replies go to the user. Allowed for
   * whoever recorded the meeting and for workspace admins.
   */
  @Post("{id}/send-notes")
  @Security("ClientLevel")
  public async sendMeetingNotes(
    @Request() request: AuthenticatedRequest,
    @Path() id: string,
    @Body() body: SendMeetingNotesRequest,
  ): Promise<ApiResponse<SendMeetingNotesResponse>> {
    const { user, workspaceId, role } = await this.getAuthorizedWorkspaceAccess(request);
    const transcript = await transcriptCrudService.getTranscriptForWorkspace(workspaceId, id);
    if (!transcriptCrudService.canDeleteTranscript(transcript, user.id, role)) {
      throw {
        status: 403,
        message: "Only the person who recorded it or a workspace admin can send the notes.",
      };
    }
    if (!emailConfigured()) {
      throw { status: 503, message: "Email is not configured on this server." };
    }
    // Until the pipeline finishes, the action items are not there yet.
    const status = (transcript.metadata as Prisma.JsonObject | null)?.processingStatus;
    if (typeof status === "string" && BUSY_STATUSES.has(status)) {
      throw { status: 409, message: "The notes are not ready yet. Try again when it finishes." };
    }
    let result: SendMeetingNotesResponse;
    try {
      result = await sendMeetingNotes({
        transcript,
        workspaceId,
        sender: { id: user.id, name: user.name, email: user.email },
        recipients: body.recipients,
        message: body.message,
      });
    } catch (err) {
      if (err instanceof NotesEmailError) throw { status: err.status, message: err.message };
      throw err;
    }
    if (result.sent.length === 0) {
      throw { status: 502, message: "The email could not be sent. Try again later." };
    }
    return { status: 200, data: result };
  }

  @Get("{id}/audio")
  @Security("ClientLevel")
  public async getTranscriptAudio(
    @Request() request: AuthenticatedRequest,
    @Path() id: string,
  ): Promise<ApiResponse<TranscriptAudioResponse>> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);
    const transcript = await transcriptCrudService.getTranscriptForWorkspace(workspaceId, id);
    const meta = (transcript.metadata as Prisma.JsonObject | null) ?? {};
    const [micUrl, sysUrl] = await Promise.all([
      transcript.rawMicUrl ? readableUrl(transcript.rawMicUrl, DISPLAY_URL_TTL_MS) : undefined,
      transcript.rawSysUrl ? readableUrl(transcript.rawSysUrl, DISPLAY_URL_TTL_MS) : undefined,
    ]);
    const offsetMs = typeof meta.micSysOffsetMs === "number" ? meta.micSysOffsetMs : undefined;
    return {
      status: 200,
      data: {
        ...(micUrl ? { micUrl } : {}),
        ...(sysUrl ? { sysUrl } : {}),
        ...(offsetMs !== undefined ? { micSysOffsetSeconds: offsetMs / 1000 } : {}),
        ...(typeof meta.audioDeletedAt === "string" ? { audioDeletedAt: meta.audioDeletedAt } : {}),
      },
    };
  }

  /**
   * Deletes a meeting's audio files and keeps everything made from them.
   * Allowed for whoever recorded it and for workspace owners.
   */
  @Delete("{id}/audio")
  @Security("ClientLevel")
  public async deleteTranscriptAudio(
    @Request() request: AuthenticatedRequest,
    @Path() id: string,
  ): Promise<ApiResponse<{ success: boolean }>> {
    const { user, workspaceId, role } = await this.getAuthorizedWorkspaceAccess(request);
    const transcript = await transcriptCrudService.getTranscriptForWorkspace(workspaceId, id);
    if (!transcriptCrudService.canDeleteTranscript(transcript, user.id, role)) {
      throw {
        status: 403,
        message: "Only the person who recorded it or a workspace admin can delete it.",
      };
    }
    const status = (transcript.metadata as Prisma.JsonObject | null)?.processingStatus;
    if (typeof status === "string" && BUSY_STATUSES.has(status)) {
      throw {
        status: 409,
        message: "The meeting is still being processed. Try again when it finishes.",
      };
    }
    if (audioIsOnlyCopy(transcript)) {
      throw {
        status: 409,
        message:
          "This meeting was never transcribed, so the audio is all there is. Delete the meeting instead.",
      };
    }
    try {
      await deleteAudioFiles(transcript, "user");
    } catch (err) {
      if (err instanceof AudioInUseError) throw { status: 409, message: err.message };
      throw err;
    }
    await recordAudit({
      workspaceId,
      actor: user,
      action: "meeting.audio_deleted",
      targetType: "transcript",
      targetId: id,
      metadata: { title: transcript.title },
      request,
    });
    return { status: 200, data: { success: true } };
  }

  @Get("{id}")
  @Security("ClientLevel")
  public async getTranscript(
    @Request() request: AuthenticatedRequest,
    @Path() id: string,
  ): Promise<ApiResponse<StandaloneTranscriptResponse>> {
    const { user, workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    const transcript = await transcriptCrudService.getTranscriptForWorkspace(workspaceId, id);

    const rawTasks = await prisma.task.findMany({
      where: {
        transcriptLinks: {
          some: { transcriptId: id },
        },
        project: { userId: user.id, workspaceId },
      },
      include: {
        dependants: {
          select: { dependsOnTaskId: true },
        },
      },
      take: 200,
    });

    const mappedTasks = rawTasks.map((t) => mapTaskResponse(t as unknown as TaskWithRelations));

    const rawDocuments = await prisma.docDocument.findMany({
      where: {
        transcriptIds: {
          has: id,
        },
        workspaceId,
      },
      include: { theme: true },
      take: 50,
    });

    return {
      status: 200,
      data: {
        ...this.mapTranscriptResponse(transcript),
        tasks: mappedTasks,
        documents: rawDocuments as unknown as DocDocumentResponse[],
      },
    };
  }

  @Put("{id}")
  @Security("ClientLevel")
  public async updateTranscript(
    @Request() request: AuthenticatedRequest,
    @Path() id: string,
    @Body() body: UpdateStandaloneTranscriptBody,
  ): Promise<ApiResponse<StandaloneTranscriptResponse>> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    const updateInput = {
      ...body,
      metadata: body.metadata as Prisma.InputJsonValue | undefined,
    };
    const transcript = await transcriptCrudService.updateTranscriptForWorkspace(
      workspaceId,
      id,
      updateInput,
    );

    return {
      status: 200,
      data: this.mapTranscriptResponse(transcript),
    };
  }

  /**
   * Corrects AI-inferred speaker names. Body maps the stable diarization label
   * ("Speaker 0", "User 1") to the corrected human name; blank clears it. The
   * fix lands in metadata.speakers (what every app renders) and survives
   * reprocessing via metadata.speakerNameOverrides.
   */
  @Put("{id}/speakers")
  @Security("ClientLevel")
  public async updateTranscriptSpeakers(
    @Request() request: AuthenticatedRequest,
    @Path() id: string,
    @Body() body: UpdateSpeakerNamesBody,
  ): Promise<ApiResponse<StandaloneTranscriptResponse>> {
    const { workspaceId } = await this.getAuthorizedWorkspaceAccess(request);

    const transcript = await transcriptCrudService.updateSpeakerNamesForWorkspace(
      workspaceId,
      id,
      body.overrides ?? {},
    );

    return {
      status: 200,
      data: this.mapTranscriptResponse(transcript),
    };
  }

  /**
   * The transcript and its summary in another language. The first call for a
   * language translates and stores it; later calls return the stored copy.
   */
  @Post("{id}/translate")
  @Security("ClientLevel")
  public async translateTranscript(
    @Request() request: AuthenticatedRequest,
    @Path() id: string,
    @Body() body: TranslateTranscriptRequest,
  ): Promise<ApiResponse<TranscriptTranslationResponse>> {
    const { user, workspaceId } = await this.getPaidLlmAccess(request);
    try {
      const data = await translateTranscript({
        workspaceId,
        userId: user.id,
        transcriptId: id,
        language: body.language,
        force: body.force,
      });
      return { status: 200, data };
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (typeof status === "number") this.setStatus(status);
      throw err;
    }
  }

  @Post("{id}/reprocess")
  @Security("ClientLevel")
  public async reprocessTranscript(
    @Request() request: AuthenticatedRequest,
    @Path() id: string,
  ): Promise<ApiResponse<StandaloneTranscriptResponse>> {
    const { user, workspaceId } = await this.getPaidLlmAccess(request);

    const existing = await transcriptCrudService.getTranscriptForWorkspace(workspaceId, id);

    if (!existing) {
      this.setStatus(404);
      throw { status: 404, message: "Transcript not found" };
    }

    const currentStatus = (existing.metadata as Record<string, unknown>)?.processingStatus as
      | string
      | undefined;
    if (currentStatus === "PENDING" || currentStatus === "PROCESSING") {
      this.setStatus(409);
      throw { status: 409, message: "Transcript is already being processed" };
    }

    // Reset status to PENDING so the UI reflects it immediately
    const newMetadata = { ...(existing.metadata as Record<string, unknown>) };
    newMetadata.processingStatus = "PENDING";
    delete newMetadata.postMeetingTasks;
    delete newMetadata.errorMessage;

    const updated = await prisma.transcript.update({
      where: { id },
      data: {
        summary: null,
        sentiment: null,
        metadata: newMetadata as Prisma.JsonObject,
      },
    });

    // Extract saved generation options if any
    const metadata = (existing.metadata as Record<string, unknown>) || {};
    const generationOptions = (metadata.generationOptions as Record<string, unknown>) || {};

    // Re-enqueue into the generation worker
    await transcriptGenerationQueue.add("generate-transcript", {
      transcriptId: id,
      workspaceId,
      projectId: existing.projectId ?? undefined,
      userId: user.id,
      content: existing.transcript ?? "",
      source: existing.source,
      ...generationOptions,
    });

    return {
      status: 200,
      data: this.mapTranscriptResponse(updated),
    };
  }

  /**
   * Retry a single failed post-meeting task (Jira sync, Google Drive export,
   * doc generation, etc.) without rerunning the entire transcript pipeline.
   * Returns immediately; the caller observes the status transition via
   * `metadata.postMeetingTasks.{kind}` on the next transcript poll.
   */
  @Post("{id}/post-meeting-tasks/{kind}/retry")
  @Security("ClientLevel")
  public async retryPostMeetingTask(
    @Request() request: AuthenticatedRequest,
    @Path() id: string,
    @Path() kind: PostMeetingTaskKind,
  ): Promise<ApiResponse<{ success: boolean }>> {
    const { user, workspaceId } = await this.getPaidLlmAccess(request);

    const existing = await transcriptCrudService.getTranscriptForWorkspace(workspaceId, id);
    if (!existing) {
      this.setStatus(404);
      throw { status: 404, message: "Transcript not found" };
    }

    try {
      await projectTranscriptService.retryPostMeetingTask(workspaceId, user.id, id, kind);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "ALREADY_PENDING") {
        this.setStatus(409);
        throw { status: 409, message: "This post-meeting task is already in progress" };
      }
      logger.error(
        `[retryPostMeetingTask] dispatch failed for transcript ${id}, kind=${kind}`,
        err,
      );
      this.setStatus(500);
      throw { status: 500, message: msg };
    }

    return { status: 200, data: { success: true } };
  }

  @Delete("{id}")
  @Security("ClientLevel")
  public async deleteTranscript(
    @Request() request: AuthenticatedRequest,
    @Path() id: string,
  ): Promise<ApiResponse<{ success: boolean }>> {
    const { user, workspaceId, role } = await this.getAuthorizedWorkspaceAccess(request);

    await transcriptCrudService.deleteTranscriptForWorkspace(workspaceId, id, {
      userId: user.id,
      role,
    });

    return {
      status: 200,
      data: { success: true },
    };
  }
}
