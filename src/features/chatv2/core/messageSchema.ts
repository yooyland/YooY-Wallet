export type MessageStatusV2 = 'sending' | 'uploaded' | 'ready' | 'sent' | 'failed';

export type ChatMessageTypeV2 =
  | 'text'
  | 'image'
  | 'video'
  | 'file'
  | 'audio'
  | 'location'
  | 'url'
  | 'qr'
  | 'poll'
  | 'system';

export type ChatPollV2 = {
  question: string;
  options: Array<{ id: string; text: string }>;
  /** uid -> optionId(s) */
  votesByUser?: Record<string, string[]>;
  multi?: boolean;
  createdAt: number;
  /** poll author uid */
  createdBy?: string;
};

/** 첨부 표준 (Firestore 동기화 + 렌더러 단일 진입점). 기존 top-level url/thumbnailUrl 과 병행 가능 */
export type ChatAttachmentStandardV2 = {
  id: string;
  type: 'image' | 'video' | 'file' | 'qr' | 'audio';
  originalName: string;
  storageName?: string;
  mimeType?: string;
  size?: number;
  localUri?: string;
  remoteUrl?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
  status?: 'sending' | 'uploaded' | 'failed';
};

export type ChatMessageV2 = {
  id: string;
  roomId: string;
  senderId: string;
  type: ChatMessageTypeV2;
  status: MessageStatusV2;
  text?: string;
  url?: string;
  thumbnailUrl?: string;
  mimeType?: string;
  filename?: string;
  size?: number;
  /** 첨부 표준 (optional). 없으면 meta + url 로 복원 */
  attachment?: ChatAttachmentStandardV2;
  location?: {
    lat?: number;
    lng?: number;
    latitude?: number;
    longitude?: number;
    /** legacy / generic label */
    address?: string;
    /** 도로명 등 우선 표시용 */
    roadAddress?: string;
    /** 구/동 등 짧은 요약 */
    shortAddress?: string;
    mapUrl?: string;
  };
  /** 링크 미리보기 — Firestore 부분 문서 시 url 없을 수 있음 */
  link?: {
    url?: string;
    title?: string;
    description?: string;
    image?: string;
  };
  qr?: {
    raw: string;
  };
  poll?: ChatPollV2;
  meta?: Record<string, any>;
  /** TTL 방: 메시지별 만료 시각(ms), 전송 시 설정 */
  expiresAt?: number;
  /** TTL 방: 적용된 메시지 TTL(초) */
  ttlSeconds?: number;
  createdAt: number;
  updatedAt?: number;
};

export const isMediaMessageV2 = (m: Pick<ChatMessageV2, 'type'>) =>
  m.type === 'image' || m.type === 'video' || m.type === 'file' || m.type === 'audio';

/** Firestore 부분 스냅샷·구버전 문서에서도 안전: top-level `url` 직접 접근 대신 사용 */
export function getChatMediaRemoteUrlV2(m: Pick<ChatMessageV2, 'url' | 'attachment' | 'meta'> | null | undefined): string {
  try {
    const a = m?.attachment as Record<string, unknown> | undefined;
    const chain = [
      a?.remoteUrl,
      a?.url,
      a?.fileUrl,
      a?.downloadURL,
      (m as any)?.url,
      (m as any)?.meta?.remoteUrl,
      (m as any)?.meta?.url,
    ];
    for (const x of chain) {
      if (typeof x === 'string' && x.trim().length > 0) return x.trim();
    }
  } catch {
    /* noop */
  }
  return '';
}

export function getChatMediaThumbnailUrlV2(m: Pick<ChatMessageV2, 'thumbnailUrl' | 'attachment' | 'meta'> | null | undefined): string {
  try {
    const a = m?.attachment as Record<string, unknown> | undefined;
    const chain = [a?.thumbnailUrl, a?.thumbUrl, a?.previewUrl, m?.thumbnailUrl, (m as any)?.meta?.thumbnailUrl];
    for (const x of chain) {
      if (typeof x === 'string' && x.trim().length > 0) return x.trim();
    }
  } catch {
    /* noop */
  }
  return '';
}

export function getChatMediaLocalUriV2(m: Pick<ChatMessageV2, 'attachment' | 'meta'> | null | undefined): string {
  try {
    const a = m?.attachment?.localUri;
    if (typeof a === 'string' && a.trim()) return a.trim();
    return String((m as any)?.meta?.localUri || '').trim();
  } catch {
    return '';
  }
}

/** 표시용 원본 파일명 (갤러리·문서 피커 이름 유지) */
export function getChatMediaOriginalNameV2(m: Pick<ChatMessageV2, 'filename' | 'attachment' | 'meta'> | null | undefined): string {
  try {
    const o = String(m?.attachment?.originalName || '').trim();
    if (o) return o;
    const metaO = String((m as any)?.meta?.originalName || '').trim();
    if (metaO) return metaO;
    return String(m?.filename || '').trim();
  } catch {
    return '';
  }
}