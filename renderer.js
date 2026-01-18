const ui = {
  toggleSession: document.getElementById('toggleSession'),
  statusLight: document.getElementById('statusLight'),
  statusLabel: document.getElementById('statusLabel'),
  statusMeta: document.getElementById('statusMeta'),
  inputDevice: document.getElementById('inputDevice'),
  outputDevice: document.getElementById('outputDevice'),
  masterGain: document.getElementById('masterGain'),
  balance: document.getElementById('balance'),
  echoEnabled: document.getElementById('echoEnabled'),
  echoSync: document.getElementById('echoSync'),
  echoTempo: document.getElementById('echoTempo'),
  echoDivision: document.getElementById('echoDivision'),
  echoTime: document.getElementById('echoTime'),
  echoFeedback: document.getElementById('echoFeedback'),
  echoMix: document.getElementById('echoMix'),
  reverbEnabled: document.getElementById('reverbEnabled'),
  reverbRoom: document.getElementById('reverbRoom'),
  reverbDamp: document.getElementById('reverbDamp'),
  reverbMix: document.getElementById('reverbMix'),
  chorusEnabled: document.getElementById('chorusEnabled'),
  chorusRate: document.getElementById('chorusRate'),
  chorusDepth: document.getElementById('chorusDepth'),
  chorusMix: document.getElementById('chorusMix'),
  flangerEnabled: document.getElementById('flangerEnabled'),
  flangerRate: document.getElementById('flangerRate'),
  flangerDepth: document.getElementById('flangerDepth'),
  flangerFeedback: document.getElementById('flangerFeedback'),
  flangerMix: document.getElementById('flangerMix'),
  phaserEnabled: document.getElementById('phaserEnabled'),
  phaserRate: document.getElementById('phaserRate'),
  phaserDepth: document.getElementById('phaserDepth'),
  phaserMix: document.getElementById('phaserMix'),
  pitchShift: document.getElementById('pitchShift'),
  pitchMix: document.getElementById('pitchMix'),
  harmonyEnabled: document.getElementById('harmonyEnabled'),
  harmonyShift: document.getElementById('harmonyShift'),
  harmonyMix: document.getElementById('harmonyMix'),
  tuneEnabled: document.getElementById('tuneEnabled'),
  tuneStrength: document.getElementById('tuneStrength'),
  tuneMix: document.getElementById('tuneMix'),
  tuneStatus: document.getElementById('tuneStatus'),
  pitchDetected: document.getElementById('pitchDetected'),
  pitchTarget: document.getElementById('pitchTarget'),
  eqLow: document.getElementById('eqLow'),
  eqMid: document.getElementById('eqMid'),
  eqHigh: document.getElementById('eqHigh'),
  gateEnabled: document.getElementById('gateEnabled'),
  gateThreshold: document.getElementById('gateThreshold'),
  gateReduction: document.getElementById('gateReduction'),
  compressorEnabled: document.getElementById('compressorEnabled'),
  compressorThreshold: document.getElementById('compressorThreshold'),
  compressorRatio: document.getElementById('compressorRatio'),
  compressorAttack: document.getElementById('compressorAttack'),
  compressorRelease: document.getElementById('compressorRelease'),
  limiterEnabled: document.getElementById('limiterEnabled'),
  limiterThreshold: document.getElementById('limiterThreshold'),
  micPreset: document.getElementById('micPreset'),
  specialFx: document.getElementById('specialFx')
};

const state = {
  live: false,
  audioContext: null,
  stream: null,
  nodes: null,
  analyser: null,
  gateAnalyser: null,
  pitchInterval: null,
  gateInterval: null,
  smoothedRatio: 1,
  outputReady: false
};

const setStatus = (label, meta, live = false) => {
  ui.statusLabel.textContent = label;
  ui.statusMeta.textContent = meta;
  ui.statusLight.classList.toggle('live', live);
};

const dbToGain = (db) => Math.pow(10, db / 20);
const semitoneToRatio = (semitones) => Math.pow(2, semitones / 12);

const buildImpulse = (context, seconds, decay) => {
  const sampleRate = context.sampleRate;
  const length = sampleRate * seconds;
  const impulse = context.createBuffer(2, length, sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const channelData = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
};

const autoCorrelate = (buffer, sampleRate) => {
  const size = buffer.length;
  let rms = 0;
  for (let i = 0; i < size; i += 1) {
    const val = buffer[i];
    rms += val * val;
  }
  rms = Math.sqrt(rms / size);
  if (rms < 0.01) {
    return -1;
  }

  let r1 = 0;
  let r2 = size - 1;
  const threshold = 0.2;
  for (let i = 0; i < size / 2; i += 1) {
    if (Math.abs(buffer[i]) < threshold) {
      r1 = i;
      break;
    }
  }
  for (let i = 1; i < size / 2; i += 1) {
    if (Math.abs(buffer[size - i]) < threshold) {
      r2 = size - i;
      break;
    }
  }

  const trimmed = buffer.slice(r1, r2);
  const newSize = trimmed.length;
  const corr = new Array(newSize).fill(0);
  for (let lag = 0; lag < newSize; lag += 1) {
    for (let i = 0; i < newSize - lag; i += 1) {
      corr[lag] += trimmed[i] * trimmed[i + lag];
    }
  }

  let d = 0;
  while (d < newSize - 1 && corr[d] > corr[d + 1]) {
    d += 1;
  }

  let maxVal = -1;
  let maxPos = -1;
  for (let i = d; i < newSize; i += 1) {
    if (corr[i] > maxVal) {
      maxVal = corr[i];
      maxPos = i;
    }
  }

  if (maxPos <= 0) {
    return -1;
  }

  let t0 = maxPos;
  if (maxPos < newSize - 1) {
    const x1 = corr[maxPos - 1];
    const x2 = corr[maxPos];
    const x3 = corr[maxPos + 1];
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    if (a) {
      t0 -= b / (2 * a);
    }
  }

  return sampleRate / t0;
};

const frequencyToNote = (frequency) => {
  const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
  const midi = Math.round(noteNum) + 69;
  const target = 440 * Math.pow(2, (midi - 69) / 12);
  return { midi, target };
};

const noteName = (midi) => {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midi / 12) - 1;
  const name = names[midi % 12];
  return `${name}${octave}`;
};

const updatePitch = () => {
  if (!state.analyser || !state.nodes) {
    return;
  }

  const buffer = new Float32Array(state.analyser.fftSize);
  state.analyser.getFloatTimeDomainData(buffer);
  const freq = autoCorrelate(buffer, state.audioContext.sampleRate);
  if (freq === -1) {
    ui.pitchDetected.textContent = '--';
    ui.pitchTarget.textContent = '--';
    return;
  }

  const { midi, target } = frequencyToNote(freq);
  ui.pitchDetected.textContent = `${freq.toFixed(1)} Hz`;
  ui.pitchTarget.textContent = `${noteName(midi)} (${target.toFixed(1)} Hz)`;

  const param = state.nodes.pitchAuto.parameters.get('pitchRatio');
  if (!ui.tuneEnabled.checked) {
    param.setTargetAtTime(1, state.audioContext.currentTime, 0.02);
    return;
  }

  const ratio = target / freq;
  const strength = Number(ui.tuneStrength.value);
  const adjusted = 1 + (ratio - 1) * strength;
  state.smoothedRatio = state.smoothedRatio * 0.85 + adjusted * 0.15;
  param.setTargetAtTime(state.smoothedRatio, state.audioContext.currentTime, 0.03);
};

const startPitchLoop = () => {
  if (state.pitchInterval) {
    clearInterval(state.pitchInterval);
  }
  state.pitchInterval = setInterval(updatePitch, 80);
};

const stopPitchLoop = () => {
  if (state.pitchInterval) {
    clearInterval(state.pitchInterval);
    state.pitchInterval = null;
  }
  ui.pitchDetected.textContent = '--';
  ui.pitchTarget.textContent = '--';
};

const startGateLoop = () => {
  if (state.gateInterval) {
    clearInterval(state.gateInterval);
  }
  state.gateInterval = setInterval(() => {
    if (!state.nodes || !state.gateAnalyser) {
      return;
    }
    if (!ui.gateEnabled.checked) {
      state.nodes.gateGain.gain.setTargetAtTime(1, state.audioContext.currentTime, 0.05);
      return;
    }
    const buffer = new Float32Array(state.gateAnalyser.fftSize);
    state.gateAnalyser.getFloatTimeDomainData(buffer);
    let sum = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      sum += buffer[i] * buffer[i];
    }
    const rms = Math.sqrt(sum / buffer.length);
    const threshold = Number(ui.gateThreshold.value);
    const reductionDb = Number(ui.gateReduction.value);
    const closedGain = dbToGain(reductionDb);
    const target = rms >= threshold ? 1 : closedGain;
    state.nodes.gateGain.gain.setTargetAtTime(target, state.audioContext.currentTime, 0.05);
  }, 50);
};

const stopGateLoop = () => {
  if (state.gateInterval) {
    clearInterval(state.gateInterval);
    state.gateInterval = null;
  }
};

const computeEchoTime = () => {
  if (!ui.echoSync.checked) {
    return Number(ui.echoTime.value);
  }
  const bpm = Number(ui.echoTempo.value);
  const division = Number(ui.echoDivision.value);
  return (60 / bpm) * division;
};

const applyEcho = () => {
  const sync = ui.echoSync.checked;
  ui.echoTime.disabled = sync;
  if (!state.nodes) {
    return;
  }
  const { echoGain, delay, feedback } = state.nodes;
  const enabled = ui.echoEnabled.checked;
  echoGain.gain.value = enabled ? Number(ui.echoMix.value) : 0;
  delay.delayTime.value = computeEchoTime();
  feedback.gain.value = Number(ui.echoFeedback.value);
};

const applyReverb = () => {
  if (!state.nodes) {
    return;
  }
  const { reverbGain, convolver } = state.nodes;
  const enabled = ui.reverbEnabled.checked;
  reverbGain.gain.value = enabled ? Number(ui.reverbMix.value) : 0;
  const room = Number(ui.reverbRoom.value);
  const damp = Number(ui.reverbDamp.value);
  convolver.buffer = buildImpulse(state.audioContext, room, damp);
};

const applyChorus = () => {
  if (!state.nodes) {
    return;
  }
  const { chorusGain, chorusDelay, chorusLfo, chorusLfoGain } = state.nodes;
  const enabled = ui.chorusEnabled.checked;
  chorusGain.gain.value = enabled ? Number(ui.chorusMix.value) : 0;
  chorusDelay.delayTime.value = 0.025;
  chorusLfo.frequency.value = Number(ui.chorusRate.value);
  chorusLfoGain.gain.value = Number(ui.chorusDepth.value);
};

const applyFlanger = () => {
  if (!state.nodes) {
    return;
  }
  const { flangerGain, flangerDelay, flangerFeedback, flangerLfo, flangerLfoGain } = state.nodes;
  const enabled = ui.flangerEnabled.checked;
  flangerGain.gain.value = enabled ? Number(ui.flangerMix.value) : 0;
  flangerDelay.delayTime.value = 0.006;
  flangerFeedback.gain.value = Number(ui.flangerFeedback.value);
  flangerLfo.frequency.value = Number(ui.flangerRate.value);
  flangerLfoGain.gain.value = Number(ui.flangerDepth.value);
};

const applyPhaser = () => {
  if (!state.nodes) {
    return;
  }
  const { phaserGain, phaserFilters, phaserLfo, phaserLfoGain } = state.nodes;
  const enabled = ui.phaserEnabled.checked;
  phaserGain.gain.value = enabled ? Number(ui.phaserMix.value) : 0;
  phaserLfo.frequency.value = Number(ui.phaserRate.value);
  phaserLfoGain.gain.value = Number(ui.phaserDepth.value);
  phaserFilters.forEach((filter) => {
    filter.frequency.value = 1200;
    filter.Q.value = 6;
  });
};

const applyPitchShift = () => {
  if (!state.nodes) {
    return;
  }
  const ratio = semitoneToRatio(Number(ui.pitchShift.value));
  const param = state.nodes.pitchManual.parameters.get('pitchRatio');
  param.setTargetAtTime(ratio, state.audioContext.currentTime, 0.03);
  state.nodes.pitchManualGain.gain.value = Number(ui.pitchMix.value);
};

const applyHarmony = () => {
  if (!state.nodes) {
    return;
  }
  const enabled = ui.harmonyEnabled.checked;
  const ratio = semitoneToRatio(Number(ui.harmonyShift.value));
  const param = state.nodes.pitchHarmony.parameters.get('pitchRatio');
  param.setTargetAtTime(ratio, state.audioContext.currentTime, 0.03);
  state.nodes.harmonyGain.gain.value = enabled ? Number(ui.harmonyMix.value) : 0;
};

const applyTune = () => {
  if (!state.nodes) {
    return;
  }
  const enabled = ui.tuneEnabled.checked;
  state.nodes.tuneGain.gain.value = enabled ? Number(ui.tuneMix.value) : 0;
  ui.tuneStatus.textContent = enabled ? 'Auto-tune is active (experimental).' : 'Auto-tune is off.';
};

const applyEQ = () => {
  if (!state.nodes) {
    return;
  }
  const { eqLow, eqMid, eqHigh } = state.nodes;
  eqLow.gain.value = Number(ui.eqLow.value);
  eqMid.gain.value = Number(ui.eqMid.value);
  eqHigh.gain.value = Number(ui.eqHigh.value);
};

const applyGateSettings = () => {
  if (!state.nodes) {
    return;
  }
  if (!ui.gateEnabled.checked) {
    state.nodes.gateGain.gain.setTargetAtTime(1, state.audioContext.currentTime, 0.05);
  }
};

const applyCompressor = () => {
  if (!state.nodes) {
    return;
  }
  const enabled = ui.compressorEnabled.checked;
  const compressor = state.nodes.compressor;
  if (!enabled) {
    compressor.threshold.value = 0;
    compressor.ratio.value = 1;
    return;
  }
  compressor.threshold.value = Number(ui.compressorThreshold.value);
  compressor.ratio.value = Number(ui.compressorRatio.value);
  compressor.attack.value = Number(ui.compressorAttack.value);
  compressor.release.value = Number(ui.compressorRelease.value);
};

const applyLimiter = () => {
  if (!state.nodes) {
    return;
  }
  const enabled = ui.limiterEnabled.checked;
  const limiter = state.nodes.limiter;
  if (!enabled) {
    limiter.threshold.value = 0;
    limiter.ratio.value = 1;
    return;
  }
  limiter.threshold.value = Number(ui.limiterThreshold.value);
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.05;
};

const applyBalance = () => {
  if (!state.nodes) {
    return;
  }
  state.nodes.panner.pan.value = Number(ui.balance.value);
};

const applyMaster = () => {
  if (!state.nodes) {
    return;
  }
  state.nodes.master.gain.value = Number(ui.masterGain.value);
};

const applyOutputDevice = async () => {
  if (!state.audioContext) {
    return;
  }
  const outputId = ui.outputDevice.value;
  if (!outputId) {
    return;
  }
  if (typeof state.audioContext.setSinkId === 'function') {
    try {
      await state.audioContext.setSinkId(outputId);
      state.outputReady = true;
    } catch (err) {
      setStatus('Warning', 'Output device could not be selected');
    }
  } else if (!state.outputReady) {
    setStatus('Warning', 'Output selection not supported on this system');
    state.outputReady = true;
  }
};

const refreshDeviceList = async () => {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs = devices.filter((device) => device.kind === 'audioinput');
  const outputs = devices.filter((device) => device.kind === 'audiooutput');

  const currentInput = ui.inputDevice.value;
  const currentOutput = ui.outputDevice.value;

  ui.inputDevice.innerHTML = '';
  ui.outputDevice.innerHTML = '';

  const inputPlaceholder = document.createElement('option');
  inputPlaceholder.value = '';
  inputPlaceholder.textContent = inputs.length ? 'Default microphone' : 'No microphone found';
  ui.inputDevice.appendChild(inputPlaceholder);

  inputs.forEach((device, index) => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.textContent = device.label || `Microphone ${index + 1}`;
    ui.inputDevice.appendChild(option);
  });

  const outputPlaceholder = document.createElement('option');
  outputPlaceholder.value = '';
  outputPlaceholder.textContent = outputs.length ? 'Default output' : 'No output found';
  ui.outputDevice.appendChild(outputPlaceholder);

  outputs.forEach((device, index) => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.textContent = device.label || `Output ${index + 1}`;
    ui.outputDevice.appendChild(option);
  });

  ui.inputDevice.value = inputs.some((device) => device.deviceId === currentInput)
    ? currentInput
    : '';
  ui.outputDevice.value = outputs.some((device) => device.deviceId === currentOutput)
    ? currentOutput
    : '';
};

const setControlValue = (control, value) => {
  control.value = value;
};

const applyPreset = (preset) => {
  if (!preset) {
    return;
  }
  const presets = {
    male: {
      eqLow: 3,
      eqMid: 1,
      eqHigh: -1,
      reverbMix: 0.2,
      echoMix: 0.2,
      compressorThreshold: -20,
      compressorRatio: 3
    },
    female: {
      eqLow: -2,
      eqMid: 1,
      eqHigh: 3,
      reverbMix: 0.25,
      echoMix: 0.25,
      compressorThreshold: -18,
      compressorRatio: 3.5
    },
    child: {
      eqLow: -4,
      eqMid: 2,
      eqHigh: 4,
      reverbMix: 0.35,
      echoMix: 0.3,
      compressorThreshold: -22,
      compressorRatio: 3
    },
    studio: {
      reverbMix: 0.18,
      echoMix: 0.12,
      compressorThreshold: -16,
      compressorRatio: 4,
      gateThreshold: 0.03,
      gateReduction: -36
    },
    live: {
      reverbMix: 0.45,
      echoMix: 0.38,
      echoFeedback: 0.4,
      compressorThreshold: -22,
      compressorRatio: 2.5
    },
    hall: {
      reverbMix: 0.6,
      reverbRoom: 1.9,
      reverbDamp: 2.6,
      echoMix: 0.2
    },
    dangdut: {
      echoMix: 0.5,
      echoFeedback: 0.45,
      reverbMix: 0.4,
      eqLow: 2,
      eqHigh: 2
    },
    pop: {
      echoMix: 0.25,
      reverbMix: 0.25,
      eqMid: 2,
      compressorThreshold: -18,
      compressorRatio: 3.5
    },
    rock: {
      echoMix: 0.2,
      reverbMix: 0.15,
      eqLow: 3,
      eqMid: 2,
      eqHigh: 1,
      compressorThreshold: -14,
      compressorRatio: 4.5
    }
  };

  const config = presets[preset];
  if (!config) {
    return;
  }

  Object.entries(config).forEach(([key, value]) => {
    if (ui[key]) {
      setControlValue(ui[key], value);
    }
  });

  applyEQ();
  applyEcho();
  applyReverb();
  applyCompressor();
  applyGateSettings();
};

const applySpecialFx = (fx) => {
  if (!fx) {
    return;
  }
  const presets = {
    robot: {
      phaserEnabled: true,
      phaserRate: 0.45,
      phaserDepth: 900,
      phaserMix: 0.45,
      eqLow: -2,
      eqMid: 4,
      eqHigh: -2
    },
    monster: {
      pitchShift: -6,
      pitchMix: 0.65,
      reverbMix: 0.3,
      eqLow: 5,
      eqMid: -1,
      eqHigh: -4
    },
    chipmunk: {
      pitchShift: 7,
      pitchMix: 0.6,
      chorusEnabled: true,
      chorusMix: 0.4,
      eqHigh: 4
    },
    telephone: {
      eqLow: -12,
      eqMid: 4,
      eqHigh: -12,
      reverbMix: 0.05,
      echoMix: 0
    },
    radio: {
      eqLow: -8,
      eqMid: 3,
      eqHigh: -6,
      phaserEnabled: true,
      phaserMix: 0.2,
      echoMix: 0.1
    }
  };

  const config = presets[fx];
  if (!config) {
    return;
  }

  Object.entries(config).forEach(([key, value]) => {
    if (ui[key] && ui[key].type === 'checkbox') {
      ui[key].checked = Boolean(value);
      return;
    }
    if (ui[key]) {
      setControlValue(ui[key], value);
    }
  });

  applyEQ();
  applyEcho();
  applyReverb();
  applyChorus();
  applyFlanger();
  applyPhaser();
  applyPitchShift();
  applyHarmony();
};

const startSession = async () => {
  ui.toggleSession.disabled = true;
  setStatus('Starting...', 'Requesting microphone access...');

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const hasMic = devices.some((device) => device.kind === 'audioinput');
    if (!hasMic) {
      throw new Error('No microphone device found. Plug it in and try again.');
    }

    const selectedInput = ui.inputDevice.value;
    const audioConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    };
    if (selectedInput) {
      audioConstraints.deviceId = { exact: selectedInput };
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints
    });
    stream.getTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        if (state.live) {
          setStatus('Disconnected', 'Microphone was unplugged');
          stopSession();
        }
      });
    });

    const audioContext = new AudioContext({ latencyHint: 'interactive' });
    await audioContext.audioWorklet.addModule('pitch-processor.js');

    const source = audioContext.createMediaStreamSource(stream);
    const gateGain = audioContext.createGain();
    const eqLow = audioContext.createBiquadFilter();
    const eqMid = audioContext.createBiquadFilter();
    const eqHigh = audioContext.createBiquadFilter();
    const dryGain = audioContext.createGain();

    eqLow.type = 'lowshelf';
    eqLow.frequency.value = 120;
    eqMid.type = 'peaking';
    eqMid.frequency.value = 1000;
    eqMid.Q.value = 1;
    eqHigh.type = 'highshelf';
    eqHigh.frequency.value = 6000;

    const delay = audioContext.createDelay(2.0);
    const feedback = audioContext.createGain();
    const echoGain = audioContext.createGain();

    const convolver = audioContext.createConvolver();
    const reverbGain = audioContext.createGain();

    const chorusDelay = audioContext.createDelay(0.06);
    const chorusGain = audioContext.createGain();
    const chorusLfo = audioContext.createOscillator();
    const chorusLfoGain = audioContext.createGain();

    const flangerDelay = audioContext.createDelay(0.02);
    const flangerFeedback = audioContext.createGain();
    const flangerGain = audioContext.createGain();
    const flangerLfo = audioContext.createOscillator();
    const flangerLfoGain = audioContext.createGain();

    const phaserFilters = Array.from({ length: 4 }, () => audioContext.createBiquadFilter());
    phaserFilters.forEach((filter) => {
      filter.type = 'allpass';
    });
    const phaserGain = audioContext.createGain();
    const phaserLfo = audioContext.createOscillator();
    const phaserLfoGain = audioContext.createGain();

    const pitchManual = new AudioWorkletNode(audioContext, 'pitch-shifter');
    const pitchManualGain = audioContext.createGain();
    const pitchHarmony = new AudioWorkletNode(audioContext, 'pitch-shifter');
    const harmonyGain = audioContext.createGain();
    const pitchAuto = new AudioWorkletNode(audioContext, 'pitch-shifter');
    const tuneGain = audioContext.createGain();

    const master = audioContext.createGain();
    const compressor = audioContext.createDynamicsCompressor();
    const limiter = audioContext.createDynamicsCompressor();
    const panner = audioContext.createStereoPanner();

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    const gateAnalyser = audioContext.createAnalyser();
    gateAnalyser.fftSize = 1024;

    source.connect(analyser);
    source.connect(gateAnalyser);

    source.connect(gateGain);
    gateGain.connect(eqLow);
    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);

    const pre = eqHigh;

    pre.connect(dryGain).connect(master);

    delay.connect(feedback).connect(delay);
    pre.connect(delay);
    delay.connect(echoGain).connect(master);

    convolver.buffer = buildImpulse(audioContext, Number(ui.reverbRoom.value), Number(ui.reverbDamp.value));
    pre.connect(convolver).connect(reverbGain).connect(master);

    chorusLfo.connect(chorusLfoGain).connect(chorusDelay.delayTime);
    pre.connect(chorusDelay).connect(chorusGain).connect(master);

    flangerLfo.connect(flangerLfoGain).connect(flangerDelay.delayTime);
    flangerDelay.connect(flangerFeedback).connect(flangerDelay);
    pre.connect(flangerDelay).connect(flangerGain).connect(master);

    phaserLfo.connect(phaserLfoGain);
    phaserFilters.forEach((filter) => {
      phaserLfoGain.connect(filter.frequency);
    });
    let phaserChain = pre;
    phaserFilters.forEach((filter) => {
      phaserChain.connect(filter);
      phaserChain = filter;
    });
    phaserChain.connect(phaserGain).connect(master);

    pre.connect(pitchManual).connect(pitchManualGain).connect(master);
    pre.connect(pitchHarmony).connect(harmonyGain).connect(master);
    pre.connect(pitchAuto).connect(tuneGain).connect(master);

    master.connect(compressor).connect(limiter).connect(panner).connect(audioContext.destination);

    chorusLfo.type = 'sine';
    chorusLfo.start();
    flangerLfo.type = 'sine';
    flangerLfo.start();
    phaserLfo.type = 'sine';
    phaserLfo.start();

    state.audioContext = audioContext;
    state.stream = stream;
    state.nodes = {
      source,
      gateGain,
      eqLow,
      eqMid,
      eqHigh,
      dryGain,
      delay,
      feedback,
      echoGain,
      convolver,
      reverbGain,
      chorusDelay,
      chorusGain,
      chorusLfo,
      chorusLfoGain,
      flangerDelay,
      flangerFeedback,
      flangerGain,
      flangerLfo,
      flangerLfoGain,
      phaserFilters,
      phaserGain,
      phaserLfo,
      phaserLfoGain,
      pitchManual,
      pitchManualGain,
      pitchHarmony,
      harmonyGain,
      pitchAuto,
      tuneGain,
      master,
      compressor,
      limiter,
      panner
    };
    state.analyser = analyser;
    state.gateAnalyser = gateAnalyser;
    state.smoothedRatio = 1;

    applyMaster();
    applyBalance();
    applyEQ();
    applyEcho();
    applyReverb();
    applyChorus();
    applyFlanger();
    applyPhaser();
    applyPitchShift();
    applyHarmony();
    applyTune();
    applyCompressor();
    applyLimiter();
    applyGateSettings();
    await applyOutputDevice();
    startPitchLoop();
    startGateLoop();

    state.live = true;
    ui.toggleSession.textContent = 'Stop Session';
    ui.toggleSession.disabled = false;
    setStatus('Live', 'Microphone connected', true);
  } catch (err) {
    ui.toggleSession.disabled = false;
    setStatus('Error', err.message || 'Failed to access microphone');
  }
};

const stopSession = async () => {
  ui.toggleSession.disabled = true;
  setStatus('Stopping...', 'Releasing microphone...');

  stopPitchLoop();
  stopGateLoop();

  if (state.stream) {
    state.stream.getTracks().forEach((track) => track.stop());
  }

  if (state.audioContext) {
    await state.audioContext.close();
  }

  state.live = false;
  state.audioContext = null;
  state.stream = null;
  state.nodes = null;
  state.analyser = null;
  state.gateAnalyser = null;
  ui.toggleSession.textContent = 'Start Live Session';
  ui.toggleSession.disabled = false;
  setStatus('Ready', 'No microphone connected');
};

ui.toggleSession.addEventListener('click', () => {
  if (state.live) {
    stopSession();
  } else {
    startSession();
  }
});

ui.masterGain.addEventListener('input', applyMaster);
ui.balance.addEventListener('input', applyBalance);
ui.echoEnabled.addEventListener('change', applyEcho);
ui.echoSync.addEventListener('change', applyEcho);
ui.echoTempo.addEventListener('input', applyEcho);
ui.echoDivision.addEventListener('change', applyEcho);
ui.echoTime.addEventListener('input', applyEcho);
ui.echoFeedback.addEventListener('input', applyEcho);
ui.echoMix.addEventListener('input', applyEcho);
ui.reverbEnabled.addEventListener('change', applyReverb);
ui.reverbRoom.addEventListener('input', applyReverb);
ui.reverbDamp.addEventListener('input', applyReverb);
ui.reverbMix.addEventListener('input', applyReverb);
ui.chorusEnabled.addEventListener('change', applyChorus);
ui.chorusRate.addEventListener('input', applyChorus);
ui.chorusDepth.addEventListener('input', applyChorus);
ui.chorusMix.addEventListener('input', applyChorus);
ui.flangerEnabled.addEventListener('change', applyFlanger);
ui.flangerRate.addEventListener('input', applyFlanger);
ui.flangerDepth.addEventListener('input', applyFlanger);
ui.flangerFeedback.addEventListener('input', applyFlanger);
ui.flangerMix.addEventListener('input', applyFlanger);
ui.phaserEnabled.addEventListener('change', applyPhaser);
ui.phaserRate.addEventListener('input', applyPhaser);
ui.phaserDepth.addEventListener('input', applyPhaser);
ui.phaserMix.addEventListener('input', applyPhaser);
ui.pitchShift.addEventListener('input', applyPitchShift);
ui.pitchMix.addEventListener('input', applyPitchShift);
ui.harmonyEnabled.addEventListener('change', applyHarmony);
ui.harmonyShift.addEventListener('input', applyHarmony);
ui.harmonyMix.addEventListener('input', applyHarmony);
ui.tuneEnabled.addEventListener('change', applyTune);
ui.tuneMix.addEventListener('input', applyTune);
ui.tuneStrength.addEventListener('input', () => {
  ui.tuneStatus.textContent = ui.tuneEnabled.checked
    ? 'Auto-tune is active (experimental).'
    : 'Auto-tune is off.';
});
ui.eqLow.addEventListener('input', applyEQ);
ui.eqMid.addEventListener('input', applyEQ);
ui.eqHigh.addEventListener('input', applyEQ);
ui.gateEnabled.addEventListener('change', applyGateSettings);
ui.gateThreshold.addEventListener('input', applyGateSettings);
ui.gateReduction.addEventListener('input', applyGateSettings);
ui.compressorEnabled.addEventListener('change', applyCompressor);
ui.compressorThreshold.addEventListener('input', applyCompressor);
ui.compressorRatio.addEventListener('input', applyCompressor);
ui.compressorAttack.addEventListener('input', applyCompressor);
ui.compressorRelease.addEventListener('input', applyCompressor);
ui.limiterEnabled.addEventListener('change', applyLimiter);
ui.limiterThreshold.addEventListener('input', applyLimiter);
ui.micPreset.addEventListener('change', (event) => {
  applyPreset(event.target.value);
});
ui.specialFx.addEventListener('change', (event) => {
  applySpecialFx(event.target.value);
});

setStatus('Ready', 'No microphone connected');

navigator.mediaDevices.addEventListener('devicechange', async () => {
  await refreshDeviceList();
  if (!state.live) {
    return;
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  const hasMic = devices.some((device) => device.kind === 'audioinput');
  if (!hasMic) {
    setStatus('Disconnected', 'Microphone not found');
    stopSession();
  }
});

ui.inputDevice.addEventListener('change', async () => {
  if (state.live) {
    await stopSession();
    startSession();
  }
});

ui.outputDevice.addEventListener('change', applyOutputDevice);

refreshDeviceList();
