/**
 * Web Worker that runs the offline echo canceller off the UI thread.
 *
 * Receives the raw, pre-codec mic + sys PCM (Int16, buffered during the
 * recording at the 24 kHz context rate) and returns the cleaned mic (Int16, at
 * 16 kHz) plus a self-check verdict the main thread uses to decide whether to
 * trust it. We downsample to 16 kHz here: speech lives below 8 kHz, so it's
 * loss-free for ASR and halves the working set (a 1-hour meeting stays well
 * under the worker heap limit). Heavy FFT work would freeze the renderer if run
 * inline, hence the worker.
 */
import { cancelEcho, alignReference, selfCheckAec } from "./echoCancel";
import { encodeMp3BytesFromInt16 } from "../utils/mp3";
import { encodeWavBytesFromInt16 } from "../utils/wav";

interface AecRequest {
  mic: ArrayBuffer; // Int16 PCM at `sampleRate`
  sys: ArrayBuffer; // Int16 PCM at `sampleRate`
  sampleRate: number;
}

interface AecResponse {
  ok: boolean;
  /** Encoded cleaned-mic audio ready to upload (only when ok). */
  audio?: ArrayBuffer;
  mime?: string;
  sampleRate: number; // rate of the cleaned PCM (the processing rate)
  delaySamples?: number;
  erleDb?: number;
  nearKept?: number;
  echoReduction?: number;
  error?: string;
}

const ctx = self as unknown as Worker;
const TARGET_RATE = 16000;

/** Linear-resample Int16 PCM to Float32 at a new rate (downsample for speech). */
function resampleInt16ToFloat32(input: Int16Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) {
    const o = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) o[i] = input[i] / 0x8000;
    return o;
  }
  const ratio = fromRate / toRate;
  const outLen = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const a = i0 < input.length ? input[i0] : 0;
    const b = i0 + 1 < input.length ? input[i0 + 1] : a;
    out[i] = (a + (b - a) * frac) / 0x8000;
  }
  return out;
}

function floatToInt16(x: Float32Array): Int16Array {
  const o = new Int16Array(x.length);
  for (let i = 0; i < x.length; i++) {
    let s = x[i];
    if (s > 1) s = 1;
    else if (s < -1) s = -1;
    o[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return o;
}

ctx.onmessage = (e: MessageEvent<AecRequest>) => {
  const { mic, sys, sampleRate } = e.data;
  try {
    const micF = resampleInt16ToFloat32(new Int16Array(mic), sampleRate, TARGET_RATE);
    const sysF = resampleInt16ToFloat32(new Int16Array(sys), sampleRate, TARGET_RATE);
    if (micF.length === 0 || sysF.length === 0) {
      ctx.postMessage({ ok: false, sampleRate: TARGET_RATE, error: "empty pcm" } as AecResponse);
      return;
    }

    const { output, delaySamples, erleDb } = cancelEcho(micF, sysF, { sampleRate: TARGET_RATE });
    const refAligned = alignReference(sysF, delaySamples, micF.length);
    const chk = selfCheckAec(micF, output, refAligned, TARGET_RATE);

    let audio: ArrayBuffer | undefined;
    let mime: string | undefined;
    if (chk.ok) {
      const cleaned = floatToInt16(output);
      // Compress here (off the UI thread). MP3 keeps the upload small; WAV is the
      // fallback if the encoder ever fails (still a valid, transcribable upload).
      try {
        audio = encodeMp3BytesFromInt16(cleaned, TARGET_RATE);
        mime = "audio/mpeg";
      } catch {
        audio = encodeWavBytesFromInt16(cleaned, TARGET_RATE);
        mime = "audio/wav";
      }
    }

    const resp: AecResponse = {
      ok: chk.ok && !!audio,
      audio,
      mime,
      sampleRate: TARGET_RATE,
      delaySamples,
      erleDb,
      nearKept: chk.nearKept,
      echoReduction: chk.echoReduction,
    };
    ctx.postMessage(resp, audio ? [audio] : []);
  } catch (err) {
    ctx.postMessage({
      ok: false,
      sampleRate: TARGET_RATE,
      error: err instanceof Error ? err.message : String(err),
    } as AecResponse);
  }
};
