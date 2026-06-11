/**
 * AudioWorkletProcessor to capture raw Float32 audio from the microphone,
 * downsample it to 24kHz, convert to Int16 PCM, and package it into Base64
 * chunks for the Deepgram WebSocket API.
 *
 * Echo gate (mic-loudness authoritative)
 * --------------------------------------
 * When the user listens on SPEAKERS, the far side physically re-enters the mic.
 * The old approach ducked the mic by comparing it against the system reference
 * sample-for-sample — but on macOS that reference is delivered in ~2s chunks by
 * a native binary, so it lags the mic by seconds and the comparison misfires:
 * it both let bleed through (duplication) and ducked real speech (dropouts).
 *
 * Instead we decide keep-vs-drop from the MIC ITSELF, which needs no cross-stream
 * alignment: the user's own voice is the LOUDEST thing in the mic, while speaker
 * bleed is attenuated and sits near the room's noise floor. We track that floor
 * adaptively and treat the mic as real near-end speech only when it clears a
 * margin above it. The (laggy) system reference is used ONLY as a slow, coarse
 * "is the far side active at all recently?" switch — if it's quiet (headphones,
 * or nobody else talking) the gate is disabled entirely so the user can never be
 * dropped.
 */

// All thresholds are on linear amplitude (Float32 samples, -1..1).
const ABS_SPEECH_FLOOR = 0.01; // hard lower bound: below this is never "speech"
const SPEECH_MARGIN = 3.5; // mic must exceed floor * this to count as near-end
const SYS_ACTIVE_THRESH = 0.01; // far side counts as "active" above this envelope
const HANGOVER_SECONDS = 0.4; // keep passing this long after speech drops

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
    this.buffer = new Int16Array(this.bufferSize);
    this.pointer = 0;

    // Debugging & envelopes
    this.sumMicSq = 0;
    this.sumSysSq = 0;
    this.frameCount = 0;
    this.sysEnvelope = 0;
    this.micEnvelope = 0;

    // ── Echo gate state ──
    this.sysActivity = 0; // slow-release "far side active recently"
    this.micFloor = 0.02; // adaptive room/echo floor (min-follower w/ slow leak)
    this.hangover = 0; // samples left to keep passing after speech drops
    this.gateGain = 1.0; // smoothed output gain (1 = pass, 0 = gated to silence)
    this.hangoverSamples = Math.round(HANGOVER_SECONDS * sampleRate);
  }

  process(inputs, outputs) {
    if (
      !inputs ||
      inputs.length === 0 ||
      !inputs[0] ||
      inputs[0].length === 0
    ) {
      return true; // Keep processor alive even when silent
    }

    const primaryLength = inputs[0][0].length;
    let hasSystemAudio = inputs.length > 1 && inputs[1] && inputs[1].length > 0;

    for (let i = 0; i < primaryLength; i++) {
      // Microphone is always Input 0
      let micSample = inputs[0][0][i] || 0;
      let sysSample = 0;

      // System audio is always Input 1
      if (hasSystemAudio) {
        // Mix down stereo system audio if present
        if (inputs[1].length > 1) {
          sysSample = ((inputs[1][0][i] || 0) + (inputs[1][1][i] || 0)) / 2;
        } else {
          sysSample = inputs[1][0][i] || 0;
        }
        
        // Fast attack, slow release envelope for system audio
        const absSys = Math.abs(sysSample);
        if (absSys > this.sysEnvelope) {
           this.sysEnvelope = absSys; // instant attack
        } else {
           this.sysEnvelope = 0.999 * this.sysEnvelope; // slow release (~40ms at 24kHz)
        }
      } else {
        // Decay the envelope even if system audio input is temporarily missing
        this.sysEnvelope = 0.999 * this.sysEnvelope;
      }

      // Slow "far side active recently" signal: instant attack, ~2s release.
      // Deliberately sluggish so it bridges the lag/gaps of the chunked macOS
      // system reference — it is used only as a coarse on/off for the gate.
      const absSysAct = Math.abs(sysSample);
      if (absSysAct > this.sysActivity) this.sysActivity = absSysAct;
      else this.sysActivity = 0.99998 * this.sysActivity;

      // Calculate RMS (pre-gate) for diagnostics
      this.sumMicSq += micSample * micSample;
      this.sumSysSq += sysSample * sysSample;

      // Fast attack, slow release envelope for mic audio
      const absMic = Math.abs(micSample);
      if (absMic > this.micEnvelope) {
         this.micEnvelope = absMic;
      } else {
         this.micEnvelope = 0.999 * this.micEnvelope;
      }

      // Near-end (real user) speech: the mic must clear BOTH an absolute floor
      // and a margin above the adaptive room/echo floor. Attenuated speaker
      // bleed stays near the floor; the user's own voice clears it.
      const speechThreshold = Math.max(ABS_SPEECH_FLOOR, this.micFloor * SPEECH_MARGIN);
      const nearEnd = this.micEnvelope > speechThreshold;

      // Adaptive floor: minimum-follower with a slow upward leak. Only pinned
      // down while NOT near-end, so real speech never inflates it; the leak lets
      // it recover if the room/bleed gets louder.
      this.micFloor *= 1.000005;
      if (!nearEnd && this.micEnvelope < this.micFloor) this.micFloor = this.micEnvelope;
      if (this.micFloor < 1e-4) this.micFloor = 1e-4;

      // Hangover so word tails and brief pauses inside speech aren't clipped.
      if (nearEnd) this.hangover = this.hangoverSamples;
      else if (this.hangover > 0) this.hangover--;
      const speakingHeld = nearEnd || this.hangover > 0;

      // Gate only engages when the far side is actually active. Headphones (or
      // nobody else talking) → sysActivity low → gate disabled → mic ALWAYS
      // passes, so the user can never be dropped.
      const gateActive = this.sysActivity > SYS_ACTIVE_THRESH && !this.disableGate;
      const targetGain = !gateActive || speakingHeld ? 1.0 : 0.0;

      // Smooth the gain: fast attack toward 1 (don't clip speech onsets), slower
      // release toward 0 (click-free fade once the hangover expires).
      if (targetGain > this.gateGain) {
         this.gateGain = 0.99 * this.gateGain + 0.01 * targetGain; // ~4ms attack
      } else {
         this.gateGain = 0.9995 * this.gateGain + 0.0005 * targetGain; // ~80ms release
      }

      micSample = micSample * this.gateGain;

      // 0. Pass-through original audio to outputs for MediaRecorder
      if (outputs && outputs.length > 0 && outputs[0] && outputs[0].length > 0) {
        for (let channel = 0; channel < outputs[0].length; channel++) {
          if (inputs[0][channel]) {
            outputs[0][channel][i] = micSample;
          }
        }
      }

      // 1. Basic Float32 to Int16 Conversion
      let s = Math.max(-1, Math.min(1, micSample));
      this.buffer[this.pointer++] = s < 0 ? s * 0x8000 : s * 0x7fff;

      // 2. Transmit the chunk when full
      if (this.pointer >= this.bufferSize) {
        const chunk = new Int16Array(this.buffer);

        let rmsMic = Math.sqrt(this.sumMicSq / this.bufferSize);
        let rmsSys = Math.sqrt(this.sumSysSq / this.bufferSize);

        // Output periodic debugging (every ~3.4 seconds to avoid spam)
        this.frameCount++;
        if (this.frameCount % 20 === 0) {
          const hasOutputs = outputs && outputs.length > 0;
          const numOutputs = hasOutputs ? outputs[0].length : 0;
          this.port.postMessage({
            type: "debug",
            message: `[Worklet] RMS Mic: ${rmsMic.toFixed(4)}, RMS Sys: ${rmsSys.toFixed(4)}, gate: ${this.gateGain.toFixed(2)}, floor: ${this.micFloor.toFixed(4)}, sysAct: ${this.sysActivity.toFixed(3)}, outputs: ${hasOutputs}, numChannels: ${numOutputs}`,
            rmsMic: rmsMic,
            rmsSys: rmsSys,
            gateGain: this.gateGain,
            micFloor: this.micFloor,
            sysActivity: this.sysActivity,
          });
        }
        
        this.sumMicSq = 0;
        this.sumSysSq = 0;

        // ALWAYS transmit audio. Let the downstream AI (Deepgram/OpenAI) handle VAD!
        this.port.postMessage(chunk.buffer, [chunk.buffer]);
        
        this.pointer = 0;
      }
    }
    return true; // Keep the processor alive
  }
}

registerProcessor("pcm-processor", PCMProcessor);
