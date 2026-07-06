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

  // Normalize each lag by the mic-envelope energy under the ref's support at
  // that lag (sliding-window energy via prefix sums). Raw correlation picks
  // whichever alignment overlaps the LOUDEST unrelated burst — e.g. the ref's
  // only burst against the user's own (louder) speech elsewhere in the mic —
  // and returns a bogus lag at the search bound (field failure 2026-07-06).
  // Normalized cross-correlation instead rewards matching SHAPE: the echo's
  // envelope is a scaled copy of the ref's, so the true lag scores ~1 while a
  // coincidental overlap of unrelated speech scores far lower.
  const micE2Prefix = new Float64Array(me.length + 1);
  for (let i = 0; i < me.length; i++) micE2Prefix[i + 1] = micE2Prefix[i] + me[i] * me[i];
  let refE2 = 0;
  for (let i = 0; i < re.length; i++) refE2 += re[i] * re[i];

  // corr at lag k lives at index k (k>=0) or n+k (k<0).
  let bestLag = 0;
  let bestVal = -Infinity;
  for (let k = minLagFrames; k <= maxLagFrames; k++) {
    const idx = k >= 0 ? k : n + k;
    if (idx < 0 || idx >= n) continue;
    // Mic-envelope energy over the ref's support shifted by k: frames [k, k+len(re)).
    const lo = Math.max(0, Math.min(me.length, k));
    const hi = Math.max(0, Math.min(me.length, k + re.length));
    const micE2 = micE2Prefix[hi] - micE2Prefix[lo];
    const denom = Math.sqrt(micE2 * refE2) + 1e-12;
    const v = aR[idx] / denom;
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

/**
 * GCC-PHAT waveform delay estimation — the primary estimator.
 *
 * Envelope correlation compares energy SHAPES, so a loud burst of the user's
 * own (unrelated) speech overlapping the ref's only burst at some bogus lag can
 * out-score the true alignment of the ref with its much quieter echo — exactly
 * the 2026-07-06 field failure (estimate pinned at the +8s search bound).
 * GCC-PHAT instead whitens the cross-spectrum (|C| normalized away per bin), so
 * scoring is by PHASE COHERENCE alone: the echo is a filtered copy of the ref
 * (coherent → sharp peak at the true lag) while near-end speech is incoherent
 * with it at every lag regardless of loudness.
 *
 * Runs on a few of the LOUDEST reference windows (bounded memory/CPU even for
 * 90-min buffers) and accumulates their correlograms. Returns null when no
 * confident coherent peak exists (silent/degenerate reference) — the caller
 * falls back to the envelope method.
 */
export function estimateDelayPhat(
  mic: Float32Array,
  ref: Float32Array,
  sampleRate: number,
  opts: { maxLagSeconds?: number; windowSeconds?: number; windows?: number } = {},
): number | null {
  const maxLag = Math.round((opts.maxLagSeconds ?? 8) * sampleRate);
  const win = Math.round((opts.windowSeconds ?? 8) * sampleRate);
  const numWindows = opts.windows ?? 4;
  if (ref.length < win || mic.length < win) return null;

  // Rank ref windows by energy (hop = win/2), pick the loudest non-overlapping.
  const hop = win >> 1;
  const cands: { start: number; e: number }[] = [];
  for (let s = 0; s + win <= ref.length; s += hop) {
    let e = 0;
    for (let i = s; i < s + win; i += 4) e += ref[i] * ref[i]; // stride-4 sample is enough for ranking
    cands.push({ start: s, e });
  }
  cands.sort((a, b) => b.e - a.e);
  const picked: number[] = [];
  for (const c of cands) {
    if (c.e <= 0) break;
    if (picked.every((p) => Math.abs(p - c.start) >= win)) picked.push(c.start);
    if (picked.length >= numWindows) break;
  }
  if (picked.length === 0) return null;

  const acc = new Float64Array(2 * maxLag + 1);
  for (const s of picked) {
    // Mic segment spans the ref window ± maxLag so every candidate lag overlaps.
    const micStart = Math.max(0, s - maxLag);
    const micEnd = Math.min(mic.length, s + win + maxLag);
    const micLen = micEnd - micStart;
    if (micLen < win) continue;

    const n = nextPow2(micLen + win);
    const aRe = new Float64Array(n);
    const aIm = new Float64Array(n);
    const bRe = new Float64Array(n);
    const bIm = new Float64Array(n);
    for (let i = 0; i < micLen; i++) aRe[i] = mic[micStart + i];
    for (let i = 0; i < win; i++) bRe[i] = ref[s + i];
    fftInPlace(aRe, aIm, false);
    fftInPlace(bRe, bIm, false);
    // PHAT-weighted cross spectrum: C = A·conj(B) / |A·conj(B)|.
    for (let i = 0; i < n; i++) {
      const r = aRe[i] * bRe[i] + aIm[i] * bIm[i];
      const im = aIm[i] * bRe[i] - aRe[i] * bIm[i];
      const mag = Math.sqrt(r * r + im * im) + 1e-12;
      aRe[i] = r / mag;
      aIm[i] = im / mag;
    }
    fftInPlace(aRe, aIm, true);
    // corr[l] = coherence of mic[micStart+l ...] with ref[s ...]; absolute
    // delay (mic lags ref) = (micStart + l) - s.
    for (let d = -maxLag; d <= maxLag; d++) {
      const l = d + (s - micStart);
      if (l < 0 || l >= n) continue;
      acc[d + maxLag] += aRe[l];
    }
  }

  // Confidence: the coherent peak must clearly dominate the correlogram noise.
  let best = 0;
  let bestVal = -Infinity;
  let sumAbs = 0;
  for (let i = 0; i < acc.length; i++) {
    const v = acc[i];
    sumAbs += Math.abs(v);
    if (v > bestVal) {
      bestVal = v;
      best = i;
    }
  }
  const meanAbs = sumAbs / acc.length;
  if (!(bestVal > 0) || bestVal < 8 * meanAbs) return null;
  return best - maxLag;
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

  // Delay: GCC-PHAT (phase coherence — immune to loud unrelated near-end
  // speech) with the envelope method as fallback when no coherent peak exists.
  const delaySamples = options.preAligned
    ? 0
    : options.delaySamples ??
      estimateDelayPhat(mic, ref, options.sampleRate, {
        maxLagSeconds: options.maxLagSeconds ?? 8,
      }) ??
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

  // Global reference power scale, for far-end gating and regularization.
  // A real meeting reference is silence-dominated (the far side talks in
  // bursts); normalizing by the CURRENT block's power lets near-silent blocks
  // divide the gradient by ~eps while the error buffer holds full-scale
  // near-end speech — the weights explode astronomically (field test
  // 2026-07-06: nearKept=34, echoRed=114). So: (1) adapt only when the block's
  // reference power is within 30 dB of the loudest reference block, (2) floor
  // the regularizer to the global scale, (3) leak the weights slightly so any
  // residual misadaptation bleeds away instead of accumulating.
  let peakBlockPow = 0;
  for (let b = 0; b < numBlocks; b++) {
    const base = b * N;
    let p = 0;
    for (let i = 0; i < N; i++) {
      const cur = base + i;
      const v = cur < x.length ? x[cur] : 0;
      p += v * v;
    }
    if (p / N > peakBlockPow) peakBlockPow = p / N;
  }
  const gateThr = peakBlockPow * 1e-3; // −30 dB vs loudest reference block
  // Freq-domain equivalent of the global scale (Parseval: Σ|X|² = M·Σx²; the
  // per-bin mean over M bins of a full-power block ≈ M·peakBlockPow… kept as a
  // conservative floor rather than an exact identity).
  const regFloor = 1e-3 * (2 * N) * peakBlockPow;
  const leak = 0.9995;

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

    // Current block's reference power (time domain) for the far-end gate.
    let curBlockPow = 0;
    for (let i = 0; i < N; i++) {
      const cur = base + i;
      const v = cur < x.length ? x[cur] : 0;
      curBlockPow += v * v;
    }
    curBlockPow /= N;
    const farEndActive = curBlockPow >= gateThr;

    // Per-bin reference power (EMA), seeded on the first block. The scalar
    // regularizer is floored to the GLOBAL reference scale so a near-silent
    // block can never collapse the denominator (see the stability note above).
    let meanPow = 0;
    for (let i = 0; i < M; i++) {
      const px = Xr[i] * Xr[i] + Xi[i] * Xi[i];
      P[i] = b === 0 ? px : lambda * P[i] + (1 - lambda) * px;
      meanPow += px;
    }
    meanPow /= M;
    const reg = 1e-2 * Math.max(meanPow, regFloor) + eps;

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

    // Adapt only while the far end is actually active: with a silent reference
    // there is no echo to learn — the "gradient" is pure near-end speech noise
    // and integrating it is what blew the filter up.
    if (farEndActive) {
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

      // Leaky update: the leak bleeds away residual misadaptation instead of
      // letting it accumulate across a long recording.
      for (let i = 0; i < M; i++) {
        Wr[i] = leak * Wr[i] + mu * gR[i];
        Wi[i] = leak * Wi[i] + mu * gI[i];
      }
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
