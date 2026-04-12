export type YooYRouteV2 =
  | { type: 'external'; url: string }
  /** 초대 QR/링크: roomId + 선택적 토큰(t)·코드(c 또는 code) */
  | { type: 'invite'; roomId: string; code?: string; token?: string }
  | { type: 'room'; roomId: string }
  | { type: 'dm'; otherId: string }
  | { type: 'wallet'; action: 'receive' | 'send'; payload?: Record<string, any> }
  | { type: 'unknown'; raw: string };

/**
 * One unified router for QR + app-links (v2).
 * Keep parsing deterministic and side-effect free.
 */
export function parseYooYLinkV2(raw: string): YooYRouteV2 {
  const s = String(raw || '').trim();
  if (!s) return { type: 'unknown', raw: s };

  // yooy://invite?roomId=... | yooy://chatv2/join?roomId=...&t=...&c=... | yooyland:// 동일
  const parseInviteLikeUrl = (u: URL): YooYRouteV2 | null => {
    try {
      const host = String(u.hostname || '').toLowerCase();
      const path = String(u.pathname || '').toLowerCase();
      const joinPath = path === '/join' || path.endsWith('/join');
      if (host === 'invite' || path === '/invite' || (host === 'chatv2' && joinPath)) {
        const roomId = u.searchParams.get('roomId') || u.searchParams.get('room') || '';
        const code = u.searchParams.get('c') || u.searchParams.get('code') || undefined;
        const token = u.searchParams.get('t') || u.searchParams.get('token') || undefined;
        if (roomId) return { type: 'invite', roomId: String(roomId), code, token };
      }
      return null;
    } catch {
      return null;
    }
  };

  if (/^yooy:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      const inv = parseInviteLikeUrl(u);
      if (inv && inv.type === 'invite') return inv;

      const host = String(u.hostname || '').toLowerCase();
      const path = String(u.pathname || '').toLowerCase();

      if (host === 'room' || path === '/room') {
        const roomId = u.searchParams.get('id') || u.searchParams.get('roomId') || u.searchParams.get('room') || '';
        if (roomId) return { type: 'room', roomId: String(roomId) };
      }

      if (host === 'dm' || path === '/dm') {
        const otherId = u.searchParams.get('otherId') || u.searchParams.get('uid') || '';
        if (otherId) return { type: 'dm', otherId: String(otherId) };
      }
    } catch {}
  }

  // yooyland://chatv2/join?roomId=...&t=...&c=... (초대 QR과 동일 스킴)
  if (/^yooyland:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      const inv = parseInviteLikeUrl(u);
      if (inv && inv.type === 'invite') return inv;
    } catch {}
  }

  // appyooyland:// — Expo/Android 기본 scheme; yooyland와 동일하게 초대/룸/DM 파싱
  if (/^appyooyland:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      const inv = parseInviteLikeUrl(u);
      if (inv && inv.type === 'invite') return inv;
      const host = String(u.hostname || '').toLowerCase();
      const path = String(u.pathname || '').toLowerCase();
      if (host === 'room' || path === '/room') {
        const roomId = u.searchParams.get('id') || u.searchParams.get('roomId') || u.searchParams.get('room') || '';
        if (roomId) return { type: 'room', roomId: String(roomId) };
      }
      if (host === 'dm' || path === '/dm') {
        const otherId = u.searchParams.get('otherId') || u.searchParams.get('uid') || '';
        if (otherId) return { type: 'dm', otherId: String(otherId) };
      }
    } catch {}
  }

  // https-based YooY links (best-effort)
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      const host = u.hostname.toLowerCase();
      const path = u.pathname.toLowerCase();
      const isYooy = host.includes('yooy') || host.includes('yooyland');
      if (isYooy && (path.includes('invite') || path.includes('/join') || u.searchParams.has('roomId') || u.searchParams.has('room'))) {
        const roomId = u.searchParams.get('roomId') || u.searchParams.get('room') || '';
        const code = u.searchParams.get('c') || u.searchParams.get('code') || undefined;
        const token = u.searchParams.get('t') || u.searchParams.get('token') || undefined;
        if (roomId) return { type: 'invite', roomId: String(roomId), code, token };
      }
      if (isYooy && (path.includes('dm') || u.searchParams.has('otherId'))) {
        const otherId = u.searchParams.get('otherId') || '';
        if (otherId) return { type: 'dm', otherId: String(otherId) };
      }
      if (isYooy && (path.includes('room') || u.searchParams.has('id'))) {
        const roomId = u.searchParams.get('id') || u.searchParams.get('roomId') || '';
        if (roomId) return { type: 'room', roomId: String(roomId) };
      }
    } catch {}
    return { type: 'external', url: s };
  }

  // default: treat as external URL if http(s)
  return { type: 'unknown', raw: s };
}

