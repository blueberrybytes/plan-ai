/**
 * Reference-based acoustic echo cancellation for the recorder's reprocess path.
 *
 * Problem (see echoDedup.ts for the full story): when the user is on a
 * loudspeaker, the far side physically re-enters the microphone, so the stored
 * mic recording contains a delayed, room-coloured copy of the system audio. The
 * batch re-diarization in projectTranscriptService transcribes that raw mic blob
 * and the far side resurfaces as duplicated "User: …" lines — the very text the
 * downstream dedup can only partially catch, because the two channels' ASR
 * diverges.
 *
 * This module removes the bleed ACOUSTICALLY, before ASR, which is the only
 * robust fix. It is the EASY (known-reference) case of echo cancellation: the
 * recorder already stored the clean far-side signal separately (the sys blob),
 * so we have the exact reference. We:
 *   1. estimate the bulk mic↔sys delay by cross-correlating their short-time
 *      energy envelopes (robust to the macOS ~2-5s sys spin-up + drift, and to
 *      the two channels never sharing a timeline),
 *   2. run a constrained frequency-domain adaptive filter (overlap-save NLMS,
 *      the textbook AEC) with the aligned sys signal as the far-end reference,
 *      subtracting the modelled echo path from the mic.
 *
 * The user's own voice is statistically uncorrelated with the reference, so the
 * adaptive filter never learns it — only the echo path — and it survives. The
 * cleaned signal is fed to Deepgram for the mic channel ONLY; the stored blobs
 * are never altered (a misfire can therefore never erase the user's recording —
 * the failure that retired the in-recorder worklet gate). Whatever residual
 * bleed the linear filter leaves is still caught by the existing word/similarity
 * dedup, which we keep as a backstop.
 *
 * Pure DSP — no audio I/O or Node APIs here, so it is unit-testable against
 * synthetic echo. Decoding/encoding lives in the caller (ffmpeg).
 */

/** In-place iterative radix-2 Cooley-Tukey FFT. `len` (re.length) must be a power of two. */
export function fftInPlace(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  if (n <= 1) return;
  if ((n & (n - 1)) !== 0) throw new Error(`fft length ${n} is not a power of two`);

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curWr = 1;
      let curWi = 0;
      const half = len >> 1;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const xr = re[b] * curWr - im[b] * curWi;
        const xi = re[b] * curWi + im[b] * curWr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const nextWr = curWr * wr - curWi * wi;
        curWi = curWr * wi + curWi * wr;
        curWr = nextWr;
      }
    }
  }

  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

/** Smallest power of two >= n. */
export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * Short-time RMS energy envelope at `frame`-sample hops (one value per frame).
 * Used for delay estimation — robust to the two channels transcribing/encoding
 * differently because it compares ENERGY SHAPE, not waveform phase.
 */
export function energyEnvelope(signal: Float32Array, frame: number): Float64Array {
  const frames = Math.floor(signal.length / frame);
  const env = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const base = f * frame;
    for (let i = 0; i < frame; i++) {
      const s = signal[base + i];
      sum += s * s;
    }
    env[f] = Math.sqrt(sum / frame);
  }
  return env;
}

/**
 * Estimate how many samples the mic LAGS the reference (i.e. the echo of a
 * far-side sound appears in the mic this many samples after that sound sits in
 * the ref). Positive ⇒ ref is earlier than mic (the normal case). Computed by
 * cross-correlating the energy envelopes via FFT and picking the peak lag inside
 * a plausible window. Returns 0 when no clear correlation exists.
 */
export function estimateDelaySamples(
  mic: Float32Array,
  ref: Float32Array,
  sampleRate: number,
  opts: { maxLagSeconds?: number; minLagSeconds?: number; envHz?: number } = {},
): number {
  const envHz = opts.envHz ?? 100;
  const frame = Math.max(1, Math.round(sampleRate / envHz));
  const maxLagFrames = Math.round((opts.maxLagSeconds ?? 8) * envHz);
  const minLagFrames = Math.round((opts.minLagSeconds ?? -1) * envHz);

  const me = energyEnvelope(mic, frame);
  const re = energyEnvelope(ref, frame);
  if (me.length < 8 || re.length < 8) return 0;

  // Mean-remove so correlation reflects energy fluctuation, not DC offset.
  demean(me);
  demean(re);

  // Cross-correlation via FFT: corr[k] = Σ mic_env[n] * ref_env[n-k].
  const n = nextPow2(me.length + re.length);
  const aR = new Float64Array(n);
  const aI = new Float64Array(n);
  const bR = new Float64Array(n);
  const bI = new Float64Array(n);
  aR.set(me);
  bR.set(re);
  fftInPlace(aR, aI, false);
  fftInPlace(bR, bI, false);
  // A * conj(B)
  for (let i = 0; i < n; i++) {
    const r = aR[i] * bR[i] + aI[i] * bI[i];
    const im = aI[i] * bR[i] - aR[i] * bI[i];
    aR[i] = r;
    aI[i] = im;
  }
  fftInPlace(aR, aI, true);

  // corr at lag k lives at index k (k>=0) or n+k (k<0).
  let bestLag = 0;
  let bestVal = -Infinity;
  for (let k = minLagFrames; k <= maxLagFrames; k++) {
    const idx = k >= 0 ? k : n + k;
    if (idx < 0 || idx >= n) continue;
    const v = aR[idx];
    if (v > bestVal) {
      bestVal = v;
      bestLag = k;
    }
  }
  if (bestVal <= 0) return 0;
  return bestLag * frame;
}

function demean(x: Float64Array): void {
  let m = 0;
  for (let i = 0; i < x.length; i++) m += x[i];
  m /= x.length;
  for (let i = 0; i < x.length; i++) x[i] -= m;
}

/** Shift `ref` so its content lines up with the mic, given mic lags ref by `lag` samples. */
export function alignReference(ref: Float32Array, lag: number, length: number): Float32Array {
  const out = new Float32Array(length);
  if (lag >= 0) {
    // ref is earlier: delay it by `lag` (leading zeros).
    for (let i = 0; i < length; i++) {
      const src = i - lag;
      if (src >= 0 && src < ref.length) out[i] = ref[src];
    }
  } else {
    // ref is later: advance it.
    const adv = -lag;
    for (let i = 0; i < length; i++) {
      const src = i + adv;
      if (src >= 0 && src < ref.length) out[i] = ref[src];
    }
  }
  return out;
}

export interface EchoCancelOptions {
  sampleRate: number;
  /** Adaptive-filter block / hop size in samples (FFT size is 2×). Default 1024. */
  blockSize?: number;
  /** NLMS step size (0–2). Default 0.3 — low step + multiple passes converges
   * the echo path well with little near-end misadjustment. */
  mu?: number;
  /** Power-spectrum smoothing factor. Default 0.9. */
  lambda?: number;
  /** Offline adaptation passes over the signal before the output pass. Because
   * we have the whole recording, re-running the filter converges it far better
   * than a single online pass without raising `mu`. Default 3. */
  iterations?: number;
  /** Skip bulk delay alignment (caller already aligned). Default false. */
  preAligned?: boolean;
  /** Override the estimated bulk delay (samples mic lags ref). */
  delaySamples?: number;
  maxLagSeconds?: number;
}

export interface EchoCancelResult {
  /** Cleaned mic signal (near-end), same length as the input mic. */
  output: Float32Array;
  /** Bulk delay applied (samples mic lagged ref). */
  delaySamples: number;
  /** Mean echo-return-loss-enhancement in dB (mic energy ÷ output energy on echo-only regions, approx). Diagnostic. */
  erleDb: number;
}

/**
 * Constrained frequency-domain adaptive filter (overlap-save NLMS) — the
 * standard AEC structure. Models the echo path from `ref`→`mic` and subtracts
 * it, leaving the near-end (the user's own voice + residual).
 *
 * Output feeds ASR only and the raw blobs are untouched, so we favour removing
 * bleed over pristine residual: even partial suppression drops most echo below
 * the recogniser's threshold, and the text dedup mops up the rest.
 */
export function cancelEcho(
  mic: Float32Array,
  ref: Float32Array,
  options: EchoCancelOptions,
): EchoCancelResult {
  const N = options.blockSize ?? 1024;
  const M = 2 * N;
  const mu = options.mu ?? 0.3;
  const lambda = options.lambda ?? 0.9;
  const iterations = Math.max(1, options.iterations ?? 3);
  const eps = 1e-6;

  const delaySamples = options.preAligned
    ? 0
    : (options.delaySamples ??
      estimateDelaySamples(mic, ref, options.sampleRate, {
        maxLagSeconds: options.maxLagSeconds ?? 8,
      }));

  const x = options.preAligned
    ? ensureLength(ref, mic.length)
    : alignReference(ref, delaySamples, mic.length);
  const d = mic;
  const out = new Float32Array(d.length);

  // Frequency-domain filter weights (length M complex).
  const Wr = new Float64Array(M);
  const Wi = new Float64Array(M);
  // Per-bin smoothed reference power for NLMS normalization. Per-bin (not scalar)
  // is required for a COLORED reference — speech is far from white, and scalar
  // normalization lets high-power bins exceed the NLMS stability bound and
  // diverge. Seeded on the first block so there is no divide-by-zero cold start.
  const P = new Float64Array(M);

  // Scratch buffers reused per block.
  const xBufR = new Float64Array(M);
  const xBufI = new Float64Array(M);
  const yR = new Float64Array(M);
  const yI = new Float64Array(M);
  const eR = new Float64Array(M);
  const eI = new Float64Array(M);
  const gR = new Float64Array(M);
  const gI = new Float64Array(M);

  let echoEnergy = 0;
  let outEnergy = 0;

  const numBlocks = Math.ceil(d.length / N);
  // Adaptation passes converge the filter (W persists across passes); only the
  // last pass emits output and diagnostics.
  for (let iter = 0; iter < iterations; iter++) {
    const finalPass = iter === iterations - 1;
    for (let b = 0; b < numBlocks; b++) {
      const base = b * N;

      // Input frame = [previous N ref samples, current N ref samples] (overlap-save).
      for (let i = 0; i < N; i++) {
        const prev = base - N + i;
        xBufR[i] = prev >= 0 ? x[prev] : 0;
        xBufI[i] = 0;
      }
      for (let i = 0; i < N; i++) {
        const cur = base + i;
        xBufR[N + i] = cur < x.length ? x[cur] : 0;
        xBufI[N + i] = 0;
      }
      const Xr = xBufR.slice();
      const Xi = xBufI.slice();
      fftInPlace(Xr, Xi, false);

      // Per-bin reference power (EMA), seeded on the first block. Also a scalar
      // mean used as the regularization floor (so silent bins, where the gradient
      // is ~0 anyway, get a sane denominator instead of exploding).
      let meanPow = 0;
      for (let i = 0; i < M; i++) {
        const px = Xr[i] * Xr[i] + Xi[i] * Xi[i];
        P[i] = b === 0 ? px : lambda * P[i] + (1 - lambda) * px;
        meanPow += px;
      }
      meanPow /= M;
      const reg = 1e-2 * meanPow + eps;

      // Echo estimate y = last N of IFFT(W .* X).
      for (let i = 0; i < M; i++) {
        yR[i] = Wr[i] * Xr[i] - Wi[i] * Xi[i];
        yI[i] = Wr[i] * Xi[i] + Wi[i] * Xr[i];
      }
      fftInPlace(yR, yI, true);

      // Error e = d - y on the current block; output it.
      for (let i = 0; i < M; i++) {
        eR[i] = 0;
        eI[i] = 0;
      }
      for (let i = 0; i < N; i++) {
        const cur = base + i;
        const dv = cur < d.length ? d[cur] : 0;
        const yv = yR[N + i];
        const ev = dv - yv;
        eR[N + i] = ev;
        if (finalPass) {
          if (cur < out.length) out[cur] = ev;
          echoEnergy += dv * dv;
          outEnergy += ev * ev;
        }
      }

      // Gradient: G = conj(X) .* E, NLMS-normalized per bin by smoothed |X|^2.
      fftInPlace(eR, eI, false);
      for (let i = 0; i < M; i++) {
        const norm = P[i] + reg;
        gR[i] = (Xr[i] * eR[i] + Xi[i] * eI[i]) / norm;
        gI[i] = (Xr[i] * eI[i] - Xi[i] * eR[i]) / norm;
      }

      // Gradient constraint: keep only the first N taps (causal filter), zero the rest.
      fftInPlace(gR, gI, true);
      for (let i = N; i < M; i++) {
        gR[i] = 0;
        gI[i] = 0;
      }
      fftInPlace(gR, gI, false);

      for (let i = 0; i < M; i++) {
        Wr[i] += mu * gR[i];
        Wi[i] += mu * gI[i];
      }
    }
  }

  const erleDb = outEnergy > 0 ? 10 * Math.log10(echoEnergy / outEnergy) : 0;
  return { output: out, delaySamples, erleDb };
}

function ensureLength(x: Float32Array, length: number): Float32Array {
  if (x.length === length) return x;
  const out = new Float32Array(length);
  out.set(x.subarray(0, Math.min(x.length, length)));
  return out;
}
