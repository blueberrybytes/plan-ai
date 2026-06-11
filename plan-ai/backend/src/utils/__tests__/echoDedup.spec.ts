import { describe, it, expect } from "vitest";
import { EchoDeduper, tokenize, dropEchoUtterances, wordsFromDeepgram } from "../echoDedup";

describe("tokenize", () => {
  it("lowercases, strips punctuation and diacritics", () => {
    expect(tokenize("¡Hóla, Mundo! It's working.")).toEqual([
      "hola",
      "mundo",
      "it",
      "s",
      "working",
    ]);
  });
});

describe("EchoDeduper", () => {
  const T0 = 1_000_000;

  it("drops a mic segment that exactly repeats recent sys text (classic echo)", () => {
    const d = new EchoDeduper();
    d.noteSystemText("we should migrate the auth service to the new gateway", T0);
    expect(d.isMicEcho("we should migrate the auth service to the new gateway", T0 + 400)).toBe(
      true,
    );
  });

  it("drops echo even when the ASR transcribed it slightly differently", () => {
    const d = new EchoDeduper();
    d.noteSystemText("we should migrate the auth service to the new gateway", T0);
    // muffled echo: one word misheard, punctuation differs
    expect(d.isMicEcho("we should migrate the auth servers to the new gateway", T0 + 700)).toBe(
      true,
    );
  });

  it("keeps genuine user speech said while others talk", () => {
    const d = new EchoDeduper();
    d.noteSystemText("the deployment pipeline failed again last night", T0);
    expect(d.isMicEcho("I think we need to fix the staging environment first", T0 + 500)).toBe(
      false,
    );
  });

  it("never drops short interjections (ok / yes / right)", () => {
    const d = new EchoDeduper();
    d.noteSystemText("ok yes right exactly", T0);
    expect(d.isMicEcho("ok", T0 + 200)).toBe(false);
    expect(d.isMicEcho("yes right", T0 + 200)).toBe(false);
  });

  it("forgets sys text outside the look-back window", () => {
    const d = new EchoDeduper(5000);
    d.noteSystemText("we should migrate the auth service to the new gateway", T0);
    expect(d.isMicEcho("we should migrate the auth service to the new gateway", T0 + 6000)).toBe(
      false,
    );
  });

  it("matches echo spanning two sys segments", () => {
    const d = new EchoDeduper();
    d.noteSystemText("we should migrate the auth service", T0);
    d.noteSystemText("to the new gateway before friday", T0 + 800);
    expect(d.isMicEcho("the auth service to the new gateway", T0 + 1200)).toBe(true);
  });

  it("does not let one sys word cover a mic segment that repeats it", () => {
    const d = new EchoDeduper();
    d.noteSystemText("gateway", T0);
    expect(d.isMicEcho("gateway gateway gateway gateway", T0 + 300)).toBe(false);
  });

  it("does nothing when sys is silent (headphones case)", () => {
    const d = new EchoDeduper();
    expect(d.isMicEcho("we should migrate the auth service to the new gateway", T0)).toBe(false);
  });
});

describe("dropEchoUtterances (prerecorded/reprocess path)", () => {
  const u = (transcript: string, start: number, end: number) => ({ transcript, start, end });

  it("drops a mic utterance overlapping a sys utterance with the same text", () => {
    const kept = dropEchoUtterances(
      [u("we should migrate the auth service", 10.4, 13.2)],
      [u("we should migrate the auth service", 10.1, 12.9)],
    );
    expect(kept).toHaveLength(0);
  });

  it("tolerates mic lag behind the sys playback", () => {
    const kept = dropEchoUtterances(
      [u("we should migrate the auth service", 12.5, 15.0)], // starts 2.4s after sys
      [u("we should migrate the auth service", 10.1, 12.0)],
    );
    expect(kept).toHaveLength(0);
  });

  it("keeps the same text said much later (user genuinely repeating)", () => {
    const kept = dropEchoUtterances(
      [u("we should migrate the auth service", 45.0, 48.0)],
      [u("we should migrate the auth service", 10.1, 12.9)],
    );
    expect(kept).toHaveLength(1);
  });

  it("keeps genuine double-talk (different words, overlapping time)", () => {
    const kept = dropEchoUtterances(
      [u("I disagree we should fix staging first", 10.5, 13.0)],
      [u("we should migrate the auth service", 10.1, 12.9)],
    );
    expect(kept).toHaveLength(1);
  });

  it("keeps short interjections even when they overlap", () => {
    const kept = dropEchoUtterances([u("ok yes", 10.5, 11.0)], [u("ok yes", 10.4, 10.9)]);
    expect(kept).toHaveLength(1);
  });

  it("keeps everything when there is no sys audio (headphones)", () => {
    const kept = dropEchoUtterances([u("we should migrate the auth service", 10.4, 13.2)], []);
    expect(kept).toHaveLength(1);
  });
});

describe("direction guard — the user's own voice coming back through sys (far-end echo)", () => {
  const T0 = 2_000_000;

  it("LIVE: does NOT drop the user's speech when their words appear on sys AFTER they started speaking", () => {
    const d = new EchoDeduper();
    // User starts speaking at T0; their far-end echo shows up on sys at T0+500.
    d.noteSystemText("let's ship the billing fix tomorrow morning", T0 + 500);
    // The mic segment STARTED at T0 (before the sys copy) → must be kept.
    expect(d.isMicEcho("let's ship the billing fix tomorrow morning", T0)).toBe(false);
  });

  it("LIVE: still drops true speaker bleed (sys started first)", () => {
    const d = new EchoDeduper();
    d.noteSystemText("let's ship the billing fix tomorrow morning", T0);
    // Mic copy starts a beat later (acoustic path) → echo, drop.
    expect(d.isMicEcho("let's ship the billing fix tomorrow morning", T0 + 150)).toBe(true);
  });

  it("BATCH: keeps the user's utterance when the sys copy starts later", () => {
    const kept = dropEchoUtterances(
      [{ transcript: "let's ship the billing fix tomorrow", start: 10.0, end: 13.0 }],
      [{ transcript: "let's ship the billing fix tomorrow", start: 10.6, end: 13.6 }],
    );
    expect(kept).toHaveLength(1);
  });
});

describe("word-level matching (per-word Deepgram timestamps)", () => {
  const T0 = 3_000_000;
  const w = (token: string, startMs: number) => ({ token, startMs });

  it("LOG REGRESSION: drops startup bleed even when the sys stream started ~2s late", () => {
    // Real case from the field: the sys binary spins up ~2s after the mic, so
    // sys missed the first word ("capacidades") and its UTTERANCE start looked
    // 1.9s later than the mic's — the old utterance-level direction guard kept
    // the bleed. Word times align (same physical audio), so word-level drops it.
    const d = new EchoDeduper();
    const times = [600, 1100, 1300, 1500, 1900, 2300, 2500, 2800, 3000];
    const sysTokens = ["trayendonos", "y", "lo", "podemos", "decir", "sin", "margen", "de", "duda"];
    d.noteSystemWords(sysTokens.map((t, i) => w(t, T0 + times[i])));

    const micWords = [
      w("capacidades", T0), // mic-only: sys hadn't started capturing yet
      ...sysTokens.map((t, i) => w(t, T0 + times[i] + 40)), // acoustic path ≈ +40ms
    ];
    const verdict = d.evaluateMicWords(micWords);
    expect(verdict.isEcho).toBe(true); // 9/10 = 90% ≥ 80%
    expect(verdict.matchedTokens).toBe(9);
  });

  it("keeps the user's speech when their far-end copy returns on sys ~400ms later per word", () => {
    const d = new EchoDeduper();
    const tokens = ["vale", "ahora", "estoy", "hablando", "deberia", "funcionar"];
    const micWords = tokens.map((t, i) => w(t, T0 + i * 300));
    // Far-end echo: every word shows up on sys 400ms after the user said it.
    d.noteSystemWords(tokens.map((t, i) => w(t, T0 + i * 300 + 400)));
    expect(d.evaluateMicWords(micWords).isEcho).toBe(false);
  });

  it("drops true bleed where each sys word slightly precedes its mic copy", () => {
    const d = new EchoDeduper();
    const tokens = ["el", "modelo", "mas", "potente", "jamas", "entrenado"];
    d.noteSystemWords(tokens.map((t, i) => w(t, T0 + i * 280)));
    const micWords = tokens.map((t, i) => w(t, T0 + i * 280 + 60));
    expect(d.evaluateMicWords(micWords).isEcho).toBe(true);
  });
});

describe("wordsFromDeepgram", () => {
  it("converts words using punctuated_word, splitting multi-token values", () => {
    const out = wordsFromDeepgram(
      [
        { word: "hola", punctuated_word: "¡Hola,", start: 1.0 },
        { word: "que-tal", start: 2.5 },
        { word: "skipped" }, // no start → skipped
      ],
      10_000,
    );
    expect(out).toEqual([
      { token: "hola", startMs: 11_000, ref: 0 },
      { token: "que", startMs: 12_500, ref: 1 },
      { token: "tal", startMs: 12_500, ref: 1 },
    ]);
  });
});

describe("subtractEcho (word-level double-talk handling)", () => {
  const w = (token: string, startMs: number) => ({ token, startMs });
  // Deepgram word at `startSeconds` from a stream whose epoch we pass as 0.
  const dg = (punctuated_word: string, startSeconds: number) => ({
    punctuated_word,
    start: startSeconds,
  });

  it("keeps the user's unique word spoken OVER the other person (double-talk)", () => {
    const d = new EchoDeduper();
    const tokens = ["we", "should", "migrate", "the", "auth", "service"];
    d.noteSystemWords(tokens.map((t, i) => w(t, 1000 + i * 300)));

    // Mic caught the bleed (acoustic path ≈ +40ms) AND the user's own "Exactly."
    const micWords = [
      ...tokens.map((t, i) => dg(t, (1000 + i * 300 + 40) / 1000)),
      dg("Exactly.", 2.8),
    ];
    const res = d.subtractEcho(micWords, 0, "we should migrate the auth service Exactly.", 0);

    expect(res.verdict.isEcho).toBe(true); // 6/7 ≈ 86%
    expect(res.removedWords).toBe(6);
    expect(res.keptText).toBe("Exactly.");
  });

  it("drops nothing — keeps verbatim — when the segment is mostly genuine speech", () => {
    const d = new EchoDeduper();
    d.noteSystemWords(
      ["the", "deployment", "pipeline", "failed"].map((t, i) => w(t, 1000 + i * 300)),
    );
    const transcript = "I think we need to fix the staging environment";
    const micWords = transcript.split(" ").map((word, i) => dg(word, 1.0 + i * 0.3));
    const res = d.subtractEcho(micWords, 0, transcript, 0);

    expect(res.verdict.isEcho).toBe(false); // only "the" overlaps → well below threshold
    expect(res.removedWords).toBe(0);
    expect(res.keptText).toBe(transcript);
  });

  it("returns empty text when the whole segment is echo", () => {
    const d = new EchoDeduper();
    const tokens = ["we", "should", "migrate", "the", "auth", "service"];
    d.noteSystemWords(tokens.map((t, i) => w(t, 1000 + i * 300)));
    const micWords = tokens.map((t, i) => dg(t, (1000 + i * 300 + 40) / 1000));
    const res = d.subtractEcho(micWords, 0, "we should migrate the auth service", 0);

    expect(res.keptText).toBe("");
    expect(res.removedWords).toBe(6);
  });

  it("does NOT subtract the user's own far-end echo (sys copy arrives later)", () => {
    const d = new EchoDeduper();
    const tokens = ["lets", "ship", "the", "billing", "fix", "today"];
    // The user's words come back on sys ~400ms LATER per word (far-end echo).
    d.noteSystemWords(tokens.map((t, i) => w(t, 1000 + i * 300 + 400)));
    const micWords = tokens.map((t, i) => dg(t, (1000 + i * 300) / 1000));
    const res = d.subtractEcho(micWords, 0, "lets ship the billing fix today", 0);

    expect(res.verdict.isEcho).toBe(false);
    expect(res.keptText).toBe("lets ship the billing fix today");
  });

  it("falls back to whole-segment drop when per-word timings are missing", () => {
    const d = new EchoDeduper();
    d.noteSystemText("we should migrate the auth service to the new gateway", 1_000_000);
    const res = d.subtractEcho(
      [],
      0,
      "we should migrate the auth service to the new gateway",
      1_000_400,
    );
    expect(res.keptText).toBe("");
  });
});
