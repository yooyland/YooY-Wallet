const fs = require('fs');
const path = require('path');

function tryPatch(file, patcher) {
  try {
    if (!fs.existsSync(file)) return;
    const before = fs.readFileSync(file, 'utf8');
    const after = patcher(before);
    if (after !== before) {
      fs.writeFileSync(file, after, 'utf8');
      console.log('[patch-rngh] Patched:', path.relative(process.cwd(), file));
    } else {
      console.log('[patch-rngh] No changes needed for', path.basename(file));
    }
  } catch (e) {
    console.log('[patch-rngh] Skip', file, e.message);
  }
}

function main() {
  const rnghFile = path.join(
    process.cwd(),
    'node_modules',
    'react-native-gesture-handler',
    'android',
    'src',
    'main',
    'java',
    'com',
    'swmanta'.replace('ta', 'nsion'), // build full segment 'swmansion' without confusing patch parser
    'gesturehandler',
    'react',
    'RNGestureHandler' + 'TouchEvent.kt'
  );

  tryPatch(rnghFile, (code) => {
    let patched = code;
    // Ensure UIManagerHelper.getSurfaceId receives a non-null Context or View
    // Handle common patterns in RNGH 2.16/2.17 sources
    // reactContext -> Context
    patched = patched.replace(
      /UIManagerHelper\.getSurfaceId\(\s*reactContext\s*\)/g,
      'UIManagerHelper.getSurfaceId((reactContext as android.content.Context))'
    );
    // context -> Context
    patched = patched.replace(
      /UIManagerHelper\.getSurfaceId\(\s*(?:this\.)?context\s*\)/g,
      'UIManagerHelper.getSurfaceId((context as android.content.Context))'
    );
    // Prefer context variant explicitly to avoid overload mismatch
    patched = patched.replace(
      /UIManagerHelper\.getSurfaceId\(\s*handler\.view!!\s*\)/g,
      'UIManagerHelper.getSurfaceId(handler.view!!.getContext())'
    );
    patched = patched.replace(
      /UIManagerHelper\.getSurfaceId\(\s*([A-Za-z0-9_]+)\.view!!\s*\)/g,
      'UIManagerHelper.getSurfaceId($1.view!!.getContext())'
    );
    patched = patched.replace(
      /UIManagerHelper\.getSurfaceId\(\s*([A-Za-z0-9_]+)\.view\s*\)/g,
      'UIManagerHelper.getSurfaceId($1.view.getContext())'
    );
    // Fallback: plain 'view' symbol
    patched = patched.replace(
      /UIManagerHelper\.getSurfaceId\(\s*view\s*\)/g,
      'UIManagerHelper.getSurfaceId(view.getContext())'
    );
    return patched;
  });
}

main();


