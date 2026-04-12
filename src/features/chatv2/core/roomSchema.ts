export type ChatRoomTypeV2 = 'dm' | 'group' | 'ttl' | 'secret' | 'notice';

/** 방 단위 권한(정책) — 클라이언트 + 향후 서버 검증용 */
export type RoomPermissionsV2 = {
  memberCanMessage?: boolean;
  memberCanUploadFile?: boolean;
  memberCanUploadImage?: boolean;
  memberCanShareLink?: boolean;
  memberCanInvite?: boolean;
  /** 방 정보(이름/설명/사진) 수정 가능 주체 */
  whoCanEditRoomInfo?: 'owner' | 'admin';
};

export type RoomSettingsDocV2 = {
  /** 공지방: 일반 멤버 글쓰기 제한 */
  noticeOnlyAdminWrite?: boolean;
};

export type ChatRoomV2 = {
  id: string;
  type: ChatRoomTypeV2;
  title?: string;
  description?: string;
  avatarUrl?: string;
  /** 대표 이미지 (avatarUrl 과 동기화 가능) */
  photoURL?: string;
  tags?: string[];
  maxParticipants?: number;
  roomStatus?: 'active' | 'closed' | 'archived';
  /** 검색/목록 노출 (비밀방 등) */
  searchVisible?: boolean;
  isSecret?: boolean;
  settings?: RoomSettingsDocV2;
  permissions?: RoomPermissionsV2;
  inviteCode?: string;
  inviteToken?: string;
  inviteEnabled?: boolean;
  inviteExpiresAt?: number | null;
  inviteQrValue?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  participantIds: string[];
  /** memberIds — participantIds 와 동일하게 유지 */
  memberIds?: string[];
  adminIds: string[];
  ownerIds?: string[];
  dmPairKey?: string;
  /** rooms 문서 평탄 필드 (TTL 방, subscribe 시 ttl 객체와 병합) */
  ttlEnabled?: boolean;
  roomExpiresAt?: number;
  roomTtlSeconds?: number;
  messageTtlSeconds?: number;
  ttlStatus?: 'active' | 'expired' | 'locked';
  ttlLastExtendedAt?: number;
  ttlLastModifiedBy?: string;
  ttl?: {
    enabled: boolean;
    explodeRoomAt?: number | null;
    messageExpireSeconds?: number | null;
    roomTtlSeconds?: number | null;
    ttlStatus?: 'active' | 'expired' | 'locked';
    ttlLastExtendedAt?: number | null;
    ttlLastModifiedBy?: string | null;
  };
  security?: {
    allowImageUpload?: boolean;
    allowImageDownload?: boolean;
    allowCapture?: boolean;
    allowExternalShare?: boolean;
  };
};

export const getDmPairKeyV2 = (uid1: string, uid2: string) =>
  [uid1, uid2].slice().sort().join('_');

