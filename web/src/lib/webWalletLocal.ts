/** Web 전용: 수신 QR에 쓸 EVM 주소(사용자가 직접 저장). 앱 로컬 지갑과 별도. */
export const depositAddrKey = (uid: string) => `yooy-web-deposit-addr:${uid}`;
export const recentSendKey = (uid: string) => `yooy-web-recent-send:${uid}`;

export type RecentSendRow = { at: number; to: string; amount: string; memo?: string };

export function getDepositAddress(uid: string): string {
  try {
    return String(localStorage.getItem(depositAddrKey(uid)) || '').trim();
  } catch {
    return '';
  }
}

export function setDepositAddress(uid: string, addr: string) {
  try {
    localStorage.setItem(depositAddrKey(uid), addr.trim());
  } catch {
    /* noop */
  }
}

export function listRecentSends(uid: string): RecentSendRow[] {
  try {
    const raw = localStorage.getItem(recentSendKey(uid));
    if (!raw) return [];
    const j = JSON.parse(raw);
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

export function pushRecentSend(uid: string, row: RecentSendRow) {
  const prev = listRecentSends(uid);
  prev.unshift(row);
  try {
    localStorage.setItem(recentSendKey(uid), JSON.stringify(prev.slice(0, 30)));
  } catch {
    /* noop */
  }
}
