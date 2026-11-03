'use client';

/**
 * Web Audio sound engine for Basedly.
 *
 * Procedurally synthesised in real time using the Web Audio API — zero audio
 * file downloads, zero latency, runs offline, and works everywhere.
 */

let ctx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      ctx = new AudioCtx();
    }
  }
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume();
  }
  return ctx;
}

function isSoundAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem('sorro-prefs');
    if (!raw) return true;
    const p = JSON.parse(raw) as { soundEnabled?: boolean };
    return p.soundEnabled !== false;
  } catch {
    return true;
  }
}

function getEquippedSoundPack(): string {
  if (typeof window === 'undefined') return 'classic';
  try {
    const raw = localStorage.getItem('sorro-user-equipped-v1');
    if (!raw) return 'classic';
    const parsed = JSON.parse(raw) as { soundPack?: string };
    return parsed.soundPack || 'classic';
  } catch {
    return 'classic';
  }
}

/** Crisp, satisfying checkmark / tick sound with custom sound pack support */
export function playTick() {
  if (!isSoundAllowed()) return;
  const ac = getAudioContext();
  if (!ac) return;

  const pack = getEquippedSoundPack();
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();

  if (pack === 'arcade') {
    // 8-bit chiptune coin ding
    osc.type = 'square';
    osc.frequency.setValueAtTime(987.77, now); // B5
    osc.frequency.setValueAtTime(1318.51, now + 0.05); // E6
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(now);
    osc.stop(now + 0.19);
    return;
  }

  if (pack === 'zen') {
    // Bamboo woodblock clack
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.06);
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(now);
    osc.stop(now + 0.1);
    return;
  }

  // Classic sine ping
  osc.type = 'sine';
  osc.frequency.setValueAtTime(580, now);
  osc.frequency.exponentialRampToValueAtTime(880, now + 0.04);
  osc.frequency.exponentialRampToValueAtTime(1320, now + 0.08);

  gain.gain.setValueAtTime(0.18, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

  osc.connect(gain);
  gain.connect(ac.destination);

  osc.start(now);
  osc.stop(now + 0.13);
}

/** Soft tactile mechanical click */
export function playClick() {
  if (!isSoundAllowed()) return;
  const ac = getAudioContext();
  if (!ac) return;

  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(320, now);
  osc.frequency.exponentialRampToValueAtTime(140, now + 0.035);

  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

  osc.connect(gain);
  gain.connect(ac.destination);

  osc.start(now);
  osc.stop(now + 0.045);
}

/** Uplifting celebration arpeggio for rank ups and quest completion */
export function playCelebration() {
  if (!isSoundAllowed()) return;
  const ac = getAudioContext();
  if (!ac) return;

  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
  const baseTime = ac.currentTime;

  notes.forEach((freq, idx) => {
    const now = baseTime + idx * 0.08;
    const osc = ac.createOscillator();
    const gain = ac.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(gain);
    gain.connect(ac.destination);

    osc.start(now);
    osc.stop(now + 0.5);
  });
}

/** Tibetan singing bowl / focus bell for Pomodoro intervals */
export function playFocusBell() {
  if (!isSoundAllowed()) return;
  const ac = getAudioContext();
  if (!ac) return;

  const now = ac.currentTime;
  const fundamentals = [528, 1056, 1584];
  const gains = [0.22, 0.08, 0.03];

  fundamentals.forEach((freq, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(gains[i], now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);

    osc.connect(gain);
    gain.connect(ac.destination);

    osc.start(now);
    osc.stop(now + 2.3);
  });
}

/* -------------------------------------------------------- ambient generator */

export type AmbientSound = 'off' | 'rain' | 'whitenoise' | 'brownnoise' | 'cafe';

let ambientSource: AudioNode | null = null;
let ambientGain: GainNode | null = null;

export function stopAmbient() {
  if (ambientGain && ctx) {
    try {
      ambientGain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      setTimeout(() => {
        ambientSource?.disconnect();
        ambientGain?.disconnect();
        ambientSource = null;
        ambientGain = null;
      }, 350);
    } catch {
      ambientSource = null;
      ambientGain = null;
    }
  }
}

export function startAmbient(type: AmbientSound, volume = 0.35) {
  stopAmbient();
  if (type === 'off' || !isSoundAllowed()) return;

  const ac = getAudioContext();
  if (!ac) return;

  const bufferSize = ac.sampleRate * 2;
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const data = buffer.getChannelData(0);

  let lastOut = 0.0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    if (type === 'brownnoise' || type === 'rain') {
      lastOut = (lastOut + 0.02 * white) / 1.02;
      data[i] = lastOut * 3.5;
    } else {
      data[i] = white * 0.15;
    }
  }

  const noise = ac.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;

  const filter = ac.createBiquadFilter();
  if (type === 'rain') {
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, ac.currentTime);
  } else if (type === 'brownnoise') {
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, ac.currentTime);
  } else if (type === 'cafe') {
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(700, ac.currentTime);
    filter.Q.setValueAtTime(1.2, ac.currentTime);
  } else {
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, ac.currentTime);
  }

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.001, ac.currentTime);
  gain.gain.linearRampToValueAtTime(Math.min(1, Math.max(0, volume)), ac.currentTime + 0.4);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ac.destination);

  noise.start();
  ambientSource = noise;
  ambientGain = gain;
}

export function setAmbientVolume(vol: number) {
  if (ambientGain && ctx) {
    ambientGain.gain.setValueAtTime(Math.min(1, Math.max(0, vol)), ctx.currentTime);
  }
}
