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

/** 방장이 설정하는 참여 코드(비밀번호): A–Z / 0–9 만, 4~32자 */
export function sanitizeOwnerJoinCodeV2(raw: string): string {
  const s = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (s.length < 4 || s.length > 32) {
    throw new Error('invite_code_bad_length');
  }
  return s;
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

export type InviteShareLangV2 = 'ko' | 'en' | 'ja' | 'zh';

/**
 * 카카오톡 등에서 긴 URL이 줄바꿈으로 잘리며 `&t` / `=` 가 분리되는 문제를 줄이기 위해
 * **https 초대 URL을 첫 줄에 단독**으로 둡니다. (앞에 `1)` 같은 접두를 붙이지 않음)
 */
export function buildInviteExternalSharePayloadV2(input: {
  roomId: string;
  inviteToken: string;
  inviteCode: string;
  lang: InviteShareLangV2;
}): { message: string; primaryUrl: string } {
  const primaryUrl = buildInviteQrPayloadV2({
    roomId: input.roomId,
    inviteToken: input.inviteToken,
    inviteCode: input.inviteCode,
  });
  const deep = buildInviteDeepLinkV2({
    roomId: input.roomId,
    inviteToken: input.inviteToken,
    inviteCode: input.inviteCode,
  });
  const webInstall = 'https://yooy.land/app';
  const code = String(input.inviteCode || '').trim();

  if (input.lang === 'ja') {
    return {
      primaryUrl,
      message: [
        primaryUrl,
        '',
        `ルーム招待コード: ${code}`,
        '',
        'アプリで開く（インストール済みの場合）:',
        deep,
        '',
        'アプリが無い場合はインストール後、上の1行目のリンクをもう一度タップしてください。',
        webInstall,
      ].join('\n'),
    };
  }
  if (input.lang === 'zh') {
    return {
      primaryUrl,
      message: [
        primaryUrl,
        '',
        `房间邀请码：${code}`,
        '',
        '在应用中打开（已安装时）：',
        deep,
        '',
        '若未安装应用，请先安装后再次点击第一行链接。',
        webInstall,
      ].join('\n'),
    };
  }
  if (input.lang === 'en') {
    return {
      primaryUrl,
      message: [
        primaryUrl,
        '',
        `Room invite code: ${code}`,
        '',
        'Open in app (if installed):',
        deep,
        '',
        "If the app isn't installed, install from the link below, then tap the first line again.",
        webInstall,
      ].join('\n'),
    };
  }
  return {
    primaryUrl,
    message: [
      primaryUrl,
      '',
      `방 초대 코드: ${code}`,
      '',
      '앱에서 바로 열기(설치된 경우):',
      deep,
      '',
      '앱이 없으면 아래에서 설치한 뒤, 맨 위 한 줄 링크를 다시 눌러 주세요.',
      webInstall,
    ].join('\n'),
  };
}

export function logInviteGenerateResult(ok: boolean, payload: Record<string, unknown>) {
  logYyRoom(ok ? 'room.invite.generate.success' : 'room.invite.generate.fail', payload);
}
