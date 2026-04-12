import type { ChatMessageV2 } from './messageSchema';

function isPdfHint(displayName: string, displayUrl: string, mime: string): boolean {
  if (/pdf/i.test(mime)) return true;
  if (/\.pdf(\?|#|$)/i.test(displayUrl)) return true;
  if (/\.pdf$/i.test(displayName)) return true;
  return false;
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp)(\?|#|$)/i;
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|3gp|avi)(\?|#|$)/i;
const AUDIO_EXT = /\.(m4a|mp3|aac|wav|opus|ogg|flac|caf|amr)(\?|#|$)/i;

/**
 * 미리보기 모달용: 메시지 타입이 file/audio여도 확장자·mime으로 실제 표시 방식 결정
 */
export function inferPreviewContentKind(
  msg: ChatMessageV2 | null,
  displayName: string,
  displayUrl: string
): 'image' | 'video' | 'audio' | 'pdf' | 'file' | 'none' {
  if (!msg) return 'none';
  const base = String(msg.type || '');
  if (base === 'url' || base === 'location' || base === 'qr' || base === 'poll' || base === 'text' || base === 'system') return 'none';

  const mime = String(msg.mimeType || '').toLowerCase();
  const nameBlob = `${displayName} ${String(msg.filename || '')} ${displayUrl}`;

  if (base === 'audio' || mime.startsWith('audio/') || AUDIO_EXT.test(nameBlob)) return 'audio';

  if (base === 'file') {
    if (isPdfHint(displayName, displayUrl, mime)) return 'pdf';
    if (mime.startsWith('image/') || IMAGE_EXT.test(nameBlob)) return 'image';
    if (mime.startsWith('video/') || VIDEO_EXT.test(nameBlob)) return 'video';
    return 'file';
  }

  return 'none';
}
