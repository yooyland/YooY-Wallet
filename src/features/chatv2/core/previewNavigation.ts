import type { ChatMessageV2 } from './messageSchema';
import { getLinkUrlSafe, getLocalPreviewUri, getMediaRemoteUrl } from './attachmentAccess';

function isMediaUploadComplete(msg: ChatMessageV2): boolean {
  const st = String(msg.status || '');
  return st === 'uploaded' || st === 'ready';
}

/** 말풍선에서 미리보기를 연 타입과 동일한 기준 */
export function isChatMessagePreviewableV2(msg: ChatMessageV2 | null | undefined): boolean {
  if (!msg) return false;
  const t = String(msg.type || '');

  if (t === 'location') {
    const lat = Number((msg.location as any)?.lat ?? (msg.location as any)?.latitude);
    const lng = Number((msg.location as any)?.lng ?? (msg.location as any)?.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng);
  }

  if (t === 'url') {
    const u = String(getLinkUrlSafe(msg) || msg.text || '').trim();
    return /^https?:\/\//i.test(u) || /^yooy:\/\//i.test(u);
  }

  if (t === 'qr') {
    const raw = String(msg.qr?.raw || msg.text || '').trim();
    return raw.length > 0;
  }

  const mediaKind = t === 'image' || t === 'video' || t === 'file' || t === 'audio';
  if (!mediaKind) return false;

  const localUri = getLocalPreviewUri(msg) || '';
  const remote = getMediaRemoteUrl(msg) || '';
  const displayUrl = remote || localUri;

  const canPreview =
    msg.status === 'ready' ||
    msg.status === 'sent' ||
    (mediaKind && isMediaUploadComplete(msg)) ||
    (mediaKind &&
      localUri.length > 0 &&
      (msg.status === 'sending' || msg.status === 'failed' || msg.status === 'uploaded'));

  return canPreview && displayUrl.length > 0;
}

/** 미리보기 체인용: `uuid__img0` → 원본 메시지 id */
export function previewMessageBaseId(messageId: string): string {
  return String(messageId || '').replace(/__img\d+$/, '');
}

/** 대화 목록 순서(오래된 것 → 최신) 그대로, 미리보기 가능한 메시지만.
 *  이미지 앨범(meta.imageAlbum 2장+)은 슬라이드마다 별도 항목으로 펼침(같은 내용, attachment 만 해당 장). */
export function buildOrderedPreviewableMessages(messages: ChatMessageV2[]): ChatMessageV2[] {
  const filtered = (messages || []).filter(isChatMessagePreviewableV2);
  const out: ChatMessageV2[] = [];
  for (const m of filtered) {
    const album = (m as any)?.meta?.imageAlbum;
    if (String(m.type) === 'image' && Array.isArray(album) && album.length > 1) {
      const expanded: ChatMessageV2[] = [];
      for (let i = 0; i < album.length; i++) {
        const item = album[i];
        const u = String(item?.localUri || item?.remoteUrl || item?.thumbnailUrl || '').trim();
        if (!u) continue;
        const baseAtt = m.attachment && typeof m.attachment === 'object' ? { ...m.attachment } : ({} as any);
        const slideAtt = {
          ...baseAtt,
          localUri: item.localUri,
          remoteUrl: item.remoteUrl,
          thumbnailUrl: String(item.thumbnailUrl || item.remoteUrl || '').trim() || undefined,
        };
        expanded.push({
          ...m,
          id: `${m.id}__img${i}`,
          attachment: slideAtt,
          meta: { ...(m.meta as any), __previewAlbumIndex: i },
        } as ChatMessageV2);
      }
      if (expanded.length) out.push(...expanded);
      else out.push(m);
    } else {
      out.push(m);
    }
  }
  return out;
}
