/**
 * Expo web static export가 entry 번들을 일반 <script defer>로 넣으면
 * 번들 내 import.meta 가 SyntaxError: Cannot use 'import.meta' outside a module 을 일으킴.
 * _expo/static/js/web/entry-*.js 로드 태그에 type="module" 부여.
 */
const fs = require('fs');
const path = require('path');

const webDist = path.join(__dirname, '..', 'web-dist');
const ENTRY_SCRIPT_RE = /<script src="([^"]*\/_expo\/static\/js\/web\/entry-[^"]+\.js)" defer><\/script>/g;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.isFile() && ent.name.endsWith('.html')) out.push(p);
  }
  return out;
}

function sleepMs(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {}
}

function safeWriteFileSync(targetPath, content) {
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  const tmp = path.join(dir, `.${base}.tmp-${process.pid}-${Date.now()}`);

  let lastErr = null;
  // Windows에서 간헐적인 파일 잠금/UNKNOWN 에러가 있어 재시도
  for (let i = 0; i < 5; i++) {
    try {
      fs.writeFileSync(tmp, content, 'utf8');
      try {
        fs.renameSync(tmp, targetPath);
      } catch (e) {
        // rename이 실패하면 write로 폴백
        fs.writeFileSync(targetPath, content, 'utf8');
        try { fs.unlinkSync(tmp); } catch {}
      }
      return;
    } catch (e) {
      lastErr = e;
      try { fs.unlinkSync(tmp); } catch {}
      // backoff: 30ms, 60ms, 120ms...
      sleepMs(30 * Math.pow(2, i));
    }
  }
  throw lastErr;
}

let patched = 0;
let failed = 0;
for (const file of walk(webDist)) {
  try {
    const html = fs.readFileSync(file, 'utf8');
    const next = html.replace(
      ENTRY_SCRIPT_RE,
      '<script type="module" src="$1" defer></script>'
    );
    if (next !== html) {
      safeWriteFileSync(file, next);
      patched += 1;
      console.log('[patch-web-modules]', path.relative(webDist, file));
    }
  } catch (e) {
    failed += 1;
    console.warn('[patch-web-modules] failed:', path.relative(webDist, file), String(e && e.message ? e.message : e));
  }
}
console.log('[patch-web-modules] done, files patched:', patched, 'failed:', failed);
