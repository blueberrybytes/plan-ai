import { Mp3Encoder } from "@breezystack/lamejs";

/**
 * Encode mono 16-bit PCM as MP3 bytes. Keeps the echo-cancelled mic upload close
 * to the size of the original Opus blob (an uncompressed WAV would be ~10×
 * larger and risk the upload aborting on long meetings). Deepgram transcribes
 * MP3 directly. Runs inside the AEC worker, so it never blocks the UI.
 */
export function encodeMp3BytesFromInt16(
  samples: Int16Array,
  sampleRate: number,
  kbps = 64,
): ArrayBuffer {
  const enc = new Mp3Encoder(1, sampleRate, kbps);
  const blockSize = 1152; // MP3 frame size
  const parts: Uint8Array[] = [];
  let total = 0;
  for (let i = 0; i < samples.length; i += blockSize) {
    const chunk = samples.subarray(i, i + blockSize);
    const buf = enc.encodeBuffer(chunk);
    if (buf.length > 0) {
      parts.push(buf);
      total += buf.length;
    }
  }
  const end = enc.flush();
  if (end.length > 0) {
    parts.push(end);
    total += end.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out.buffer;
}
