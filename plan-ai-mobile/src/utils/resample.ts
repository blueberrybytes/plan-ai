/**
 * Streaming 24 kHz to 16 kHz resampler for 16-bit PCM.
 *
 * The saved recording goes to speech-to-text, which works at 16 kHz anyway
 * (Deepgram and Whisper both resample to it), so keeping 24 kHz on disk only
 * cost space and upload data: 173 MB per hour instead of 115.
 *
 * Every output sample sits 1.5 input samples after the previous one, so only
 * two filter phases exist: on an input sample and halfway between two. Each
 * phase is a windowed-sinc low-pass at 7.2 kHz (below the 8 kHz limit of the
 * 16 kHz output), which keeps higher sounds from folding back as noise.
 * State carries across chunks, so consecutive chunks come out as one stream.
 */

const TAPS = 32;
const HALF = TAPS / 2;
const CUTOFF = 7200 / 24000; // cycles per input sample
const STEP = 1.5; // input samples per output sample

function makeKernel(frac: number): Float32Array {
  const k = new Float32Array(TAPS);
  let sum = 0;
  for (let i = 0; i < TAPS; i++) {
    // Distance from the output instant to input sample i of the window.
    const u = frac + HALF - 1 - i;
    const x = 2 * CUTOFF * u;
    const sinc = u === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
    // Blackman window over [-HALF, HALF].
    const n = (u + HALF) / TAPS;
    const w = 0.42 - 0.5 * Math.cos(2 * Math.PI * n) + 0.08 * Math.cos(4 * Math.PI * n);
    k[i] = 2 * CUTOFF * sinc * w;
    sum += k[i];
  }
  // Unity gain at DC.
  for (let i = 0; i < TAPS; i++) k[i] /= sum;
  return k;
}

const KERNEL_ON_SAMPLE = makeKernel(0);
const KERNEL_HALFWAY = makeKernel(0.5);

export class Resampler24To16 {
  // Input not fully used yet, with HALF samples of silence in front so the
  // first outputs have left context.
  private buf: Float32Array = new Float32Array(HALF);
  // Position in `buf` of the next output sample.
  private pos = HALF;

  process(input: Int16Array): Int16Array {
    const merged = new Float32Array(this.buf.length + input.length);
    merged.set(this.buf, 0);
    for (let i = 0; i < input.length; i++) merged[this.buf.length + i] = input[i];

    const out: number[] = [];
    while (this.pos + HALF < merged.length) {
      const i0 = Math.floor(this.pos);
      const kernel = this.pos - i0 === 0 ? KERNEL_ON_SAMPLE : KERNEL_HALFWAY;
      const first = i0 - HALF + 1;
      let acc = 0;
      for (let k = 0; k < TAPS; k++) acc += merged[first + k] * kernel[k];
      out.push(acc > 32767 ? 32767 : acc < -32768 ? -32768 : Math.round(acc));
      this.pos += STEP;
    }

    // Keep what the next outputs still need.
    const drop = Math.max(0, Math.floor(this.pos) - TAPS);
    this.buf = merged.slice(drop);
    this.pos -= drop;
    return Int16Array.from(out);
  }
}
