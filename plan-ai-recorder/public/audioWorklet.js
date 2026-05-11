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

    // Debugging Volume
    this.sumMicSq = 0;
    this.sumSysSq = 0;
    this.frameCount = 0;
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
      let mixedSample = 0;

      // Microphone is always Input 0
      let micSample = inputs[0][0][i] || 0;
      mixedSample += micSample;
      this.sumMicSq += micSample * micSample;

      // System audio is always Input 1
      if (hasSystemAudio) {
        let sysSample = 0;
        // Mix down stereo system audio if present
        if (inputs[1].length > 1) {
          sysSample = ((inputs[1][0][i] || 0) + (inputs[1][1][i] || 0)) / 2;
        } else {
          sysSample = inputs[1][0][i] || 0;
        }
        mixedSample += sysSample;
        this.sumSysSq += sysSample * sysSample;
      }

      // 0. Pass-through original audio to outputs for MediaRecorder
      if (outputs && outputs.length > 0 && outputs[0] && outputs[0].length > 0) {
        for (let channel = 0; channel < outputs[0].length; channel++) {
          if (inputs[0][channel]) {
            outputs[0][channel][i] = inputs[0][channel][i];
          }
        }
      }

      // 1. Basic Float32 to Int16 Conversion
      let s = Math.max(-1, Math.min(1, mixedSample));
      this.buffer[this.pointer++] = s < 0 ? s * 0x8000 : s * 0x7fff;

      // 2. Transmit the chunk when full
      if (this.pointer >= this.bufferSize) {
        const chunk = new Int16Array(this.buffer);

        let rmsMic = Math.sqrt(this.sumMicSq / this.bufferSize);
        let rmsSys = Math.sqrt(this.sumSysSq / this.bufferSize);

        // Output periodic debugging (every ~3.4 seconds to avoid spam)
        this.frameCount++;
        if (this.frameCount % 20 === 0) {
          this.port.postMessage({
            type: "debug",
            message: `[Worklet] Captured audio. RMS Mic: ${rmsMic.toFixed(4)}, RMS Sys: ${rmsSys.toFixed(4)}`,
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
