import { Alert, Linking, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

function getRNBU(): any {
  try {
    const m = require('react-native-blob-util');
    return m?.default ?? m;
  } catch {
    return null;
  }
}

const FLAG_ACTIVITY_NEW_TASK = 0x10000000;
const FLAG_GRANT_READ_URI_PERMISSION = 0x00000001;

/** Android 7+: file:// 를 외부 Intent로 넘기면 FileUriExposedException — 반드시 content:// 로 바꿈 */
async function ensureAndroidContentUriForIntent(localUri: string, fileNameHint: string): Promise<string> {
  const trimmed = String(localUri || '').trim();
  if (!trimmed) throw new Error('empty_uri');
  if (/^content:\/\//i.test(trimmed)) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    throw new Error('https_uri_must_be_downloaded_first');
  }

  const fileUri = /^file:\/\//i.test(trimmed) ? trimmed : `file://${trimmed}`;

  if (FileSystem.getContentUriAsync) {
    try {
      const c = await FileSystem.getContentUriAsync(fileUri);
      if (c && /^content:\/\//i.test(String(c))) return String(c);
    } catch {
      // DocumentPicker 하위 경로 등에서 실패할 수 있음 → 캐시로 복사 후 재시도
    }
  }

  const safe =
    String(fileNameHint || 'file')
      .replace(/[/\\?*:|"<>]/g, '_')
      .replace(/\s+/g, '_') || 'file';
  const extMatch = safe.match(/\.[a-z0-9]+$/i);
  const ext = extMatch?.[0] || '.bin';
  const base = safe.includes('.') ? safe : `${safe}${ext}`;
  const dest = `${FileSystem.cacheDirectory}yy_share_${Date.now()}_${base}`;
  await FileSystem.copyAsync({ from: fileUri, to: dest });
  const out = await FileSystem.getContentUriAsync(dest);
  if (!out || !/^content:\/\//i.test(String(out))) {
    throw new Error('content_uri_failed');
  }
  return String(out);
}

export async function openAttachmentInExternalApp(opts: {
  uri: string;
  mimeType?: string;
  fileName?: string;
  chooserTitle?: string;
}): Promise<void> {
  const raw = String(opts.uri || '').trim();
  if (!raw) {
    Alert.alert('열기', '파일 주소가 없습니다.');
    return;
  }
  const mime = String(opts.mimeType || '*/*').trim() || '*/*';
  const name = String(opts.fileName || 'file').trim() || 'file';

  if (Platform.OS === 'android') {
    try {
      let openUri = raw;
      if (/^https?:\/\//i.test(openUri)) {
        const extMatch = name.match(/\.[a-z0-9]+$/i);
        const ext = extMatch?.[0] || (mime.includes('pdf') ? '.pdf' : '.bin');
        const dest = `${FileSystem.cacheDirectory}yy_open_${Date.now()}${ext}`;
        const dl = await FileSystem.downloadAsync(openUri, dest);
        openUri = String(dl?.uri || '').trim();
      }
      if (!openUri) throw new Error('download_failed');

      openUri = await ensureAndroidContentUriForIntent(openUri, name);

      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: openUri,
        type: mime,
        flags: FLAG_ACTIVITY_NEW_TASK | FLAG_GRANT_READ_URI_PERMISSION,
      });
      return;
    } catch (e: any) {
      const RNBU = getRNBU();
      if (RNBU?.android?.actionViewIntent) {
        try {
          let forIntent = raw;
          if (/^https?:\/\//i.test(forIntent)) {
            const extMatch = name.match(/\.[a-z0-9]+$/i);
            const ext = extMatch?.[0] || (mime.includes('pdf') ? '.pdf' : '.bin');
            const dest = `${FileSystem.cacheDirectory}yy_open_${Date.now()}${ext}`;
            const dl = await FileSystem.downloadAsync(forIntent, dest);
            forIntent = String(dl?.uri || '').trim();
          }
          forIntent = await ensureAndroidContentUriForIntent(forIntent, name);
          await RNBU.android.actionViewIntent(forIntent, mime, String(opts.chooserTitle || '앱으로 열기'));
          return;
        } catch {}
      }
      Alert.alert('열기 실패', String(e?.message || e || 'intent_failed'));
      return;
    }
  }

  const RNBU = getRNBU();
  if (Platform.OS === 'ios' && RNBU?.ios?.openDocument) {
    try {
      let p = raw;
      if (/^https?:\/\//i.test(raw)) {
        const extMatch = name.match(/\.[a-z0-9]+$/i);
        const ext = extMatch?.[0] || (mime.includes('pdf') ? '.pdf' : '.bin');
        const dest = `${FileSystem.cacheDirectory}yy_open_${Date.now()}${ext}`;
        const dl = await FileSystem.downloadAsync(raw, dest);
        p = String(dl?.uri || '').trim();
      }
      if (!p) throw new Error('download_failed');
      await RNBU.ios.openDocument(p.replace(/^file:\/\//i, ''));
      return;
    } catch {}
  }

  try {
    const can = await Linking.canOpenURL(raw);
    if (!can) {
      Alert.alert('열기 실패', '이 주소를 열 수 없습니다.');
      return;
    }
    await Linking.openURL(raw);
  } catch (e: any) {
    Alert.alert('열기 실패', String(e?.message || e || 'open_failed'));
  }
}
