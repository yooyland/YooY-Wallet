/**
 * Re-encode a PNG using jimp-compact (pure JS) to avoid Android AAPT issues.
 *
 * Usage:
 *   node scripts/reencode-png-jimp.cjs assets/images/android-icon-foreground.png
 */
const fs = require('fs');
const path = require('path');

let Jimp = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Jimp = require('jimp-compact');
} catch (e) {
  console.error('jimp-compact not available:', e && e.message ? e.message : e);
  process.exit(3);
}

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/reencode-png-jimp.cjs <png-path>');
  process.exit(2);
}

const abs = path.isAbsolute(input) ? input : path.join(process.cwd(), input);
if (!fs.existsSync(abs)) {
  console.error('File not found:', abs);
  process.exit(2);
}

async function main() {
  const bak = abs + '.bak';
  try { fs.copyFileSync(abs, bak); } catch {}
  const img = await Jimp.read(abs);
  // Ensure 8-bit RGBA encode
  await img.rgba(true);
  await img.writeAsync(abs);
  console.log('[reencode-png-jimp] wrote', abs, 'backup:', bak);
}

main().catch((e) => {
  console.error('Failed:', e && e.message ? e.message : e);
  process.exit(1);
});

