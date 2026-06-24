import { describe, it, expect } from "vitest";
import { encodeWavPcm16 } from "../audioPcm";

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
