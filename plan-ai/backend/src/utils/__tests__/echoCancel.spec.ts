import { describe, it, expect } from "vitest";
import {
  fftInPlace,
  nextPow2,
  energyEnvelope,
  estimateDelaySamples,
  alignReference,
  cancelEcho,
} from "../echoCancel";

/** Deterministic PRNG so the synthetic-echo tests are reproducible. */
function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("fftInPlace", () => {
  it("round-trips a signal (forward then inverse ≈ identity)", () => {
    const n = 16;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    const rng = mulberry32(1);
    const orig: number[] = [];
    for (let i = 0; i < n; i++) {
      re[i] = rng() * 2 - 1;
      orig.push(re[i]);
    }
    fftInPlace(re, im, false);
    fftInPlace(re, im, true);
    for (let i = 0; i < n; i++) expect(re[i]).toBeCloseTo(orig[i], 10);
  });

  it("computes a known DFT (constant signal → energy only in bin 0)", () => {
    const re = new Float64Array([1, 1, 1, 1]);
    const im = new Float64Array(4);
    fftInPlace(re, im, false);
    expect(re[0]).toBeCloseTo(4, 10);
    expect(re[1]).toBeCloseTo(0, 10);
    expect(re[2]).toBeCloseTo(0, 10);
    expect(re[3]).toBeCloseTo(0, 10);
  });

  it("rejects non-power-of-two lengths", () => {
    expect(() => fftInPlace(new Float64Array(3), new Float64Array(3), false)).toThrow();
  });
});

describe("nextPow2", () => {
  it("rounds up to a power of two", () => {
    expect(nextPow2(1)).toBe(1);
    expect(nextPow2(5)).toBe(8);
    expect(nextPow2(1024)).toBe(1024);
    expect(nextPow2(1025)).toBe(2048);
  });
});

describe("energyEnvelope / estimateDelaySamples", () => {
  it("recovers a known bulk delay between two energy envelopes", () => {
    const fs = 16000;
    const len = fs * 4;
    const rng = mulberry32(42);
    // Bursty broadband reference: white noise gated on/off so the envelope has
    // structure for the delay search to lock onto.
    const ref = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const burst = Math.floor(i / (fs * 0.25)) % 2 === 0 ? 1 : 0;
      ref[i] = burst * (rng() * 2 - 1);
    }
    // Mic = ref delayed by D (pure echo, no near-end) → envelope is ref's, shifted.
    const D = 2000;
    const mic = new Float32Array(len);
    for (let i = 0; i < len; i++) mic[i] = i - D >= 0 ? 0.7 * ref[i - D] : 0;

    const est = estimateDelaySamples(mic, ref, fs, { maxLagSeconds: 1 });
    // Envelope resolution is one 100 Hz frame (160 samples); allow ±2 frames.
    expect(Math.abs(est - D)).toBeLessThan(320);
  });

  it("envelope length matches floor(len/frame)", () => {
    const env = energyEnvelope(new Float32Array(1000), 160);
    expect(env.length).toBe(6);
  });
});

describe("alignReference", () => {
  it("delays the reference by a positive lag (leading zeros)", () => {
    const ref = new Float32Array([1, 2, 3, 4]);
    const out = alignReference(ref, 2, 4);
    expect(Array.from(out)).toEqual([0, 0, 1, 2]);
  });
  it("advances the reference for a negative lag", () => {
    const ref = new Float32Array([1, 2, 3, 4]);
    const out = alignReference(ref, -1, 4);
    expect(Array.from(out)).toEqual([2, 3, 4, 0]);
  });
});

describe("cancelEcho (the actual echo canceller)", () => {
  const fs = 16000;
  const len = fs * 5; // 5 seconds

  /** Build a realistic scene: bursty broadband far-side, a delayed + reflected
   * echo path, and a narrowband near-end "voice" present only in the 2nd half. */
  function buildScene() {
    const rng = mulberry32(7);
    const ref = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const burst = Math.floor(i / (fs * 0.3)) % 2 === 0 ? 1 : 0;
      ref[i] = burst * (rng() * 2 - 1) * 0.8;
    }
    const D = 1500; // bulk acoustic + pipeline delay
    const echo = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      let v = 0;
      if (i - D >= 0) v += 0.7 * ref[i - D];
      if (i - D - 120 >= 0) v += 0.3 * ref[i - D - 120]; // a reflection
      echo[i] = v;
    }
    // Near-end: a 320 Hz tone in the second half only.
    const near = new Float32Array(len);
    const halfStart = Math.floor(len / 2);
    for (let i = halfStart; i < len; i++) {
      near[i] = 0.3 * Math.sin((2 * Math.PI * 320 * i) / fs);
    }
    const mic = new Float32Array(len);
    for (let i = 0; i < len; i++) mic[i] = echo[i] + near[i];
    return { ref, echo, near, mic, halfStart };
  }

  it("suppresses the far-side echo (high ERLE) on an echo-only region", () => {
    const { ref, mic } = buildScene();
    const { output, delaySamples } = cancelEcho(mic, ref, { sampleRate: fs });

    // Bulk delay located near the planted 1500.
    expect(Math.abs(delaySamples - 1500)).toBeLessThan(400);

    // Echo-return-loss-enhancement on a converged echo-only window (1.5s–2.4s).
    const a = Math.floor(fs * 1.5);
    const b = Math.floor(fs * 2.4);
    let micE = 0;
    let outE = 0;
    for (let i = a; i < b; i++) {
      micE += mic[i] * mic[i];
      outE += output[i] * output[i];
    }
    const erleDb = 10 * Math.log10(micE / outE);
    expect(erleDb).toBeGreaterThan(10); // ≥10 dB echo suppression
  });

  it("preserves the near-end voice (does not cancel the uncorrelated tone)", () => {
    const { ref, near, mic, halfStart } = buildScene();
    const { output } = cancelEcho(mic, ref, { sampleRate: fs });

    // Project the cleaned output onto the known near-end tone over the 2nd half.
    // gain ≈ 1 means the user's voice survived; ≈ 0 means we wrongly cancelled it.
    let dot = 0;
    let nn = 0;
    for (let i = halfStart; i < len; i++) {
      dot += output[i] * near[i];
      nn += near[i] * near[i];
    }
    const gain = dot / nn;
    expect(gain).toBeGreaterThan(0.6);
    expect(gain).toBeLessThan(1.4);
  });

  it("does not blow up when there is no echo (mic uncorrelated with ref)", () => {
    const rng = mulberry32(99);
    const ref = new Float32Array(len);
    const mic = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      ref[i] = (rng() * 2 - 1) * 0.5;
      mic[i] = 0.3 * Math.sin((2 * Math.PI * 200 * i) / fs); // pure near-end
    }
    const { output } = cancelEcho(mic, ref, { sampleRate: fs, preAligned: true });
    let micE = 0;
    let outE = 0;
    for (let i = 0; i < len; i++) {
      micE += mic[i] * mic[i];
      outE += output[i] * output[i];
    }
    // Output keeps most of the near-end energy (filter converges toward zero).
    expect(outE / micE).toBeGreaterThan(0.7);
    expect(outE / micE).toBeLessThan(1.3);
  });
});
