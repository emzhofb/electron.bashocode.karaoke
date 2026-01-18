class PitchShifterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'pitchRatio',
        defaultValue: 1,
        minValue: 0.5,
        maxValue: 2
      }
    ];
  }

  constructor() {
    super();
    this.bufferLength = 8192;
    this.buffer = new Float32Array(this.bufferLength);
    this.writeIndex = 0;
    this.readIndex = 0;
    this.targetDistance = 2048;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) {
      return true;
    }

    const inputChannel = input[0];
    const outputChannel = output[0];
    const ratioParam = parameters.pitchRatio;

    for (let i = 0; i < outputChannel.length; i += 1) {
      const sample = inputChannel[i] || 0;
      this.buffer[this.writeIndex] = sample;
      this.writeIndex = (this.writeIndex + 1) % this.bufferLength;

      const ratio = ratioParam.length > 1 ? ratioParam[i] : ratioParam[0];
      const readIndexInt = Math.floor(this.readIndex);
      const nextIndex = (readIndexInt + 1) % this.bufferLength;
      const frac = this.readIndex - readIndexInt;
      const a = this.buffer[readIndexInt];
      const b = this.buffer[nextIndex];
      outputChannel[i] = a + (b - a) * frac;

      this.readIndex += ratio;
      if (this.readIndex >= this.bufferLength) {
        this.readIndex -= this.bufferLength;
      }

      const distance = (this.writeIndex - this.readIndex + this.bufferLength) % this.bufferLength;
      if (distance < this.targetDistance * 0.5 || distance > this.targetDistance * 1.5) {
        this.readIndex = (this.writeIndex - this.targetDistance + this.bufferLength) % this.bufferLength;
      }
    }

    return true;
  }
}

registerProcessor('pitch-shifter', PitchShifterProcessor);
