import { v4 as uuidv4 } from 'uuid';
import { logYyRoom } from '../core/roomLog';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 짧은 초대 코드 (혼동 문자 제외) */
export function generateInviteCodeV2(length = 8): string {
  let s = '';
  for (let i = 0; i < length; i += 1) {
    s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return s;
}

export function generateInviteTokenV2(): string {
  return uuidv4().replace(/-/g, '');
}

/** 딥링크/QR에 넣을 값 (앱에서 파싱) */
export function buildInviteQrPayloadV2(input: { roomId: string; inviteToken: string; inviteCode: string }): string {
  // 외부 앱(카톡 등)에서 링크 인식률이 높은 https 기반을 기본으로 사용
  // Android intentFilter로 앱에서 직접 열리며, 앱 내부 파서(parseYooYLinkV2)도 처리 가능
  return `https://yooy.land/chatv2/join?roomId=${encodeURIComponent(input.roomId)}&t=${encodeURIComponent(input.inviteToken)}&c=${encodeURIComponent(input.inviteCode)}`;
}

/** 공유 텍스트에 같이 넣을 앱 딥링크 (설치된 경우 즉시 앱으로 오픈) */
export function buildInviteDeepLinkV2(input: { roomId: string; inviteToken: string; inviteCode: string }): string {
  return `yooy://chatv2/join?roomId=${encodeURIComponent(input.roomId)}&t=${encodeURIComponent(input.inviteToken)}&c=${encodeURIComponent(input.inviteCode)}`;
}

export function logInviteGenerateResult(ok: boolean, payload: Record<string, unknown>) {
  logYyRoom(ok ? 'room.invite.generate.success' : 'room.invite.generate.fail', payload);
}
