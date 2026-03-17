#!/usr/bin/env node
'use strict';
/**
 * Generates real WAV files with audible tones for YooY Land notification sounds.
 * 8 kHz, 16-bit mono, ~0.35s. Each file uses a distinct frequency so options are distinguishable.
 * Replace these with final YooY Land .wav assets when available.
 */
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 8000;
const BIT_DEPTH = 16;
const DURATION_SEC = 0.35;

function createWavWithTone(freqHz) {
  const numSamples = Math.floor(SAMPLE_RATE * DURATION_SEC);
  const dataSize = numSamples * 2; // 16-bit = 2 bytes per sample
  const buffer = Buffer.alloc(44 + dataSize);
  let offset = 0;

  function writeU32LE(v) {
    buffer.writeUInt32LE(v, offset);
    offset += 4;
  }
  function writeU16LE(v) {
    buffer.writeUInt16LE(v, offset);
    offset += 2;
  }
  function writeStr(s) {
    buffer.write(s, offset);
    offset += s.length;
  }

  writeStr('RIFF');
  writeU32LE(36 + dataSize);
  writeStr('WAVE');
  writeStr('fmt ');
  writeU32LE(16);
  writeU16LE(1);   // PCM
  writeU16LE(1);   // mono
  writeU32LE(SAMPLE_RATE);
  writeU32LE(SAMPLE_RATE * 2);
  writeU16LE(2);
  writeU16LE(BIT_DEPTH);
  writeStr('data');
  writeU32LE(dataSize);

  const amplitude = 8000;
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const sample = Math.round(amplitude * Math.sin(2 * Math.PI * freqHz * t));
    const clamped = Math.max(-32768, Math.min(32767, sample));
    buffer.writeInt16LE(clamped, offset);
    offset += 2;
  }
  return buffer;
}

const FILES = [
  { name: 'gold_notification.wav', freq: 523 },
  { name: 'simple_notification.wav', freq: 440 },
  { name: 'urgent_notification.wav', freq: 659 },
  { name: 'coin_reward.wav', freq: 784 },
  { name: 'dm_message.wav', freq: 587 },
  { name: 'mention_alert.wav', freq: 698 },
  { name: 'system_notice.wav', freq: 494 },
  { name: 'warning_alert.wav', freq: 622 },
  { name: 'system_default.wav', freq: 440 },
];

const dir = path.join(__dirname, '..', 'assets', 'sounds');
fs.mkdirSync(dir, { recursive: true });
FILES.forEach(({ name, freq }) => {
  const wav = createWavWithTone(freq);
  fs.writeFileSync(path.join(dir, name), wav);
  console.log('Generated', name, `(${wav.length} bytes, ${freq} Hz)`);
});
console.log('Done. Replace with final YooY Land .wav files when ready.');
