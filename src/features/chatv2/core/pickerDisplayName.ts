function tailFromUri(uri: string): string | undefined {
  try {
    const u = String(uri || '');
    const tail = u.split('/').pop()?.split('?')[0]?.trim();
    if (tail && tail.length > 0 && tail.length < 220) return tail;
  } catch {}
  return undefined;
}

/**
 * expo-image-picker 자산 → 말풍선·Firestore 에 쓸 표시 파일명.
 * Google Play 정책상 READ_MEDIA_IMAGES 등 광범위 갤러리 접근 없이는 MediaLibrary 로
 * “실제 파일명” 보강을 하지 않습니다 — picker 가 준 fileName·URI 꼬리만 사용합니다.
 */
export async function resolvePickerAssetDisplayName(a: {
  uri?: string;
  fileName?: string | null;
}): Promise<string | undefined> {
  const direct = a.fileName != null ? String(a.fileName).trim() : '';
  if (direct) return direct;
  return tailFromUri(String(a.uri || ''));
}
