/**
 * AudioWorkletProcessor to capture raw Float32 audio from the microphone,
 * downsample it to 24kHz, convert to Int16 PCM, and package it into Base64
 * chunks for the OpenAI Realtime WebSocket API.
 */
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
    this.buffer = new Int16Array(this.bufferSize);
    this.pointer = 0;

    // Debugging & AEC Envelope
    this.sumMicSq = 0;
    this.sumSysSq = 0;
    this.frameCount = 0;
    this.sysEnvelope = 0;
    this.micEnvelope = 0;
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
        
        // Fast attack, slow release envelope for system audio (AEC / Echo Suppression)
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

      // Calculate RMS before ducking to detect if user is speaking over the echo
      this.sumMicSq += micSample * micSample;
      this.sumSysSq += sysSample * sysSample;

      // Fast attack, slow release envelope for mic audio
      const absMic = Math.abs(micSample);
      if (absMic > this.micEnvelope) {
         this.micEnvelope = absMic;
      } else {
         this.micEnvelope = 0.999 * this.micEnvelope;
      }

      // Echo Suppression: Duck microphone if system audio is playing
      let duckFactor = 1.0;
      if (!this.disableDucking) {
        // We estimate the echo level in the mic. Usually echo is much quieter than sysSample (e.g. 10-20%)
        // We use the smoothed envelopes to avoid zero-crossing distortion
        const expectedEcho = this.sysEnvelope * 0.3; // Assume max 30% acoustic coupling
        const isUserSpeaking = this.micEnvelope > expectedEcho * 1.5;

        if (!isUserSpeaking) {
          if (this.sysEnvelope > 0.005) { 
              duckFactor = 0.0; // fully mute mic to prevent echo
          } else if (this.sysEnvelope > 0.001) { 
              duckFactor = 1.0 - ((this.sysEnvelope - 0.001) / 0.004);
          }
        }
      }
      
      micSample = micSample * duckFactor;

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
            message: `[Worklet] Captured audio. RMS Mic: ${rmsMic.toFixed(4)}, RMS Sys: ${rmsSys.toFixed(4)}, duckFactor: ${duckFactor.toFixed(2)}, outputs: ${hasOutputs}, numChannels: ${numOutputs}`,
            rmsMic: rmsMic,
            rmsSys: rmsSys,
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
