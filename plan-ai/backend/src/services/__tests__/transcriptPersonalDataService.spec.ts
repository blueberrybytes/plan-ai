/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: { transcript: { findFirst: vi.fn() } } as any }));
vi.mock("../../prisma/prismaClient", () => ({ default: mocks.db }));

import { getTranscriptPersonalData } from "../transcriptPersonalDataService";

beforeEach(() => mocks.db.transcript.findFirst.mockReset());

describe("getTranscriptPersonalData", () => {
  it("answers 404 for a transcript of another workspace", async () => {
    mocks.db.transcript.findFirst.mockResolvedValue(null);
    await expect(getTranscriptPersonalData("w1", "t1")).rejects.toMatchObject({ status: 404 });
    expect(mocks.db.transcript.findFirst.mock.calls[0][0].where).toEqual({
      id: "t1",
      workspaceId: "w1",
    });
  });

  it("counts and hides what it finds, one line per utterance", async () => {
    mocks.db.transcript.findFirst.mockResolvedValue({
      summary: "Ana dará su correo, ana@x.com, a compras.",
      transcript: null,
      utterances: [
        { speaker: "User 0", transcript: "Mi teléfono es el 612 345 678." },
        { speaker: "Speaker 1", transcript: "Perfecto, lo apunto." },
        { speaker: "User 0", transcript: "Y el correo ana@x.com, DNI 12345678Z." },
      ],
    });
    const out = await getTranscriptPersonalData("w1", "t1");
    expect(out.counts).toEqual({ EMAIL: 2, PHONE: 1, IBAN: 0, CARD: 0, NATIONAL_ID: 1 });
    expect(out.total).toBe(4);
    expect(out.summary).toBe("Ana dará su correo, [email], a compras.");
    expect(out.lines).toEqual([
      "Mi teléfono es el [phone].",
      "Perfecto, lo apunto.",
      "Y el correo [email], DNI [id number].",
    ]);
  });

  it("keeps speaker labels and blank lines of a flat transcript", async () => {
    mocks.db.transcript.findFirst.mockResolvedValue({
      summary: null,
      utterances: null,
      transcript: "User: llámame al +34 612 345 678\n\nOthers: vale",
    });
    const out = await getTranscriptPersonalData("w1", "t1");
    expect(out.lines).toEqual(["User: llámame al [phone]", "", "Others: vale"]);
    expect(out.summary).toBeNull();
    expect(out.total).toBe(1);
  });

  it("reports zero when the meeting has none", async () => {
    mocks.db.transcript.findFirst.mockResolvedValue({
      summary: "Revisión del sprint.",
      transcript: null,
      utterances: [{ transcript: "Quedan tres tareas." }],
    });
    const out = await getTranscriptPersonalData("w1", "t1");
    expect(out.total).toBe(0);
    expect(out.lines).toEqual(["Quedan tres tareas."]);
  });
});
