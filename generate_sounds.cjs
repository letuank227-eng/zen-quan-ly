const fs = require('fs');
const path = require('path');

const publicSoundsDir = path.resolve(__dirname, 'client', 'public', 'sounds');
if (!fs.existsSync(publicSoundsDir)) {
  fs.mkdirSync(publicSoundsDir, { recursive: true });
}

function createWav(sampleRate, durationSec, generateSample) {
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);

  // data subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let s = generateSample(t);
    s = Math.max(-1, Math.min(1, s));
    const intSample = Math.floor(s * 32767);
    buffer.writeInt16LE(intSample, 44 + i * 2);
  }

  return buffer;
}

const sampleRate = 44100;

// Dual distinct "TING ... TING!" chime (Facebook / Messenger / Doorbell style)
// 1st TING: t = 0.0s (C6 - 1046.5 Hz + harmonics)
// 2nd TING: t = 0.25s (E6 - 1318.5 Hz + harmonics), clearly separated!
const tingBuffer = createWav(sampleRate, 0.9, (t) => {
  let val = 0;

  // --- TIẾNG TING THỨ 1 (0.0s -> 0.22s) ---
  if (t >= 0 && t < 0.23) {
    const attack = Math.min(1, t / 0.005); // 5ms attack
    const decay = Math.exp(-t * 16); // crisp decay
    const f1 = 1046.5; // C6
    const tone = Math.sin(2 * Math.PI * f1 * t) +
                 0.4 * Math.sin(2 * Math.PI * f1 * 2 * t) +
                 0.15 * Math.sin(2 * Math.PI * f1 * 3 * t);
    val += tone * attack * decay * 0.85;
  }

  // --- TIẾNG TING THỨ 2 (0.24s -> 0.9s) ---
  if (t >= 0.24) {
    const t2 = t - 0.24;
    const attack2 = Math.min(1, t2 / 0.005);
    const decay2 = Math.exp(-t2 * 10); // longer resonant decay
    const f2 = 1318.51; // E6 (higher and brighter)
    const tone2 = Math.sin(2 * Math.PI * f2 * t2) +
                  0.4 * Math.sin(2 * Math.PI * f2 * 2 * t2) +
                  0.15 * Math.sin(2 * Math.PI * f2 * 3 * t2);
    val += tone2 * attack2 * decay2 * 0.95;
  }

  return val;
});
fs.writeFileSync(path.join(publicSoundsDir, 'ting.wav'), tingBuffer);
console.log('Created distinct 2-ting ting.wav successfully, size:', tingBuffer.length);

// Gentle Pop chime for comments
const popBuffer = createWav(sampleRate, 0.55, (t) => {
  let val = 0;
  if (t >= 0 && t < 0.2) {
    const attack = Math.min(1, t / 0.005);
    const decay = Math.exp(-t * 20);
    const tone1 = Math.sin(2 * Math.PI * 880 * t) + 0.25 * Math.sin(2 * Math.PI * 1760 * t);
    val += tone1 * attack * decay * 0.7;
  }
  if (t >= 0.18) {
    const t2 = t - 0.18;
    const attack2 = Math.min(1, t2 / 0.005);
    const decay2 = Math.exp(-t2 * 12);
    const tone2 = Math.sin(2 * Math.PI * 1174.66 * t2) + 0.3 * Math.sin(2 * Math.PI * 2349 * t2);
    val += tone2 * attack2 * decay2 * 0.9;
  }
  return val;
});
fs.writeFileSync(path.join(publicSoundsDir, 'pop.wav'), popBuffer);
console.log('Created pop.wav successfully, size:', popBuffer.length);
