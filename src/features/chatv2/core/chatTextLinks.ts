/**
 * 채팅 일반 텍스트 말풍선에서 탭 가능한 인라인 링크 추출.
 * OS 기본 링크 감지는 https 위주라 yooyland:// · yooy:// 는 수동 파싱.
 */
const INLINE_LINK_RE = /(https?:\/\/[^\s<>"']+|yooyland:\/\/[^\s<>"']+|yooy:\/\/[^\s<>"']+|appyooyland:\/\/[^\s<>"']+)/gi;

export type ChatTextSegment = { kind: 'text'; text: string } | { kind: 'link'; url: string };

export function parseChatTextWithLinks(raw: string): ChatTextSegment[] {
  const s = String(raw ?? '');
  if (!s) return [{ kind: 'text', text: '' }];
  const out: ChatTextSegment[] = [];
  let last = 0;
  INLINE_LINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_LINK_RE.exec(s)) !== null) {
    if (m.index > last) out.push({ kind: 'text', text: s.slice(last, m.index) });
    out.push({ kind: 'link', url: m[1] });
    last = m.index + m[1].length;
  }
  if (last < s.length) out.push({ kind: 'text', text: s.slice(last) });
  if (out.length === 0) out.push({ kind: 'text', text: s });
  return out;
}

export function extractFirstOpenableUrl(text: string): string | null {
  INLINE_LINK_RE.lastIndex = 0;
  const m = INLINE_LINK_RE.exec(String(text || ''));
  return m ? m[1] : null;
}

/** 메시지 본문 전체가 한 줄짜리 열 수 있는 URL인지 (QR·링크 카드 등) */
export function isOpenableUrlString(s: string): boolean {
  const t = String(s || '').trim();
  return /^https?:\/\//i.test(t) || /^yooyland:\/\//i.test(t) || /^yooy:\/\//i.test(t) || /^appyooyland:\/\//i.test(t);
}
