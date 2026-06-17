/**
 * AudioWorkletProcessor: capture raw Float32 mic audio, convert it to Int16 PCM,
 * and post the chunks to the main thread for the Deepgram WebSocket.
 *
 * The AudioContext runs at 24 kHz, so samples already arrive at the rate the ASR
 * wants — this worklet only buffers, converts, and forwards (no resampling). It
 * also mirrors its input to its output so a downstream MediaStreamDestination can
 * record the very same audio into the saved blob.
 *
 * Echo handling note
 * ------------------
 * Loudspeaker bleed (the far side re-entering the mic on speakers) is removed at
 * CAPTURE by the browser's AEC (echoCancellation, ON by default — see
 * audioRecorder.ts). Any LOUD residual that still slips through is handled by the
 * server-side word-dedup. The old in-worklet "echo gate" was removed: it
 * duplicated AEC's job with a cruder mic-energy heuristic and, because it wrote
 * the gated signal into the permanent recording, a misfire could erase the
 * user's own voice (field bug, 2026-06-11). This processor no longer touches the
 * mic signal — it passes it through verbatim.
 */

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
    this.buffer = new Int16Array(this.bufferSize);
    this.pointer = 0;

    // RMS accumulator + frame counter, used only for the UI level meter.
    this.sumSq = 0;
    this.frameCount = 0;
  }

  process(inputs, outputs) {
    if (
      !inputs ||
      inputs.length === 0 ||
      !inputs[0] ||
      inputs[0].length === 0
    ) {
      return true; // Keep the processor alive even when silent
    }

    const channel0 = inputs[0][0];
    const length = channel0.length;

    for (let i = 0; i < length; i++) {
      const sample = channel0[i] || 0;

      // RMS (pre-anything) for diagnostics / the level meter
      this.sumSq += sample * sample;

      // Pass-through to outputs so a MediaRecorder on a MediaStreamDestination
      // can capture this audio into the saved blob.
      if (outputs && outputs.length > 0 && outputs[0] && outputs[0].length > 0) {
        for (let channel = 0; channel < outputs[0].length; channel++) {
          if (inputs[0][channel]) {
            outputs[0][channel][i] = sample;
          }
        }
      }

      // Float32 → Int16
      const s = Math.max(-1, Math.min(1, sample));
      this.buffer[this.pointer++] = s < 0 ? s * 0x8000 : s * 0x7fff;

      // Transmit the chunk when full
      if (this.pointer >= this.bufferSize) {
        const chunk = new Int16Array(this.buffer);
        const rmsMic = Math.sqrt(this.sumSq / this.bufferSize);

        // Periodic level telemetry (~every 3.4s) for the UI meter. For the
        // sysWorkletNode, input 0 IS the system audio, so this same rmsMic is
        // re-labelled as the system level by audioRecorder's sys handler.
        this.frameCount++;
        if (this.frameCount % 20 === 0) {
          this.port.postMessage({ type: "debug", rmsMic });
        }
        this.sumSq = 0;

        // ALWAYS transmit audio. Let the downstream ASR (Deepgram) handle VAD.
        this.port.postMessage(chunk.buffer, [chunk.buffer]);

        this.pointer = 0;
      }
    }
    return true; // Keep the processor alive
  }
}

registerProcessor("pcm-processor", PCMProcessor);
