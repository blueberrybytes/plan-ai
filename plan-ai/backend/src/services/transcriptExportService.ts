/**
 * A meeting's transcript as a subtitle file (SRT or WebVTT) or as plain text.
 *
 * Everything here is pure: it takes the stored utterances and returns text.
 * The controller reads the meeting and sends the file.
 */

export type TranscriptExportFormat = "srt" | "vtt" | "txt";

export const EXPORT_FORMATS: readonly TranscriptExportFormat[] = ["srt", "vtt", "txt"];

export const EXPORT_MIME_TYPES: Record<TranscriptExportFormat, string> = {
  srt: "application/x-subrip; charset=utf-8",
  vtt: "text/vtt; charset=utf-8",
  txt: "text/plain; charset=utf-8",
};

/** Two lines of 42 characters is the usual limit for a subtitle on screen. */
export const MAX_LINE_CHARS = 42;
export const MAX_CUE_LINES = 2;
/** Without an end time, a sentence stays up until the next one, at most this long. */
export const MAX_GAP_SECONDS = 8;
/** The last sentence has no next one to stop at. */
export const LAST_CUE_SECONDS = 4;

export interface ExportUtterance {
  speaker: string;
  text: string;
  start: number;
  end?: number;
  channel: "mic" | "sys";
}

export interface SpeakerInfo {
  label: string;
  identifiedName?: string | null;
}

export interface Cue {
  start: number;
  end: number;
  /** One or two lines. */
  lines: string[];
}

export class TranscriptExportError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function isExportFormat(value: unknown): value is TranscriptExportFormat {
  return typeof value === "string" && (EXPORT_FORMATS as readonly string[]).includes(value);
}

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * The stored `utterances` column as clean rows. Rows without text or without
 * a start time are left out. The channel follows the same rule as the web
 * player: the row's own `channel`, otherwise "Others ..." speakers are the
 * meeting's system audio.
 */
export function parseUtterances(raw: unknown): ExportUtterance[] {
  if (!Array.isArray(raw)) return [];
  const rows: ExportUtterance[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const u = item as Record<string, unknown>;
    const text = typeof u.transcript === "string" ? u.transcript.replace(/\s+/g, " ").trim() : "";
    if (!text || !finite(u.start)) continue;
    const speaker = typeof u.speaker === "string" && u.speaker.trim() ? u.speaker.trim() : "";
    const channel =
      u.channel === "mic" || u.channel === "sys"
        ? u.channel
        : speaker.startsWith("Others")
          ? "sys"
          : "mic";
    rows.push({
      speaker,
      text,
      start: Math.max(0, u.start),
      ...(finite(u.end) ? { end: u.end } : {}),
      channel,
    });
  }
  return rows;
}

/** `metadata.speakers` as a list, whatever the column holds. */
export function parseSpeakers(metadata: unknown): SpeakerInfo[] {
  const speakers = (metadata as { speakers?: unknown } | null | undefined)?.speakers;
  if (!Array.isArray(speakers)) return [];
  return speakers.filter(
    (s): s is SpeakerInfo =>
      !!s && typeof s === "object" && typeof (s as SpeakerInfo).label === "string",
  );
}

/**
 * The name to print for a diarized label ("Speaker 1"). Same lookup as the
 * web transcript: the name the AI identified for that label, otherwise the
 * label itself.
 */
export function speakerName(label: string, speakers: SpeakerInfo[]): string {
  const info = speakers.find((s) => s.label === label);
  return info?.identifiedName?.trim() || label;
}

/** Breaks text into lines of at most `max` characters, at spaces. */
export function wrapText(text: string, max = MAX_LINE_CHARS): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ").filter(Boolean)) {
    if (!line) line = word;
    else if (line.length + 1 + word.length <= max) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export interface BuildCuesOptions {
  speakers?: SpeakerInfo[];
  /**
   * How much later the microphone file runs than the system audio file.
   * System audio sentences are moved by this much so both channels share the
   * player's clock.
   */
  sysOffsetSeconds?: number;
}

/** Utterances on one clock, sorted by start. Equal starts keep their order. */
export function orderUtterances(
  utterances: ExportUtterance[],
  sysOffsetSeconds = 0,
): ExportUtterance[] {
  return utterances
    .map((u) => {
      if (u.channel !== "sys" || !sysOffsetSeconds) return u;
      return {
        ...u,
        start: Math.max(0, u.start + sysOffsetSeconds),
        ...(u.end !== undefined ? { end: Math.max(0, u.end + sysOffsetSeconds) } : {}),
      };
    })
    .map((u, index) => ({ u, index }))
    .sort((a, b) => a.u.start - b.u.start || a.index - b.index)
    .map(({ u }) => u);
}

/**
 * When a sentence ends. Its own end when it has one. Otherwise the start of
 * the next sentence that begins later, at most 8 s after it started. The last
 * one gets 4 s.
 */
export function utteranceEnd(utterances: ExportUtterance[], index: number): number {
  const current = utterances[index];
  if (current.end !== undefined && current.end > current.start) return current.end;
  const next = utterances.slice(index + 1).find((u) => u.start > current.start);
  if (!next) return current.start + LAST_CUE_SECONDS;
  return Math.min(next.start, current.start + MAX_GAP_SECONDS);
}

/**
 * Subtitle cues for the whole meeting. A long sentence becomes several cues
 * of two lines that share its time in proportion to their length. The first
 * cue of each sentence starts with the speaker's name.
 */
export function buildCues(utterances: ExportUtterance[], options: BuildCuesOptions = {}): Cue[] {
  const ordered = orderUtterances(utterances, options.sysOffsetSeconds);
  const speakers = options.speakers ?? [];
  const cues: Cue[] = [];

  ordered.forEach((utterance, index) => {
    const name = utterance.speaker ? speakerName(utterance.speaker, speakers) : "";
    const lines = wrapText(name ? `${name}: ${utterance.text}` : utterance.text);
    const groups: string[][] = [];
    for (let i = 0; i < lines.length; i += MAX_CUE_LINES) {
      groups.push(lines.slice(i, i + MAX_CUE_LINES));
    }

    const end = utteranceEnd(ordered, index);
    const span = end - utterance.start;
    const sizes = groups.map((group) => group.join(" ").length);
    const total = sizes.reduce((sum, size) => sum + size, 0) || 1;
    let used = 0;
    groups.forEach((group, i) => {
      const cueStart = utterance.start + (span * used) / total;
      used += sizes[i];
      const cueEnd = i === groups.length - 1 ? end : utterance.start + (span * used) / total;
      cues.push({ start: cueStart, end: cueEnd, lines: group });
    });
  });
  return cues;
}

function clockParts(seconds: number) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  return {
    hh: pad(Math.floor(ms / 3_600_000)),
    mm: pad(Math.floor((ms % 3_600_000) / 60_000)),
    ss: pad(Math.floor((ms % 60_000) / 1000)),
    mmm: pad(ms % 1000, 3),
  };
}

/** 62.345 becomes "00:01:02,345". */
export function formatSrtTime(seconds: number): string {
  const { hh, mm, ss, mmm } = clockParts(seconds);
  return `${hh}:${mm}:${ss},${mmm}`;
}

/** 62.345 becomes "00:01:02.345". */
export function formatVttTime(seconds: number): string {
  const { hh, mm, ss, mmm } = clockParts(seconds);
  return `${hh}:${mm}:${ss}.${mmm}`;
}

// The time separator must not appear inside a cue's text in either format.
const SEPARATOR = "-->";
const safeLine = (line: string): string => line.split(SEPARATOR).join("->");

export function toSrt(cues: Cue[]): string {
  return cues
    .map(
      (cue, i) =>
        `${i + 1}\n${formatSrtTime(cue.start)} ${SEPARATOR} ${formatSrtTime(cue.end)}\n${cue.lines
          .map(safeLine)
          .join("\n")}\n`,
    )
    .join("\n");
}

// WebVTT reads these three as markup.
const escapeVtt = (line: string): string =>
  safeLine(line).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function toVtt(cues: Cue[]): string {
  const body = cues
    .map(
      (cue) =>
        `${formatVttTime(cue.start)} ${SEPARATOR} ${formatVttTime(cue.end)}\n${cue.lines
          .map(escapeVtt)
          .join("\n")}\n`,
    )
    .join("\n");
  return `WEBVTT\n\n${body}`;
}

/** One line per sentence: "[00:01:02] Name: text". */
export function toTxt(utterances: ExportUtterance[], options: BuildCuesOptions = {}): string {
  const speakers = options.speakers ?? [];
  return orderUtterances(utterances, options.sysOffsetSeconds)
    .map((u) => {
      const { hh, mm, ss } = clockParts(u.start);
      const name = u.speaker ? `${speakerName(u.speaker, speakers)}: ` : "";
      return `[${hh}:${mm}:${ss}] ${name}${u.text}`;
    })
    .join("\n\n")
    .concat("\n");
}

/** "Q3 Review: Ana & Joan" becomes "q3-review-ana-joan.srt". */
export function exportFileName(
  title: string | null | undefined,
  format: TranscriptExportFormat,
): string {
  const slug = (title ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return `${slug || "meeting"}.${format}`;
}

export interface ExportSource {
  title: string | null;
  transcript: string | null;
  utterances: unknown;
  metadata: unknown;
}

export interface TranscriptExportFile {
  fileName: string;
  mimeType: string;
  content: string;
}

/**
 * The file for one meeting. Subtitles need the timed utterances: a meeting
 * that only has flat text gives 409 for srt and vtt, and its text for txt.
 */
export function buildTranscriptExport(
  source: ExportSource,
  format: TranscriptExportFormat,
): TranscriptExportFile {
  const utterances = parseUtterances(source.utterances);
  const offsetMs = (source.metadata as { micSysOffsetMs?: unknown } | null | undefined)
    ?.micSysOffsetMs;
  const options: BuildCuesOptions = {
    speakers: parseSpeakers(source.metadata),
    sysOffsetSeconds: finite(offsetMs) ? offsetMs / 1000 : 0,
  };
  const file = (content: string): TranscriptExportFile => ({
    fileName: exportFileName(source.title, format),
    mimeType: EXPORT_MIME_TYPES[format],
    content,
  });

  if (utterances.length === 0) {
    const flat = source.transcript?.trim();
    if (!flat) throw new TranscriptExportError(409, "This meeting has no transcript to export.");
    if (format !== "txt") {
      throw new TranscriptExportError(
        409,
        "This meeting has no timed transcript, so it cannot be exported as subtitles. Export it as text instead.",
      );
    }
    return file(`${flat}\n`);
  }
  if (format === "txt") return file(toTxt(utterances, options));
  const cues = buildCues(utterances, options);
  return file(format === "srt" ? toSrt(cues) : toVtt(cues));
}
