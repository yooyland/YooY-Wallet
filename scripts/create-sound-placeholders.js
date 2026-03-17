#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

// Minimal valid WAV (44 bytes): RIFF header + fmt + data with 0 samples
const MINIMAL_WAV = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
  0x66, 0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
  0x22, 0x56, 0x00, 0x00, 0x44, 0xac, 0x00, 0x00, 0x02, 0x00, 0x10, 0x00,
  0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00
]);

const FILES = [
  'gold_notification.wav',
  'simple_notification.wav',
  'urgent_notification.wav',
  'coin_reward.wav',
  'dm_message.wav',
  'mention_alert.wav',
  'system_notice.wav',
  'warning_alert.wav'
];

const dir = path.join(__dirname, '..', 'assets', 'sounds');
fs.mkdirSync(dir, { recursive: true });
FILES.forEach(name => {
  fs.writeFileSync(path.join(dir, name), MINIMAL_WAV);
  console.log('Created', name);
});
console.log('Done. Replace these with real YooY Land .wav files when ready.');
