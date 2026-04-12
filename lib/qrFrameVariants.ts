/** QR 저장 팝업 프레임 색 — 받기/명함/기프트/초대 구분 */
export type QrFrameVariant = 'receive' | 'card' | 'gift' | 'invite';

export const QR_FRAME_BORDER: Record<QrFrameVariant, string> = {
  receive: '#D4AF37', // 골드
  card: '#2196F3', // 파랑
  gift: '#E53935', // 빨강
  invite: '#FF9800', // 주황
};
