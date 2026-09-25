import { describe, it, expect } from "vitest";
import {
  encodeWavPcm16,
  writeWavHeader,
  transcodeToWav16kMono,
  ffmpegAvailable,
} from "../audioPcm";

describe("encodeWavPcm16", () => {
  it("writes a valid 16-bit mono WAV header", () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const buf = encodeWavPcm16(samples, 16000);

    expect(buf.toString("ascii", 0, 4)).toBe("RIFF");
    expect(buf.toString("ascii", 8, 12)).toBe("WAVE");
    expect(buf.toString("ascii", 12, 16)).toBe("fmt ");
    expect(buf.toString("ascii", 36, 40)).toBe("data");
    expect(buf.readUInt16LE(20)).toBe(1); // PCM
    expect(buf.readUInt16LE(22)).toBe(1); // mono
    expect(buf.readUInt32LE(24)).toBe(16000); // sample rate
    expect(buf.readUInt16LE(34)).toBe(16); // bits/sample
    expect(buf.readUInt32LE(40)).toBe(samples.length * 2); // data size
    expect(buf.length).toBe(44 + samples.length * 2);
  });

  it("quantizes and clamps samples to int16", () => {
    const buf = encodeWavPcm16(new Float32Array([0, 1, -1, 2, -2]), 16000);
    expect(buf.readInt16LE(44)).toBe(0);
    expect(buf.readInt16LE(46)).toBe(0x7fff); // +1.0 → max
    expect(buf.readInt16LE(48)).toBe(-0x8000); // -1.0 → min
    expect(buf.readInt16LE(50)).toBe(0x7fff); // +2.0 clamped
    expect(buf.readInt16LE(52)).toBe(-0x8000); // -2.0 clamped
  });
});

describe("writeWavHeader", () => {
  it("is the header encodeWavPcm16 writes, so both WAV writers agree", () => {
    const wav = encodeWavPcm16(new Float32Array([0, 0.5, -0.5]), 16000);
    expect(wav.subarray(0, 44).equals(writeWavHeader(16000, 6))).toBe(true);
  });
});

describe("transcodeToWav16kMono", () => {
  it("returns 16 kHz mono WAV at a normal loudness, whatever came in", async () => {
    if (!(await ffmpegAvailable())) return; // needs ffmpeg, like the AEC path
    // 2 s of a quiet 220 Hz tone at 48 kHz (peak about -34 dBFS).
    const rate = 48000;
    const samples = new Float32Array(rate * 2).map(
      (_, i) => 0.02 * Math.sin((2 * Math.PI * 220 * i) / rate),
    );
    const wav = await transcodeToWav16kMono(encodeWavPcm16(samples, rate));

    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.readUInt32LE(24)).toBe(16000);
    expect(wav.readUInt16LE(22)).toBe(1);
    const secs = (wav.length - 44) / 2 / 16000;
    expect(secs).toBeGreaterThan(1.9);
    expect(secs).toBeLessThan(2.1);
    let peak = 0;
    for (let i = 44; i < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
    expect(peak / 32768).toBeGreaterThan(0.1); // loudnorm lifted it well above the input
  });
});
