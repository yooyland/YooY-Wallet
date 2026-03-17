export type RoomType = 'NORMAL' | 'TTL';

export type MemberRole = 'admin' | 'member';

export type DisplayNameMode = 'DEFAULT' | 'HASH' | 'NICKNAME';

export type ThemeKind = 'default' | 'dark' | 'custom';

export interface BasicSettings {
  imageUrl?: string | null;
  title: string;
  description?: string | null;
  participantLimit?: number | null; // 0 또는 null => 제한 없음
  tags?: string[];
  isPublic: boolean;
}

export interface MembersSettings {
  ownerUserId: string;
  participantUserIds: string[];
  userIdToRole: Record<string, MemberRole>;
}

export interface PermissionSettings {
  lockEnabled: boolean;
  lockPassword?: string;
  twoFactorEnabled: boolean;
  displayNameMode: DisplayNameMode;
  blacklistUserIds: string[];
}

export type NotificationSoundType =
  | 'gold'      // YooY Land default
  | 'simple'
  | 'urgent'
  | 'dm_message'
  | 'coin_reward'
  | 'mention'
  | 'system_notice'
  | 'warning'
  | 'system_default'  // device native
  | 'silent';

export interface NotificationSettings {
  enabled: boolean;
  keywordAlerts: string[];
  mentionAlertEnabled: boolean;
  mode?: 'sound' | 'vibrate' | 'mute';
  notificationVolume?: 'low' | 'medium' | 'high' | 'max';
  notificationSound?: NotificationSoundType;
}

export interface ThemeSettings {
  theme: ThemeKind;
  backgroundColorHex?: string;
  bubbleColorHex?: string;
  fontScaleLevel?: 1|2|3|4|5; // 말풍선 글자 크기 단계
  backgroundImageUrl?: string; // 채팅 배경 이미지
}

export interface TTLSettings {
  expiresAtMs: number; // 0이면 미설정
  messageDeleteOnExpiry: boolean;
}

export interface RoomSettings {
  roomId: string;
  roomType: RoomType;
  basic: BasicSettings;
  members: MembersSettings;
  permissions: PermissionSettings;
  notifications: NotificationSettings;
  theme: ThemeSettings;
  ttl: TTLSettings;
  ttlSecurity?: {
    allowImageUpload?: boolean;
    allowImageDownload?: boolean;
    allowCapture?: boolean;
    allowExternalShare?: boolean;
  };
}

export const TTL_MAX_DAYS = 90;
export const TTL_MAX_MS = TTL_MAX_DAYS * 24 * 60 * 60 * 1000;

export const TTL_CREATE_COST_24H_OR_LESS_YOY = 5;
export const TTL_CREATE_COST_OVER_24H_TO_90D_YOY = 30;

export const TTL_EXTEND_PLUS_24H_COST_YOY = 5;
export const TTL_EXTEND_PLUS_30D_COST_YOY = 10;

export function createDefaultRoomSettings(params: { roomId: string; roomType: RoomType; ownerUserId: string }): RoomSettings {
  return {
    roomId: params.roomId,
    roomType: params.roomType,
    basic: {
      imageUrl: null,
      title: '',
      description: '',
      participantLimit: null,
      tags: [],
      isPublic: true,
    },
    members: {
      ownerUserId: params.ownerUserId,
      participantUserIds: [params.ownerUserId],
      userIdToRole: { [params.ownerUserId]: 'admin' },
    },
    permissions: {
      lockEnabled: false,
      lockPassword: '',
      twoFactorEnabled: false,
      displayNameMode: 'DEFAULT',
      blacklistUserIds: [],
    },
    notifications: {
      enabled: true,
      keywordAlerts: [],
      mentionAlertEnabled: true,
      mode: 'sound',
      notificationVolume: 'medium',
      notificationSound: 'gold',
    },
    theme: {
      theme: 'default',
      backgroundColorHex: '#0C0C0C',
      bubbleColorHex: '#D4AF37',
      fontScaleLevel: 3,
      backgroundImageUrl: undefined,
    },
    ttl: {
      expiresAtMs: 0,
      messageDeleteOnExpiry: true,
    },
  };
}

