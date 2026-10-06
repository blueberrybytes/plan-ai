/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db: any = {
    transcript: { findFirst: vi.fn() },
    transcriptTranslation: { findUnique: vi.fn(), upsert: vi.fn() },
  };
  return { db, logUsage: vi.fn().mockResolvedValue(undefined) };
});
vi.mock("../../prisma/prismaClient", () => ({ default: mocks.db }));
vi.mock("../aiUsageService", () => ({ aiUsageService: { logUsage: mocks.logUsage } }));

import {
  hashSource,
  sourceLines,
  toBatches,
  translateTranscript,
  type BatchTranslateFn,
  type TextTranslateFn,
} from "../transcriptTranslationService";

const usage = { inputTokens: 100, outputTokens: 50 };
const upper: BatchTranslateFn = async (texts) => ({
  texts: texts.map((t) => t.toUpperCase()),
  usage,
});
const upperText: TextTranslateFn = async (text) => ({ text: text.toUpperCase(), usage });

const base = { workspaceId: "w1", userId: "u1", transcriptId: "t1", language: "en" };

describe("sourceLines", () => {
  it("takes one line per utterance when there are utterances", () => {
    const lines = sourceLines({
      utterances: [{ speaker: "User 0", transcript: "Bon dia" }, { transcript: "Hola" }, {}],
      transcript: "ignored",
    });
    expect(lines).toEqual([
      { prefix: "", text: "Bon dia" },
      { prefix: "", text: "Hola" },
      { prefix: "", text: "" },
    ]);
  });

  it("splits a flat transcript and keeps the speaker label out of the text", () => {
    const lines = sourceLines({
      utterances: null,
      transcript: "User: Bon dia a tothom\nOthers: Hola\n\nUna línia sense etiqueta",
    });
    expect(lines).toEqual([
      { prefix: "User: ", text: "Bon dia a tothom" },
      { prefix: "Others: ", text: "Hola" },
      { prefix: "", text: "" },
      { prefix: "", text: "Una línia sense etiqueta" },
    ]);
  });
});

describe("toBatches", () => {
  it("skips lines without words and caps a batch at 40 lines", () => {
    const lines = Array.from({ length: 85 }, (_, i) => ({
      prefix: "",
      text: i === 3 ? "..." : `frase ${i}`,
    }));
    const batches = toBatches(lines);
    expect(batches.map((b) => b.indexes.length)).toEqual([40, 40, 4]);
    expect(batches.flatMap((b) => b.indexes)).not.toContain(3);
  });

  it("starts a new batch when the text gets long", () => {
    const long = "paraula ".repeat(500);
    const batches = toBatches([
      { prefix: "", text: long },
      { prefix: "", text: long },
      { prefix: "", text: "curta" },
    ]);
    expect(batches.map((b) => b.indexes)).toEqual([[0], [1, 2]]);
  });
});

describe("translateTranscript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.transcriptTranslation.findUnique.mockResolvedValue(null);
    mocks.db.transcriptTranslation.upsert.mockResolvedValue({});
  });

  it("refuses a language that is not on offer", async () => {
    await expect(translateTranscript({ ...base, language: "klingon" })).rejects.toMatchObject({
      status: 400,
    });
    expect(mocks.db.transcript.findFirst).not.toHaveBeenCalled();
  });

  it("answers 404 for a transcript of another workspace", async () => {
    mocks.db.transcript.findFirst.mockResolvedValue(null);
    await expect(translateTranscript(base)).rejects.toMatchObject({ status: 404 });
    expect(mocks.db.transcript.findFirst.mock.calls[0][0].where).toEqual({
      id: "t1",
      workspaceId: "w1",
    });
  });

  it("translates the lines and the summary, stores them and logs the usage once", async () => {
    mocks.db.transcript.findFirst.mockResolvedValue({
      id: "t1",
      projectId: "p1",
      summary: "resum",
      transcript: "User: bon dia\n\nOthers: hola",
      utterances: null,
    });
    const result = await translateTranscript({
      ...base,
      translateBatch: upper,
      translateText: upperText,
    });
    expect(result).toEqual({
      language: "en",
      summary: "RESUM",
      lines: ["User: BON DIA", "", "Others: HOLA"],
      cached: false,
    });
    expect(mocks.db.transcriptTranslation.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.logUsage).toHaveBeenCalledTimes(1);
    expect(mocks.logUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "TRANSCRIPT_TRANSLATION",
        projectId: "p1",
        inputTokens: 200,
        outputTokens: 100,
      }),
    );
  });

  it("keeps the original text of a line the model skipped", async () => {
    mocks.db.transcript.findFirst.mockResolvedValue({
      id: "t1",
      projectId: null,
      summary: null,
      transcript: null,
      utterances: [{ transcript: "uno" }, { transcript: "dos" }],
    });
    const skipSecond: BatchTranslateFn = async (texts) => ({
      texts: texts.map((t, i) => (i === 1 ? undefined : t.toUpperCase())),
      usage,
    });
    const result = await translateTranscript({ ...base, translateBatch: skipSecond });
    expect(result.lines).toEqual(["UNO", "dos"]);
  });

  it("returns the stored copy without calling the model when the text is the same", async () => {
    const transcript = {
      id: "t1",
      projectId: null,
      summary: "resum",
      transcript: null,
      utterances: [{ transcript: "uno" }],
    };
    mocks.db.transcript.findFirst.mockResolvedValue(transcript);
    mocks.db.transcriptTranslation.findUnique.mockResolvedValue({
      sourceHash: hashSource(sourceLines(transcript), "resum"),
      summary: "summary",
      lines: ["one"],
    });
    const translateBatch = vi.fn(upper);
    const result = await translateTranscript({ ...base, translateBatch, translateText: upperText });
    expect(result).toEqual({ language: "en", summary: "summary", lines: ["one"], cached: true });
    expect(translateBatch).not.toHaveBeenCalled();
    expect(mocks.logUsage).not.toHaveBeenCalled();
  });

  it("translates again when the transcript changed since the stored copy", async () => {
    mocks.db.transcript.findFirst.mockResolvedValue({
      id: "t1",
      projectId: null,
      summary: null,
      transcript: null,
      utterances: [{ transcript: "uno nuevo" }],
    });
    mocks.db.transcriptTranslation.findUnique.mockResolvedValue({
      sourceHash: "old",
      summary: null,
      lines: ["one"],
    });
    const result = await translateTranscript({ ...base, translateBatch: upper });
    expect(result).toMatchObject({ lines: ["UNO NUEVO"], cached: false });
  });

  it("logs the usage of the batches that ran when a later one fails, and stores nothing", async () => {
    mocks.db.transcript.findFirst.mockResolvedValue({
      id: "t1",
      projectId: null,
      summary: null,
      transcript: null,
      utterances: Array.from({ length: 50 }, (_, i) => ({ transcript: `frase ${i}` })),
    });
    let call = 0;
    const failSecond: BatchTranslateFn = async (texts) => {
      if (++call === 2) throw new Error("boom");
      return { texts, usage };
    };
    await expect(translateTranscript({ ...base, translateBatch: failSecond })).rejects.toThrow(
      "boom",
    );
    expect(mocks.logUsage).toHaveBeenCalledWith(expect.objectContaining({ inputTokens: 100 }));
    expect(mocks.db.transcriptTranslation.upsert).not.toHaveBeenCalled();
  });
});
