import { Prisma, Transcript, TranscriptSource } from "@prisma/client";
import prisma from "../prisma/prismaClient";

export interface TranscriptListResult {
  transcripts: Transcript[];
  total: number;
}

export interface TranscriptListOptions {
  sessionId?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateTranscriptInput {
  sessionId: string;
  title?: string | null;
  source?: TranscriptSource;
  content?: string | null;
  language?: string | null;
  summary?: string | null;
  recordedAt?: Date | null;
  metadata?: Prisma.InputJsonValue | null;
}

export interface UpdateTranscriptInput {
  title?: string | null;
  source?: TranscriptSource;
  language?: string | null;
  summary?: string | null;
  transcript?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  recordedAt?: Date | null;
}

export class TranscriptCrudService {
  public async createTranscriptForUser(
    userId: string,
    input: CreateTranscriptInput,
  ): Promise<Transcript> {
    await this.assertSessionBelongsToUser(userId, input.sessionId);

    return prisma.transcript.create({
      data: {
        sessionId: input.sessionId,
        title: input.title ?? null,
        source: input.source ?? TranscriptSource.MANUAL,
        transcript: input.content ?? null,
        language: input.language ?? null,
        summary: input.summary ?? null,
        recordedAt: input.recordedAt ?? null,
        metadata:
          typeof input.metadata === "undefined"
            ? undefined
            : input.metadata === null
              ? Prisma.JsonNull
              : input.metadata,
      },
    });
  }

  public async listTranscriptsForUser(
    userId: string,
    options: TranscriptListOptions,
  ): Promise<TranscriptListResult> {
    const page = Math.max(options.page ?? 1, 1);
    const pageSize = Math.min(Math.max(options.pageSize ?? 20, 1), 100);
    const skip = (page - 1) * pageSize;

    const where: Prisma.TranscriptWhereInput = {
      session: { user: { id: userId } },
      ...(options.sessionId ? { sessionId: options.sessionId } : {}),
    };

    const [transcripts, total] = await Promise.all([
      prisma.transcript.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.transcript.count({ where }),
    ]);

    return { transcripts, total };
  }

  public async getTranscriptForUser(userId: string, transcriptId: string): Promise<Transcript> {
    const transcript = await prisma.transcript.findFirst({
      where: {
        id: transcriptId,
        session: { user: { id: userId } },
      },
    });

    if (!transcript) {
      throw { status: 404, message: "Transcript not found" };
    }

    return transcript;
  }

  public async updateTranscriptForUser(
    userId: string,
    transcriptId: string,
    data: UpdateTranscriptInput,
  ): Promise<Transcript> {
    await this.getTranscriptForUser(userId, transcriptId);

    const updateData: Prisma.TranscriptUpdateInput = {};

    if (typeof data.title !== "undefined") {
      updateData.title = data.title;
    }

    if (typeof data.source !== "undefined") {
      updateData.source = data.source;
    }

    if (typeof data.language !== "undefined") {
      updateData.language = data.language;
    }

    if (typeof data.summary !== "undefined") {
      updateData.summary = data.summary;
    }

    if (typeof data.transcript !== "undefined") {
      updateData.transcript = data.transcript;
    }

    if (typeof data.recordedAt !== "undefined") {
      updateData.recordedAt = data.recordedAt ?? null;
    }

    if (typeof data.metadata !== "undefined") {
      updateData.metadata = data.metadata === null ? Prisma.JsonNull : data.metadata;
    }

    return prisma.transcript.update({
      where: { id: transcriptId },
      data: updateData,
    });
  }

  public async deleteTranscriptForUser(userId: string, transcriptId: string): Promise<void> {
    await this.getTranscriptForUser(userId, transcriptId);
    await prisma.transcript.delete({ where: { id: transcriptId } });
  }

  private async assertSessionBelongsToUser(userId: string, sessionId: string) {
    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId },
      select: { id: true },
    });

    if (!session) {
      throw { status: 404, message: "Session not found" };
    }
  }
}

export const transcriptCrudService = new TranscriptCrudService();
