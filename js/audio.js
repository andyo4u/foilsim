// ==============================
// AUDIO -- Wave Energy Sound
// ==============================
// Self-contained Web Audio module.
// Exports initAudio() and updateAudio() for use by main.js.
// Event-listener wiring (click/keydown/touchstart -> initAudio)
// is left to the caller.

let audioCtx = null;
let audioInited = false;
let noiseGain, toneOsc, toneGain, toneFilter, masterGain;

export function initAudio() {
  if (audioInited) return;
  audioInited = true;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.5;
  masterGain.connect(audioCtx.destination);

  // -- Surf whoosh: filtered noise --
  const bufSize = audioCtx.sampleRate * 2;
  const noiseBuf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;

  const noiseNode = audioCtx.createBufferSource();
  noiseNode.buffer = noiseBuf;
  noiseNode.loop = true;

  const noiseFilter = audioCtx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 400;
  noiseFilter.Q.value = 0.8;

  noiseGain = audioCtx.createGain();
  noiseGain.gain.value = 0;

  noiseNode.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(masterGain);
  noiseNode.start();

  // Store filter ref for frequency modulation
  noiseGain._filter = noiseFilter;

  // -- Tonal "pocket" chime: smooth sine --
  toneOsc = audioCtx.createOscillator();
  toneOsc.type = 'sine';
  toneOsc.frequency.value = 220;

  toneFilter = audioCtx.createBiquadFilter();
  toneFilter.type = 'lowpass';
  toneFilter.frequency.value = 600;
  toneFilter.Q.value = 1;

  toneGain = audioCtx.createGain();
  toneGain.gain.value = 0;

  toneOsc.connect(toneFilter);
  toneFilter.connect(toneGain);
  toneGain.connect(masterGain);
  toneOsc.start();

  // -- Secondary harmonic for richer tone --
  const toneOsc2 = audioCtx.createOscillator();
  toneOsc2.type = 'sine';
  toneOsc2.frequency.value = 330;
  const toneGain2 = audioCtx.createGain();
  toneGain2.gain.value = 0;
  toneOsc2.connect(toneGain2);
  toneGain2.connect(masterGain);
  toneOsc2.start();
  toneGain._g2 = toneGain2;
  toneOsc._o2 = toneOsc2;
}

export function updateAudio(slopeForce, normForce, speed) {
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const now = audioCtx.currentTime;
  const sm = 0.08; // smoothing time

  // Speed factor: sound only when moving
  const sf = Math.min(1, speed / 5);

  if (normForce > 0.05) {
    // -- Positive: riding the pocket --
    // Whoosh gets louder and higher-pitched
    const whooshVol = normForce * 0.25 * sf;
    const whooshFreq = 300 + normForce * 600;
    noiseGain.gain.linearRampToValueAtTime(whooshVol, now + sm);
    noiseGain._filter.frequency.linearRampToValueAtTime(whooshFreq, now + sm);

    // Tone: pleasant ascending pitch, louder in the pocket
    const toneVol = normForce * 0.12 * sf;
    const toneFreq = 200 + normForce * 180;
    toneGain.gain.linearRampToValueAtTime(toneVol, now + sm);
    toneOsc.frequency.linearRampToValueAtTime(toneFreq, now + sm);
    toneGain._g2.gain.linearRampToValueAtTime(toneVol * 0.4, now + sm);
    toneOsc._o2.frequency.linearRampToValueAtTime(toneFreq * 1.5, now + sm);
  } else if (normForce < -0.05) {
    // -- Negative: climbing uphill --
    const abN = Math.abs(normForce);
    // Lower, duller whoosh
    const whooshVol = abN * 0.12 * sf;
    const whooshFreq = 150 + abN * 150;
    noiseGain.gain.linearRampToValueAtTime(whooshVol, now + sm);
    noiseGain._filter.frequency.linearRampToValueAtTime(whooshFreq, now + sm);

    // Low droning tone
    const toneVol = abN * 0.06 * sf;
    toneGain.gain.linearRampToValueAtTime(toneVol, now + sm);
    toneOsc.frequency.linearRampToValueAtTime(120, now + sm);
    toneGain._g2.gain.linearRampToValueAtTime(0, now + sm);
  } else {
    // -- Neutral: quiet ambient --
    noiseGain.gain.linearRampToValueAtTime(0.01 * sf, now + sm * 2);
    noiseGain._filter.frequency.linearRampToValueAtTime(250, now + sm);
    toneGain.gain.linearRampToValueAtTime(0, now + sm * 2);
    toneGain._g2.gain.linearRampToValueAtTime(0, now + sm * 2);
  }
}
