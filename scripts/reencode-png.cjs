/**
 * Re-encode a PNG using pngjs to avoid Android AAPT compile issues
 * (typically caused by unusual chunks, color profiles, or malformed encoding).
 *
 * Usage:
 *   node scripts/reencode-png.cjs assets/images/android-icon-foreground.png
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/reencode-png.cjs <png-path>');
  process.exit(2);
}

const abs = path.isAbsolute(input) ? input : path.join(process.cwd(), input);
if (!fs.existsSync(abs)) {
  console.error('File not found:', abs);
  process.exit(2);
}

const buf = fs.readFileSync(abs);

PNG.sync.read(buf); // validate parse
const png = PNG.sync.read(buf);

// Force RGBA 8-bit encode
const out = PNG.sync.write(png, {
  colorType: 6,
  inputColorType: png.colorType,
  inputHasAlpha: true,
});

const bak = abs + '.bak';
try { fs.copyFileSync(abs, bak); } catch {}
fs.writeFileSync(abs, out);
console.log('[reencode-png] wrote', abs, 'backup:', bak);

