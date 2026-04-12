/**
 * 갤러리 다중 선택 시, 연속 전송에서 content/ph URI 가 무효·공유되는 경우가 있어
 * 각 장을 먼저 고유한 cache 파일로 복사한 뒤 업로드에 넘깁니다.
 */
export async function materializePickerUriForUpload(uri: string): Promise<string> {
  const u = String(uri || '').trim();
  if (!u) return u;
  if (!/^(content|ph|assets-library):\/\//i.test(u)) return u;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const FileSystem = require('expo-file-system/legacy');
    if (!FileSystem?.cacheDirectory || !FileSystem?.copyAsync) return u;
    const tail = u.split('/').pop()?.split('?')[0] || 'img';
    const m = tail.match(/\.([a-z0-9]{1,8})$/i);
    const ext = (m?.[1] || 'jpg').toLowerCase();
    const dest = `${FileSystem.cacheDirectory}yy_multipick_${Date.now()}_${Math.random().toString(36).slice(2, 11)}.${ext}`;
    await FileSystem.copyAsync({ from: u, to: dest });
    return dest;
  } catch {
    return u;
  }
}
