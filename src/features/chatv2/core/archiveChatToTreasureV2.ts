import { useMediaStore, mediaIdForUri } from '@/src/features/chat/store/media.store';
import {
  getHttpsAttachmentUrl,
  resolveAttachmentRemoteUrl,
  getLinkUrlSafe,
} from './attachmentAccess';
import type { ChatMessageV2 } from './messageSchema';

/**
 * 프로필 보물창고(media.store)에 비공개 저장 — 구 채팅 keepMessageMediaToTreasure 와 동일 SSOT
 */
export function archiveChatMessageV2ToTreasure(msg: ChatMessageV2): void {
  const addOne = (uri: string, typeHint?: 'image' | 'video' | 'file' | 'link', name?: string) => {
    const u = String(uri || '').trim();
    if (!u) return;
    const id = mediaIdForUri(u);
    useMediaStore.getState().addOrUpdate({
      id,
      uriHttp: /^https?:\/\//i.test(u) ? u : undefined,
      name: name ? String(name).slice(0, 240) : undefined,
      visibility: 'private',
      location: 'treasure',
      createdAt: Date.now(),
      type: typeHint,
    });
  };

  const t = String(msg.type || '');

  if (t === 'image' || t === 'video') {
    const https = getHttpsAttachmentUrl(msg);
    const fallback = resolveAttachmentRemoteUrl(msg) || '';
    const u = https || fallback;
    if (u) addOne(u, t === 'video' ? 'video' : 'image', msg.filename);
    return;
  }

  if (t === 'file' || t === 'audio') {
    const https = getHttpsAttachmentUrl(msg);
    const fallback = resolveAttachmentRemoteUrl(msg) || '';
    const u = https || fallback;
    if (u) addOne(u, 'file', msg.filename);
    return;
  }

  if (t === 'location') {
    const lat = Number((msg.location as any)?.lat ?? (msg.location as any)?.latitude);
    const lng = Number((msg.location as any)?.lng ?? (msg.location as any)?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const maps = `https://maps.google.com/?q=${encodeURIComponent(`${lat},${lng}`)}`;
      const label = String((msg.location as any)?.roadAddress || (msg.location as any)?.address || msg.text || '위치').slice(
        0,
        120
      );
      addOne(maps, 'link', label);
    }
    return;
  }

  if (t === 'url') {
    const u = String(getLinkUrlSafe(msg) || msg.text || '').trim();
    if (u) addOne(u, 'link', String(msg.link?.title || '').trim() || undefined);
    return;
  }

  if (t === 'qr') {
    const raw = String(msg.qr?.raw || msg.text || '').trim();
    if (!raw) return;
    if (/^https?:\/\//i.test(raw) || /^yooy:\/\//i.test(raw)) {
      addOne(raw, 'link', 'QR 링크');
      return;
    }
    const enc = encodeURIComponent(raw.slice(0, 1000));
    const qrThumbUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${enc}`;
    const id = mediaIdForUri(`qr_text:${raw.slice(0, 400)}`);
    useMediaStore.getState().addOrUpdate({
      id,
      uriHttp: qrThumbUrl,
      name: `QR · ${raw.slice(0, 80)}${raw.length > 80 ? '…' : ''}`,
      visibility: 'private',
      location: 'treasure',
      createdAt: Date.now(),
      type: 'link',
    });
  }
}
