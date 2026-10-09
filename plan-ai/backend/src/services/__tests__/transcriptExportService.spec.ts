import { describe, expect, it } from "vitest";
import {
  LAST_CUE_SECONDS,
  MAX_GAP_SECONDS,
  MAX_LINE_CHARS,
  TranscriptExportError,
  buildCues,
  buildTranscriptExport,
  exportFileName,
  formatSrtTime,
  formatVttTime,
  isExportFormat,
  orderUtterances,
  parseSpeakers,
  parseUtterances,
  speakerName,
  toSrt,
  toTxt,
  toVtt,
  utteranceEnd,
  wrapText,
  type ExportUtterance,
} from "../transcriptExportService";

const u = (over: Partial<ExportUtterance>): ExportUtterance => ({
  speaker: "User 0",
  text: "Hello",
  start: 0,
  channel: "mic",
  ...over,
});

describe("time formats", () => {
  it("writes SRT times with a comma", () => {
    expect(formatSrtTime(62.345)).toBe("00:01:02,345");
    expect(formatSrtTime(0)).toBe("00:00:00,000");
    expect(formatSrtTime(3661.5)).toBe("01:01:01,500");
  });

  it("writes VTT times with a dot", () => {
    expect(formatVttTime(62.345)).toBe("00:01:02.345");
    expect(formatVttTime(36000)).toBe("10:00:00.000");
  });

  it("carries a rounded millisecond into the next second", () => {
    expect(formatSrtTime(59.9996)).toBe("00:01:00,000");
    expect(formatSrtTime(-3)).toBe("00:00:00,000");
  });
});

describe("parseUtterances", () => {
  it("keeps rows with text and a start, and cleans the text", () => {
    expect(
      parseUtterances([
        { speaker: "User 0", transcript: "  Hello \n there ", start: 1.5, end: 3 },
        { speaker: "User 1", transcript: "", start: 4 },
        { speaker: "User 1", transcript: "No time" },
        null,
        "text",
        { speaker: "Others 1", transcript: "From the call", start: 5 },
        { speaker: "Speaker 2", transcript: "Tagged", start: 6, channel: "sys" },
      ]),
    ).toEqual([
      { speaker: "User 0", text: "Hello there", start: 1.5, end: 3, channel: "mic" },
      { speaker: "Others 1", text: "From the call", start: 5, channel: "sys" },
      { speaker: "Speaker 2", text: "Tagged", start: 6, channel: "sys" },
    ]);
  });

  it("gives nothing for a column that is not a list", () => {
    expect(parseUtterances(null)).toEqual([]);
    expect(parseUtterances({})).toEqual([]);
  });
});

describe("speaker names", () => {
  const speakers = parseSpeakers({
    speakers: [
      { label: "User 0", identifiedName: "Ana" },
      { label: "User 1", identifiedName: "  " },
      { label: "User 2", identifiedName: null },
      "broken",
    ],
  });

  it("uses the identified name for a diarized label", () => {
    expect(speakerName("User 0", speakers)).toBe("Ana");
  });

  it("keeps the label when nobody was identified", () => {
    expect(speakerName("User 1", speakers)).toBe("User 1");
    expect(speakerName("User 2", speakers)).toBe("User 2");
    expect(speakerName("User 9", speakers)).toBe("User 9");
  });

  it("reads metadata without speakers", () => {
    expect(parseSpeakers(null)).toEqual([]);
    expect(parseSpeakers({ speakers: "x" })).toEqual([]);
  });
});

describe("wrapText", () => {
  it("breaks at spaces and never passes the limit", () => {
    const lines = wrapText("one two three four five six seven eight nine ten eleven twelve", 20);
    expect(lines.join(" ")).toBe("one two three four five six seven eight nine ten eleven twelve");
    expect(lines.every((line) => line.length <= 20)).toBe(true);
  });

  it("keeps a word longer than the limit on a line of its own", () => {
    expect(wrapText("a supercalifragilistic b", 10)).toEqual(["a", "supercalifragilistic", "b"]);
  });
});

describe("utteranceEnd", () => {
  it("uses the utterance's own end", () => {
    expect(utteranceEnd([u({ start: 1, end: 2.5 }), u({ start: 10 })], 0)).toBe(2.5);
  });

  it("uses the next start when the end is missing", () => {
    expect(utteranceEnd([u({ start: 1 }), u({ start: 4 })], 0)).toBe(4);
  });

  it("stops 8 s after the start when the next one is far", () => {
    expect(utteranceEnd([u({ start: 1 }), u({ start: 60 })], 0)).toBe(1 + MAX_GAP_SECONDS);
  });

  it("gives the last one 4 s", () => {
    expect(utteranceEnd([u({ start: 1 }), u({ start: 20 })], 1)).toBe(20 + LAST_CUE_SECONDS);
  });

  it("skips a next utterance that starts at the same time", () => {
    const list = [u({ start: 5 }), u({ start: 5, channel: "sys" }), u({ start: 7 })];
    expect(utteranceEnd(list, 0)).toBe(7);
  });

  it("ignores an end that is not after the start", () => {
    expect(utteranceEnd([u({ start: 5, end: 5 }), u({ start: 6 })], 0)).toBe(6);
  });
});

describe("orderUtterances", () => {
  it("sorts by start and keeps the order of equal starts", () => {
    const ordered = orderUtterances([
      u({ text: "c", start: 9 }),
      u({ text: "a", start: 2 }),
      u({ text: "b1", start: 5 }),
      u({ text: "b2", start: 5 }),
    ]);
    expect(ordered.map((x) => x.text)).toEqual(["a", "b1", "b2", "c"]);
  });

  it("moves system audio by the offset, never below zero", () => {
    const ordered = orderUtterances(
      [
        u({ text: "mic", start: 3 }),
        u({ text: "sys", start: 1, end: 2, channel: "sys" }),
        u({ text: "early", start: 0, channel: "sys" }),
      ],
      2.5,
    );
    expect(ordered).toEqual([
      u({ text: "early", start: 2.5, channel: "sys" }),
      u({ text: "mic", start: 3 }),
      u({ text: "sys", start: 3.5, end: 4.5, channel: "sys" }),
    ]);
    expect(orderUtterances([u({ start: 1, channel: "sys" })], -5)[0].start).toBe(0);
  });
});

describe("buildCues", () => {
  it("puts the speaker name on the cue", () => {
    const cues = buildCues([u({ text: "Good morning", start: 1, end: 3 })], {
      speakers: [{ label: "User 0", identifiedName: "Ana" }],
    });
    expect(cues).toEqual([{ start: 1, end: 3, lines: ["Ana: Good morning"] }]);
  });

  it("leaves out the name when the utterance has no speaker", () => {
    expect(buildCues([u({ speaker: "", text: "Hi", start: 0, end: 1 })])[0].lines).toEqual(["Hi"]);
  });

  it("splits a long utterance into cues of two lines that share its time", () => {
    const text = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const cues = buildCues([u({ text, start: 10, end: 40 })]);

    expect(cues.length).toBeGreaterThan(2);
    for (const cue of cues) {
      expect(cue.lines.length).toBeLessThanOrEqual(2);
      for (const line of cue.lines) expect(line.length).toBeLessThanOrEqual(MAX_LINE_CHARS);
    }
    // The name is on the first cue only.
    expect(cues[0].lines[0].startsWith("User 0: ")).toBe(true);
    expect(cues.slice(1).some((cue) => cue.lines.join(" ").includes("User 0:"))).toBe(false);
    // No word is lost.
    expect(cues.flatMap((cue) => cue.lines).join(" ")).toBe(`User 0: ${text}`);
    // The cues follow each other and cover the whole utterance.
    expect(cues[0].start).toBe(10);
    expect(cues[cues.length - 1].end).toBe(40);
    for (let i = 1; i < cues.length; i++) expect(cues[i].start).toBeCloseTo(cues[i - 1].end, 9);
  });

  it("gives longer cues more time", () => {
    const first = "a".repeat(40);
    const second = "b".repeat(40);
    const cues = buildCues([u({ speaker: "", text: `${first} ${second} cc`, start: 0, end: 10 })]);
    expect(cues).toHaveLength(2);
    expect(cues[0].lines).toEqual([first, second]);
    expect(cues[1].lines).toEqual(["cc"]);
    expect(cues[0].end).toBeCloseTo((10 * 81) / 83, 9);
  });

  it("orders by start and fills in missing ends", () => {
    const cues = buildCues([
      u({ text: "third", start: 30 }),
      u({ text: "first", start: 1 }),
      u({ text: "second", start: 3 }),
    ]);
    expect(cues.map((cue) => [cue.start, cue.end, cue.lines[0]])).toEqual([
      [1, 3, "User 0: first"],
      [3, 11, "User 0: second"],
      [30, 34, "User 0: third"],
    ]);
  });

  it("keeps overlapping utterances from the two channels as overlapping cues", () => {
    const cues = buildCues([
      u({ speaker: "User 0", text: "I think that", start: 10, end: 14 }),
      u({ speaker: "Others 0", text: "Sorry, go on", start: 12, end: 13, channel: "sys" }),
      u({ speaker: "User 0", text: "we should wait", start: 14.5, end: 16 }),
    ]);
    expect(cues.map((cue) => [cue.start, cue.end])).toEqual([
      [10, 14],
      [12, 13],
      [14.5, 16],
    ]);
    expect(cues[1].lines).toEqual(["Others 0: Sorry, go on"]);
  });

  it("puts both channels on one clock before ordering", () => {
    const cues = buildCues(
      [
        u({ text: "mic", start: 5, end: 6 }),
        u({ speaker: "Others 0", text: "sys", start: 4, end: 5, channel: "sys" }),
      ],
      { sysOffsetSeconds: 3 },
    );
    expect(cues.map((cue) => [cue.start, cue.lines[0]])).toEqual([
      [5, "User 0: mic"],
      [7, "Others 0: sys"],
    ]);
  });
});

describe("toSrt", () => {
  it("numbers the cues from 1 and separates them with a blank line", () => {
    const srt = toSrt([
      { start: 1, end: 2.5, lines: ["Ana: Hello"] },
      { start: 62.345, end: 64, lines: ["Joan: Line one", "line two"] },
    ]);
    expect(srt).toBe(
      "1\n00:00:01,000 --> 00:00:02,500\nAna: Hello\n\n" +
        "2\n00:01:02,345 --> 00:01:04,000\nJoan: Line one\nline two\n",
    );
  });

  it("does not let the text contain the time separator", () => {
    expect(toSrt([{ start: 0, end: 1, lines: ["a --> b"] }])).toContain("a -> b");
  });
});

describe("toVtt", () => {
  it("starts with the WEBVTT header and uses dots", () => {
    const vtt = toVtt([{ start: 62.345, end: 64, lines: ["Ana: Hello"] }]);
    expect(vtt).toBe("WEBVTT\n\n00:01:02.345 --> 00:01:04.000\nAna: Hello\n");
  });

  it("escapes what WebVTT reads as markup", () => {
    expect(toVtt([{ start: 0, end: 1, lines: ["a < b & c > d"] }])).toContain(
      "a &lt; b &amp; c &gt; d",
    );
  });

  it("is only the header for no cues", () => {
    expect(toVtt([])).toBe("WEBVTT\n\n");
  });
});

describe("toTxt", () => {
  it("writes one line per utterance with its time and speaker", () => {
    expect(
      toTxt([u({ text: "Second", start: 65 }), u({ text: "First", start: 2 })], {
        speakers: [{ label: "User 0", identifiedName: "Ana" }],
      }),
    ).toBe("[00:00:02] Ana: First\n\n[00:01:05] Ana: Second\n");
  });
});

describe("exportFileName", () => {
  it("builds a safe name from the title", () => {
    expect(exportFileName("Q3 Review: Ana & Joan", "srt")).toBe("q3-review-ana-joan.srt");
    expect(exportFileName("Reunión de diseño", "vtt")).toBe("reunion-de-diseno.vtt");
    expect(exportFileName('a"b\r\nc/../d', "txt")).toBe("a-b-c-d.txt");
  });

  it("falls back when the title gives nothing", () => {
    expect(exportFileName(null, "txt")).toBe("meeting.txt");
    expect(exportFileName("!!!", "srt")).toBe("meeting.srt");
  });
});

describe("isExportFormat", () => {
  it("accepts the three formats only", () => {
    expect(["srt", "vtt", "txt"].every(isExportFormat)).toBe(true);
    expect(isExportFormat("pdf")).toBe(false);
    expect(isExportFormat(undefined)).toBe(false);
  });
});

describe("buildTranscriptExport", () => {
  const timed = {
    title: "Weekly sync",
    transcript: "User 0: Hello",
    utterances: [
      { speaker: "Others 0", transcript: "Hi Ana", start: 0, end: 1 },
      { speaker: "User 0", transcript: "Hello", start: 1, end: 2 },
    ],
    metadata: { speakers: [{ label: "User 0", identifiedName: "Ana" }], micSysOffsetMs: 1500 },
  };

  it("builds an SRT file with names and the channel offset", () => {
    const file = buildTranscriptExport(timed, "srt");
    expect(file.fileName).toBe("weekly-sync.srt");
    expect(file.mimeType).toContain("application/x-subrip");
    expect(file.content).toBe(
      "1\n00:00:01,000 --> 00:00:02,000\nAna: Hello\n\n" +
        "2\n00:00:01,500 --> 00:00:02,500\nOthers 0: Hi Ana\n",
    );
  });

  it("builds a VTT file", () => {
    const file = buildTranscriptExport(timed, "vtt");
    expect(file.mimeType).toContain("text/vtt");
    expect(file.content.startsWith("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n")).toBe(true);
  });

  it("builds text from the utterances", () => {
    expect(buildTranscriptExport(timed, "txt").content).toBe(
      "[00:00:01] Ana: Hello\n\n[00:00:01] Others 0: Hi Ana\n",
    );
  });

  const flat = { title: "Notes", transcript: " Just text. ", utterances: null, metadata: null };

  it("refuses subtitles for a meeting with flat text only", () => {
    for (const format of ["srt", "vtt"] as const) {
      try {
        buildTranscriptExport(flat, format);
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(TranscriptExportError);
        expect((err as TranscriptExportError).status).toBe(409);
      }
    }
  });

  it("returns the flat text for txt", () => {
    expect(buildTranscriptExport(flat, "txt")).toEqual({
      fileName: "notes.txt",
      mimeType: "text/plain; charset=utf-8",
      content: "Just text.\n",
    });
  });

  it("refuses a meeting with no transcript at all", () => {
    expect(() =>
      buildTranscriptExport(
        { title: null, transcript: null, utterances: [], metadata: null },
        "txt",
      ),
    ).toThrow(TranscriptExportError);
  });
});
