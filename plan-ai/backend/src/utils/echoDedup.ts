/**
 * Cross-channel echo dedup for the recorder.
 *
 * Problem: when the user listens through SPEAKERS (no headphones), the meeting
 * audio physically re-enters their microphone. The mic Deepgram channel then
 * transcribes the OTHER participants' words, which get labeled as the user's
 * ("User: …") — duplicating what the system channel already produced
 * ("Others: …").
 *
 * Matching is done at the WORD level using Deepgram's per-word timestamps,
 * because real-world logs showed utterance-level comparison is fragile:
 * the sys capture starts ~2s after the mic (native binary spin-up), and the
 * two channels segment continuous speech at different boundaries, so utterance
 * starts don't correspond across channels. Word times do: both channels hear
 * the same physical audio in real time, so a bleed word carries ~the same
 * wall-clock time on both channels.
 *
 * Direction guard (per word): a sys word can only "cover" a mic word if it
 * occurred no later than `leadMs` (150ms) after it. True bleed: sys ≈
 * simultaneous (digital capture) → matches. The user's own voice coming BACK
 * through sys (far-end echo via a remote participant's speakers / platform
 * echo) arrives ≥~300ms later → never matches → the user's speech is never
 * dropped. Sys words may be up to `earlierMs` (2s) older than the mic word to
 * absorb clock anchoring error — earlier is always safe (only bleed looks
 * earlier).
 *
 * Conservative by design:
 *  - mic segments shorter than MIN_TOKENS words are never dropped,
 *  - ≥ `threshold` (default 0.8) of the mic words must match (bag-of-words
 *    with time windows: echoed audio is muffled, the ASR may transcribe a
 *    word or two differently).
 */

const DEFAULT_WINDOW_MS = 10000;
const DEFAULT_THRESHOLD = 0.8;
// Backstop posture: loudspeaker bleed is now removed at CAPTURE by the browser's
// AEC (echoCancellation, ON by default in the recorder), which is the PRIMARY
// defense. (The old in-recorder worklet echo gate was removed; AEC replaced it.)
// This server-side word matcher is the residual backstop for LOUD bleed AEC
// leaves behind (cheap/loud speakers, double-talk) and for AEC-off / legacy /
// uploaded captures AEC never touched. Coverage differs by path: the BATCH /
// reprocess path (dropEchoUtterances + estimateMicSysOffsetMs) is offset-aware
// and corrects the mic↔sys clock skew; the LIVE path (EchoDeduper.subtractEcho)
// only matches near-simultaneous bleed within fixed 2s/150ms windows, so late-
// arriving sys twins (macOS sys spin-up ~2s) are caught by the recorder's
// client-side grace queue, not here. Raising the minimum-token floor keeps short
// user utterances (backchannels, brief replies) from ever being dropped, since
// those are where the time-based matcher is most prone to a false positive
// against the user's own speech.
const MIN_TOKENS = 4;
/** A sys word may occur at most this much AFTER the mic word and still match. */
const DEFAULT_LEAD_MS = 150;
/** A sys word may occur at most this much BEFORE the mic word (clock slop). */
const DEFAULT_EARLIER_MS = 2000;

/** Lowercase, strip punctuation/diacritics, split into word tokens. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // diacritics
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // punctuation → space
    .split(/\s+/)
    .filter(Boolean);
}

export interface TimedWord {
  token: string;
  /** When this word's AUDIO occurred, ms on a clock shared by both channels. */
  startMs: number;
  /**
   * Index of the source Deepgram word this token came from. Lets word-level
   * subtraction map token matches back to whole words (one word may tokenize
   * into several tokens, e.g. "que-tal").
   */
  ref?: number;
}

/** Deepgram live/prerecorded word shape (only the fields we use). */
export interface DeepgramWordLike {
  word?: string;
  punctuated_word?: string;
  /** Seconds from the start of that stream's audio. */
  start?: number;
}

/**
 * Convert Deepgram words to TimedWords on the shared wall clock.
 * `epochMs` = wall-clock of that stream's audio t=0.
 */
export function wordsFromDeepgram(
  words: DeepgramWordLike[] | undefined,
  epochMs: number,
): TimedWord[] {
  if (!words) return [];
  const out: TimedWord[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const raw = w.punctuated_word ?? w.word ?? "";
    const start = typeof w.start === "number" ? w.start : null;
    if (start === null) continue;
    for (const token of tokenize(raw)) {
      out.push({ token, startMs: epochMs + start * 1000, ref: i });
    }
  }
  return out;
}

/** Fallback when no per-word timings exist: every token at the segment start. */
export function wordsFromText(text: string, startMs: number): TimedWord[] {
  return tokenize(text).map((token) => ({ token, startMs }));
}

export interface MicEchoVerdict {
  isEcho: boolean;
  reason: "below-min-tokens" | "no-sys-words" | "coverage";
  coverage: number;
  micTokenCount: number;
  matchedTokens: number;
  /** Sys words currently inside the look-back window. */
  sysWordsInWindow: number;
  /**
   * Per-token match flags, parallel to the evaluated `micWords`. A `true` means
   * that token was found in the recent sys audio (i.e. it is echo). Used by
   * `subtractEcho` to strip only the echoed words.
   */
  matched: boolean[];
}

export interface EchoSubtractionResult {
  /** Text to emit with echoed words removed. Empty string ⇒ drop entirely. */
  keptText: string;
  /** Segment-level verdict (coverage, counts) — handy for diagnostics/logging. */
  verdict: MicEchoVerdict;
  /** How many Deepgram words were stripped as echo. */
  removedWords: number;
  /** Total Deepgram words considered. */
  totalWords: number;
}

export class EchoDeduper {
  /** token → sorted-ish list of occurrence times (ms). */
  private sysWordTimes = new Map<string, number[]>();
  /** Dedup keys so repeated interims don't multiply the same word. */
  private seen = new Set<string>();
  private latestSysMs = 0;

  constructor(
    private readonly windowMs: number = DEFAULT_WINDOW_MS,
    private readonly threshold: number = DEFAULT_THRESHOLD,
    private readonly leadMs: number = DEFAULT_LEAD_MS,
    private readonly earlierMs: number = DEFAULT_EARLIER_MS,
  ) {}

  /**
   * Record words heard on the system (others) channel. Safe to call with
   * interim results: repeats of the same word at the same audio time are
   * deduped (Deepgram keeps word timings stable across interim updates).
   */
  noteSystemWords(words: TimedWord[]): void {
    for (const w of words) {
      // Round to 100ms so floating jitter across interims doesn't defeat dedup.
      const key = `${w.token}@${Math.round(w.startMs / 100)}`;
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      const list = this.sysWordTimes.get(w.token);
      if (list) list.push(w.startMs);
      else this.sysWordTimes.set(w.token, [w.startMs]);
      if (w.startMs > this.latestSysMs) this.latestSysMs = w.startMs;
    }
    this.prune();
  }

  /**
   * Decide whether a mic segment is speaker bleed. Each mic word matches an
   * unused sys word with the same token occurring in
   * [micStart - earlierMs, micStart + leadMs].
   */
  evaluateMicWords(micWords: TimedWord[]): MicEchoVerdict {
    const micTokenCount = micWords.length;
    let sysWordsInWindow = 0;
    for (const list of this.sysWordTimes.values()) sysWordsInWindow += list.length;

    if (micTokenCount < MIN_TOKENS) {
      return {
        isEcho: false,
        reason: "below-min-tokens",
        coverage: 0,
        micTokenCount,
        matchedTokens: 0,
        sysWordsInWindow,
        matched: new Array(micTokenCount).fill(false),
      };
    }
    if (sysWordsInWindow === 0) {
      return {
        isEcho: false,
        reason: "no-sys-words",
        coverage: 0,
        micTokenCount,
        matchedTokens: 0,
        sysWordsInWindow,
        matched: new Array(micTokenCount).fill(false),
      };
    }

    // Greedy time-windowed matching; consume each sys occurrence once.
    const used = new Map<string, Set<number>>(); // token → consumed indices
    const matched = new Array(micTokenCount).fill(false);
    let matchedCount = 0;
    for (let m = 0; m < micWords.length; m++) {
      const mw = micWords[m];
      const times = this.sysWordTimes.get(mw.token);
      if (!times) continue;
      const consumed = used.get(mw.token) ?? new Set<number>();
      let best = -1;
      let bestDist = Infinity;
      for (let i = 0; i < times.length; i++) {
        if (consumed.has(i)) continue;
        const delta = times[i] - mw.startMs; // >0 → sys later than mic
        if (delta > this.leadMs || delta < -this.earlierMs) continue;
        const dist = Math.abs(delta);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      }
      if (best >= 0) {
        consumed.add(best);
        used.set(mw.token, consumed);
        matched[m] = true;
        matchedCount++;
      }
    }

    const coverage = matchedCount / micTokenCount;
    return {
      isEcho: coverage >= this.threshold,
      reason: "coverage",
      coverage,
      micTokenCount,
      matchedTokens: matchedCount,
      sysWordsInWindow,
      matched,
    };
  }

  /**
   * Word-level echo subtraction for the LIVE mic channel.
   *
   * The old behaviour was all-or-nothing: if a mic segment was ≥ `threshold`
   * echo, the WHOLE segment was dropped — which deleted the user's own words
   * when they spoke OVER the other person (double-talk), because their few
   * unique words rode along inside a segment dominated by bleed.
   *
   * Instead, when a segment is predominantly echo we remove ONLY the individual
   * Deepgram words that matched recent sys audio and keep the rest. The user's
   * unique words don't match anything on the sys channel, so they survive. The
   * per-word direction guard (inherited from `evaluateMicWords`) still protects
   * the user's own far-end echo from being treated as bleed.
   *
   * Segments BELOW threshold are kept verbatim — we never pepper-strip genuine
   * speech just because it shares a few common words ("the", "to", …) with the
   * sys channel.
   *
   * Falls back to the whole-segment decision when per-word timings are missing
   * (rare on live Deepgram), since there's nothing to rebuild from.
   */
  subtractEcho(
    dgWords: DeepgramWordLike[],
    epochMs: number,
    transcript: string,
    fallbackStartMs: number,
  ): EchoSubtractionResult {
    const hasWordTimes = dgWords.some((w) => typeof w.start === "number");

    if (!hasWordTimes) {
      const verdict = this.evaluateMicWords(wordsFromText(transcript, fallbackStartMs));
      return {
        keptText: verdict.isEcho ? "" : transcript,
        verdict,
        removedWords: verdict.isEcho ? dgWords.length : 0,
        totalWords: dgWords.length,
      };
    }

    const timed = wordsFromDeepgram(dgWords, epochMs);
    const verdict = this.evaluateMicWords(timed);

    // Predominantly genuine speech → keep the whole thing untouched.
    if (!verdict.isEcho) {
      return { keptText: transcript, verdict, removedWords: 0, totalWords: dgWords.length };
    }

    // A Deepgram word is echo iff it produced ≥1 token and ALL of its tokens
    // matched recent sys audio. Aggregate the token-level match flags by `ref`.
    const perWord = new Map<number, { total: number; matched: number }>();
    timed.forEach((tw, i) => {
      if (tw.ref === undefined) return;
      const agg = perWord.get(tw.ref) ?? { total: 0, matched: 0 };
      agg.total++;
      if (verdict.matched[i]) agg.matched++;
      perWord.set(tw.ref, agg);
    });

    const kept: string[] = [];
    let removedWords = 0;
    dgWords.forEach((w, i) => {
      const agg = perWord.get(i);
      const isEchoWord = agg !== undefined && agg.total > 0 && agg.matched === agg.total;
      if (isEchoWord) {
        removedWords++;
        return;
      }
      const text = w.punctuated_word ?? w.word ?? "";
      if (text) kept.push(text);
    });

    return {
      keptText: kept.join(" ").trim(),
      verdict,
      removedWords,
      totalWords: dgWords.length,
    };
  }

  // ── Text-level conveniences (fallback when per-word timings are missing) ──

  noteSystemText(text: string, startMs: number): void {
    this.noteSystemWords(wordsFromText(text, startMs));
  }

  isMicEcho(text: string, micStartMs: number): boolean {
    return this.evaluateMicWords(wordsFromText(text, micStartMs)).isEcho;
  }

  private prune(): void {
    const cutoff = this.latestSysMs - this.windowMs;
    for (const [token, times] of this.sysWordTimes) {
      const kept = times.filter((t) => t >= cutoff);
      if (kept.length === 0) this.sysWordTimes.delete(token);
      else if (kept.length !== times.length) this.sysWordTimes.set(token, kept);
    }
    // `seen` only grows during a session; cap it to avoid unbounded memory on
    // very long meetings (keys are tiny, but be tidy).
    if (this.seen.size > 50_000) this.seen.clear();
  }
}

// ─── Batch variant for prerecorded/diarized audio (reprocess + uploads) ──────

export interface TimedSegment {
  transcript: string;
  /** Seconds from the start of the recording. */
  start: number;
  end: number;
  /** Optional per-word timings (preferred when available). */
  words?: DeepgramWordLike[];
}

/**
 * Estimate how much LATER (ms) the mic file's clock runs vs the sys file's, by
 * content-matching utterances and taking the median start-time delta of the
 * confident matches.
 *
 * Why: the two stored files DON'T share a timeline. On macOS the sys native
 * binary spins up ~2s after the mic, and the two independent captures drift
 * over a long meeting — so a fixed timing window misses the real echo pairs
 * (prod: a 40-min speakerphone meeting came back fully duplicated). Aligning by
 * the measured median offset re-centres the window so a modest tolerance covers
 * the whole recording.
 *
 * Returns null when there aren't enough confident matches (e.g. genuinely
 * different content on the two channels) — callers then skip alignment.
 */
export function estimateMicSysOffsetMs(
  micUtterances: TimedSegment[],
  sysUtterances: TimedSegment[],
): number | null {
  const sysTok = sysUtterances
    .map((s) => ({ start: s.start, toks: new Set(tokenize(s.transcript)) }))
    .filter((s) => s.toks.size >= 4);
  if (sysTok.length === 0) return null;

  const deltas: number[] = [];
  for (const mic of micUtterances) {
    const mtoks = new Set(tokenize(mic.transcript));
    if (mtoks.size < 4) continue;
    let bestOverlap = 0;
    let bestStart = 0;
    for (const s of sysTok) {
      let inter = 0;
      mtoks.forEach((t) => {
        if (s.toks.has(t)) inter += 1;
      });
      const overlap = inter / Math.min(mtoks.size, s.toks.size);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestStart = s.start;
      }
    }
    // High-overlap match → this mic utterance is (almost certainly) a copy of a
    // sys utterance; record how much later the mic version starts.
    if (bestOverlap >= 0.6) deltas.push((mic.start - bestStart) * 1000);
  }

  if (deltas.length < 3) return null;
  deltas.sort((a, b) => a - b);
  return deltas[Math.floor(deltas.length / 2)]; // median is robust to outliers/drift
}

/**
 * Batch echo dedup for diarized utterances (the reprocess/upload path, where we
 * re-transcribe the stored mic + sys audio separately and merge by time).
 *
 * Two-stage: (1) estimate the global mic↔sys clock offset from content matches
 * and shift the sys timeline onto the mic's, then (2) run the word-level matcher
 * with a symmetric tolerance window. When the offset can't be estimated
 * confidently it falls back to the legacy asymmetric window (no shift).
 *
 * Returns the mic utterances to KEEP (non-echo).
 */
export function dropEchoUtterances<T extends TimedSegment>(
  micUtterances: T[],
  sysUtterances: TimedSegment[],
  opts: {
    threshold?: number;
    leadSeconds?: number;
    earlierSeconds?: number;
    toleranceSeconds?: number;
    /** Pre-computed offset (ms mic is later than sys); estimated if omitted. */
    offsetMs?: number | null;
    /**
     * Per-mic-utterance diagnostic hook. Lets the caller see WHY a segment was
     * kept — e.g. a cluster of survivors at coverage 0.5–0.8 means the two
     * channels' ASR diverged (muffled bleed transcribed differently), which the
     * exact-token matcher can't catch. Used to decide the safe next step with
     * data instead of speculatively lowering the threshold.
     */
    onSegment?: (info: { dropped: boolean; coverage: number; micTokenCount: number }) => void;
  } = {},
): T[] {
  if (sysUtterances.length === 0) return micUtterances;
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;

  const offsetMs =
    opts.offsetMs !== undefined
      ? opts.offsetMs
      : estimateMicSysOffsetMs(micUtterances, sysUtterances);
  const aligned = offsetMs !== null;
  const sysEpoch = aligned ? offsetMs : 0;

  // Aligned → symmetric tolerance absorbs residual jitter + slow drift around
  // the measured offset. Not aligned → legacy asymmetric window (sys may start
  // seconds earlier; earlier is always safe).
  const tolMs = (opts.toleranceSeconds ?? 2.0) * 1000;
  const leadMs = aligned ? tolMs : (opts.leadSeconds ?? 0.3) * 1000;
  const earlierMs = aligned ? tolMs : (opts.earlierSeconds ?? 3.0) * 1000;

  const deduper = new EchoDeduper(Number.POSITIVE_INFINITY, threshold, leadMs, earlierMs);
  for (const sys of sysUtterances) {
    const words = sys.words?.length
      ? wordsFromDeepgram(sys.words, sysEpoch)
      : wordsFromText(sys.transcript, sys.start * 1000 + sysEpoch);
    deduper.noteSystemWords(words);
  }

  return micUtterances.filter((mic) => {
    const words = mic.words?.length
      ? wordsFromDeepgram(mic.words, 0)
      : wordsFromText(mic.transcript, mic.start * 1000);
    const verdict = deduper.evaluateMicWords(words);
    opts.onSegment?.({
      dropped: verdict.isEcho,
      coverage: verdict.coverage,
      micTokenCount: verdict.micTokenCount,
    });
    return !verdict.isEcho;
  });
}
