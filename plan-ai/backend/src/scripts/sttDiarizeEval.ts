/**
 * Measures Whisper speaker separation against human annotations.
 *
 *   yarn stt:diarize-eval --dir <folder> [--thresholds 0.4,0.5,0.6] [--language en]
 *                         [--transcribe-only]
 *
 * The folder holds meetings as `<name>.wav` with a ground-truth `<name>.rttm`
 * (who spoke when). The AMI Meeting Corpus provides both under CC BY 4.0:
 * audio from groups.inf.ed.ac.uk/ami, RTTMs from
 * github.com/pyannote/AMI-diarization-setup.
 *
 * Runs the same code as the post-meeting pass: Whisper transcription (cached
 * next to the audio as `<name>.whisper.json`, so trying thresholds doesn't
 * re-transcribe), then the voice service's /diarize. Per meeting and
 * threshold it prints:
 *
 *   one-speaker   accuracy with everything as one speaker, which is what the
 *                 Whisper provider did before separation existed
 *   separated     accuracy with the voice service's labels
 *   ceiling       best possible with one label per utterance; the rest is
 *                 speech from someone else inside the same utterance
 *
 * Accuracy is the share of annotated speech time attributed to the right
 * person, after matching predicted labels to real ones one to one.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { basename, join } from "path";
import { getWhisperConfig, getWhisperDiarizeConfig } from "../services/stt/sttConfig";
import { transcribeWithWhisper, type WhisperTranscription } from "../services/stt/whisperClient";
import { toChannelUtterances, type ChannelUtterance } from "../services/stt/whisperPrerecorded";
import { diarizeUtterances } from "../services/stt/whisperDiarization";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

interface Turn {
  speaker: string;
  start: number;
  end: number;
}

const readRttm = (path: string): Turn[] =>
  readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.startsWith("SPEAKER"))
    .map((l) => {
      const f = l.trim().split(/\s+/);
      const start = Number(f[3]);
      return { speaker: f[7], start, end: start + Number(f[4]) };
    });

const overlap = (a0: number, a1: number, b0: number, b1: number): number =>
  Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/** Best one-to-one assignment of predicted labels to real speakers (DP over subsets). */
const bestMatch = (confusion: number[][], truthCount: number): number => {
  const full = 1 << truthCount;
  let dp = new Array<number>(full).fill(-Infinity);
  dp[0] = 0;
  for (const row of confusion) {
    const next = [...dp];
    for (let mask = 0; mask < full; mask++) {
      if (dp[mask] === -Infinity) continue;
      for (let t = 0; t < truthCount; t++) {
        if (mask & (1 << t)) continue;
        const m = mask | (1 << t);
        next[m] = Math.max(next[m], dp[mask] + row[t]);
      }
    }
    dp = next;
  }
  return Math.max(...dp);
};

const score = (utterances: ChannelUtterance[], turns: Turn[]) => {
  const speakers = [...new Set(turns.map((t) => t.speaker))];
  const labels = [...new Set(utterances.map((u) => u.speaker))];
  const confusion = labels.map(() => new Array<number>(speakers.length).fill(0));
  const perSpeaker = new Array<number>(speakers.length).fill(0);
  let total = 0;
  let ceiling = 0;
  for (const u of utterances) {
    const byTruth = speakers.map((s) =>
      turns
        .filter((t) => t.speaker === s)
        .reduce((sum, t) => sum + overlap(u.start, u.end, t.start, t.end), 0),
    );
    const sum = byTruth.reduce((a, b) => a + b, 0);
    if (sum === 0) continue;
    total += sum;
    ceiling += Math.max(...byTruth);
    byTruth.forEach((v, i) => {
      confusion[labels.indexOf(u.speaker)][i] += v;
      perSpeaker[i] += v;
    });
  }
  return {
    truthSpeakers: speakers.length,
    predictedSpeakers: labels.length,
    oneSpeaker: Math.max(...perSpeaker) / total,
    separated: bestMatch(confusion, speakers.length) / total,
    ceiling: ceiling / total,
  };
};

const pct = (x: number) => `${(x * 100).toFixed(1)}%`.padStart(6);

const main = async (): Promise<void> => {
  const dir = arg("dir");
  if (!dir) {
    console.error(
      "usage: yarn stt:diarize-eval --dir <folder> [--thresholds 0.4,0.5] [--language en]",
    );
    process.exit(2);
  }
  const language = arg("language") ?? "multi";
  const thresholds = (arg("thresholds") ?? String(getWhisperDiarizeConfig().threshold))
    .split(",")
    .map(Number);
  const whisper = getWhisperConfig();
  const diarizeBase = { ...getWhisperDiarizeConfig(), enabled: true };
  if (!diarizeBase.voiceAiUrl) throw new Error("VOICE_AI_URL is not set");

  const meetings = readdirSync(dir)
    .filter((f) => f.endsWith(".wav") && existsSync(join(dir, f.replace(/\.wav$/, ".rttm"))))
    .map((f) => basename(f, ".wav"))
    .sort();
  console.log(`${meetings.length} meetings, thresholds ${thresholds.join(", ")}\n`);

  const rows: Array<{ meeting: string; threshold: number } & ReturnType<typeof score>> = [];
  for (const name of meetings) {
    const audio = readFileSync(join(dir, `${name}.wav`));
    const cache = join(dir, `${name}.whisper.json`);
    let transcription: WhisperTranscription;
    if (existsSync(cache)) {
      transcription = JSON.parse(readFileSync(cache, "utf8"));
    } else {
      const t0 = Date.now();
      transcription = await transcribeWithWhisper(
        audio,
        { model: whisper.model, language, filename: `${name}.wav`, mimeType: "audio/wav" },
        whisper,
      );
      writeFileSync(cache, JSON.stringify(transcription));
      console.log(
        `${name}: transcribed ${transcription.duration?.toFixed(0) ?? "?"} s of audio in ${((Date.now() - t0) / 1000).toFixed(0)} s`,
      );
    }
    // Transcribing is the slow part (minutes per meeting on CPU); doing it
    // once up front leaves the threshold runs fast.
    if (process.argv.includes("--transcribe-only")) continue;
    const utterances = toChannelUtterances(transcription);
    const turns = readRttm(join(dir, `${name}.rttm`));

    for (const threshold of thresholds) {
      const t0 = Date.now();
      const result = await diarizeUtterances(
        audio,
        { filename: `${name}.wav`, mimeType: "audio/wav" },
        utterances,
        { ...diarizeBase, threshold },
      );
      if (result.error) throw new Error(`${name}: ${result.error}`);
      const s = score(result.utterances, turns);
      rows.push({ meeting: name, threshold, ...s });
      console.log(
        `${name} t=${threshold}  ${utterances.length} utterances  speakers ${s.predictedSpeakers}/${s.truthSpeakers}  ` +
          `one-speaker ${pct(s.oneSpeaker)}  separated ${pct(s.separated)}  ceiling ${pct(s.ceiling)}  ` +
          `(${((Date.now() - t0) / 1000).toFixed(1)} s)`,
      );
    }
  }

  if (rows.length === 0) return;
  console.log("\nthreshold  right speaker count  one-speaker  separated  ceiling");
  for (const threshold of thresholds) {
    const r = rows.filter((x) => x.threshold === threshold);
    const avg = (k: "oneSpeaker" | "separated" | "ceiling") =>
      r.reduce((a, x) => a + x[k], 0) / r.length;
    const rightCount = r.filter((x) => x.predictedSpeakers === x.truthSpeakers).length;
    console.log(
      `${String(threshold).padEnd(9)}  ${`${rightCount}/${r.length}`.padEnd(19)}  ` +
        `${pct(avg("oneSpeaker"))}       ${pct(avg("separated"))}     ${pct(avg("ceiling"))}`,
    );
  }
};

main().catch((err) => {
  console.error("stt:diarize-eval failed:", err);
  process.exit(1);
});
