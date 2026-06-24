/**
 * Reference-based acoustic echo cancellation — runs at STOP on the raw,
 * PRE-CODEC mic + sys PCM buffered during recording (driven by aecWorker.ts).
 *
 * Why here and not the backend: when the user is on a loudspeaker the far side
 * physically re-enters the mic, so the mic recording carries a delayed,
 * room-coloured copy of the system audio. A linear adaptive filter can subtract
 * it ONLY while the reference→echo relationship is still linear — i.e. BEFORE
 * the lossy Opus/AAC encode. Doing it later on the two separately-compressed
 * blobs fails: each codec's quantization noise decorrelates the echo from the
 * reference. At record time the mic is lossless and the sys reference is
 * lossless (Windows) or AAC-128 (macOS), so the filter actually works.
 *
 * We (1) estimate the bulk mic↔sys delay by cross-correlating their short-time
 * energy envelopes (robust to the macOS ~2-5s sys spin-up + drift), then (2) run
 * a constrained frequency-domain adaptive filter (overlap-save NLMS, the
 * textbook AEC) with the aligned sys signal as the far-end reference.
 *
 * The user's own voice is uncorrelated with the reference, so the filter never
 * learns it — only the echo path — and it survives. A caller-side self-check
 * (near-end preserved + measurable echo return loss) decides whether to trust
 * the result; on any doubt the RAW mic is kept, so a misfire can never erase the
 * user's voice. The server-side text dedup stays as a backstop for residual.
 *
 * Pure DSP — no audio I/O or platform APIs here, so it runs in a Web Worker and
 * is unit-testable against synthetic echo.
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
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inverse ? 2 : -2) * Math.PI / len;
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
  // Symmetric search: at record time the buffered sys reference may arrive LATER
  // than the mic echo (macOS sys decode lag ⇒ negative lag) or earlier, so we
  // search both directions.
  const maxLagFrames = Math.round((opts.maxLagSeconds ?? 8) * envHz);
  const minLagFrames = Math.round((opts.minLagSeconds ?? -8) * envHz);

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
    : options.delaySamples ??
      estimateDelaySamples(mic, ref, options.sampleRate, {
        maxLagSeconds: options.maxLagSeconds ?? 8,
      });

  const x = options.preAligned ? ensureLength(ref, mic.length) : alignReference(ref, delaySamples, mic.length);
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

export interface SelfCheckResult {
  /** Output÷mic energy where the reference was SILENT (≈1 good; ≪1 ⇒ eating the user's voice). */
  nearKept: number;
  /** Output÷mic energy where the reference was ACTIVE (<1 ⇒ echo is being removed). */
  echoReduction: number;
  /** Safe AND worth using: near-end preserved and the filter actually removed echo. */
  ok: boolean;
}

/**
 * Decide whether to TRUST the cancelled signal before it replaces the mic blob.
 * Classifies frames by reference energy: where the (aligned) reference is silent
 * there is no echo, so the output must still ≈ the mic (else the filter is eating
 * the user's own voice — reject). Where the reference is active, the output
 * should be reduced (echo removed). Conservative by design: any doubt ⇒ keep raw.
 */
export function selfCheckAec(
  mic: Float32Array,
  output: Float32Array,
  refAligned: Float32Array,
  sampleRate: number,
): SelfCheckResult {
  const frame = Math.max(1, Math.round(sampleRate / 50)); // 20 ms frames
  const frames = Math.floor(mic.length / frame);
  if (frames < 10) return { nearKept: 1, echoReduction: 1, ok: false };

  const refE = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    let s = 0;
    const b = f * frame;
    for (let i = 0; i < frame; i++) {
      const v = refAligned[b + i];
      s += v * v;
    }
    refE[f] = s / frame;
  }
  const sorted = Array.from(refE).sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)] || 0;
  const peak = sorted[sorted.length - 1] || 0;
  const silentThr = med * 0.25 + peak * 1e-4;
  const activeThr = med + (peak - med) * 0.2;

  let micSil = 0, outSil = 0, micAct = 0, outAct = 0;
  for (let f = 0; f < frames; f++) {
    const b = f * frame;
    let me = 0, oe = 0;
    for (let i = 0; i < frame; i++) {
      const m = mic[b + i], o = output[b + i];
      me += m * m;
      oe += o * o;
    }
    if (refE[f] <= silentThr) { micSil += me; outSil += oe; }
    else if (refE[f] >= activeThr) { micAct += me; outAct += oe; }
  }
  const nearKept = micSil > 0 ? outSil / micSil : 1;
  const echoReduction = micAct > 0 ? outAct / micAct : 1;
  const ok = nearKept >= 0.6 && echoReduction <= 0.95;
  return { nearKept, echoReduction, ok };
}
