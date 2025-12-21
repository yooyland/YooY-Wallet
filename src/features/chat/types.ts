// YooY Chat 하이브리드 메신저 타입 정의
// Telegram + Discord 구조

// ===== 기본 사용자 타입 =====
export interface User {
  id: string;
  username: string;
  displayName: string;
  avatar?: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  customStatus?: string;
  createdAt: number;
  lastSeen: number;
}

// ===== Discord 스타일 서버 시스템 =====
export interface Server {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  banner?: string;
  ownerId: string;
  members: ServerMember[];
  channels: Channel[];
  roles: Role[];
  categories: Category[];
  createdAt: number;
  settings: ServerSettings;
}

export interface ServerMember {
  userId: string;
  serverId: string;
  nickname?: string;
  roles: string[]; // Role IDs
  joinedAt: number;
  permissions: Permission[];
}

export interface Role {
  id: string;
  name: string;
  color: string;
  permissions: Permission[];
  position: number;
  mentionable: boolean;
  hoist: boolean; // 역할을 별도로 표시할지
  createdAt: number;
}

export interface Category {
  id: string;
  name: string;
  position: number;
  channels: string[]; // Channel IDs
}

export interface Channel {
  id: string;
  name: string;
  type: 'text' | 'voice' | 'secret' | 'ttl';
  serverId: string;
  categoryId?: string;
  position: number;
  topic?: string;
  permissions: ChannelPermission[];
  settings: ChannelSettings;
  createdAt: number;
}

// ===== Telegram 스타일 보안 채팅 =====
export interface SecretChat {
  id: string;
  participants: string[]; // User IDs
  encryptionKey: string;
  isActive: boolean;
  createdAt: number;
  lastActivity: number;
}

export interface TTLMessage {
  id: string;
  content: string;
  senderId: string;
  channelId: string;
  ttlSeconds: number;
  expiresAt: number;
  createdAt: number;
}

// ===== 메시지 시스템 =====
export interface Message {
  id: string;
  content: string;
  senderId: string;
  channelId: string;
  type: 'text' | 'image' | 'file' | 'voice' | 'video' | 'system';
  attachments?: Attachment[];
  replyTo?: string; // Message ID
  reactions: Reaction[];
  editedAt?: number;
  createdAt: number;
  isSecret?: boolean;
  isTTL?: boolean;
  ttlSeconds?: number;
}

export interface Attachment {
  id: string;
  type: 'image' | 'file' | 'voice' | 'video';
  url: string;
  name: string;
  size: number;
  mimeType: string;
}

export interface Reaction {
  emoji: string;
  users: string[]; // User IDs
  count: number;
}

// ===== 권한 시스템 =====
export interface Permission {
  id: string;
  name: string;
  description: string;
  category: 'general' | 'text' | 'voice' | 'moderation' | 'admin';
}

export interface ChannelPermission {
  roleId?: string;
  userId?: string;
  allow: Permission[];
  deny: Permission[];
}

// ===== 설정 =====
export interface ServerSettings {
  verificationLevel: 'none' | 'low' | 'medium' | 'high' | 'very_high';
  defaultNotifications: 'all' | 'mentions' | 'nothing';
  explicitContentFilter: 'disabled' | 'members_without_roles' | 'all_members';
  mfaLevel: 'none' | 'elevated';
  premiumTier: 'none' | 'tier_1' | 'tier_2' | 'tier_3';
}

export interface ChannelSettings {
  isSecret: boolean;
  isTTL: boolean;
  ttlSeconds?: number;
  encryptionLevel: 'none' | 'basic' | 'e2e';
  selfDestruct: boolean;
  forwardSecrecy: boolean;
}

// ===== 실시간 상태 =====
export interface Presence {
  userId: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  activities: Activity[];
  lastSeen: number;
}

export interface Activity {
  type: 'playing' | 'listening' | 'watching' | 'streaming';
  name: string;
  details?: string;
  state?: string;
  url?: string;
}

// ===== 알림 시스템 =====
export interface Notification {
  id: string;
  userId: string;
  type: 'mention' | 'message' | 'server_invite' | 'role_update' | 'channel_create';
  title: string;
  content: string;
  data?: any;
  read: boolean;
  createdAt: number;
}

// ===== 초대 시스템 =====
export interface Invite {
  id: string;
  code: string;
  serverId: string;
  channelId?: string;
  inviterId: string;
  maxUses?: number;
  maxAge?: number; // seconds
  temporary: boolean;
  uses: number;
  expiresAt?: number;
  createdAt: number;
}

// ===== 음성 채널 =====
export interface VoiceChannel {
  id: string;
  name: string;
  serverId: string;
  categoryId?: string;
  position: number;
  userLimit?: number;
  bitrate: number;
  region?: string;
  connectedUsers: string[]; // User IDs
}

// ===== 검색 및 필터 =====
export interface SearchResult {
  messages: Message[];
  channels: Channel[];
  users: User[];
  servers: Server[];
}

export interface MessageFilter {
  channelId?: string;
  serverId?: string;
  userId?: string;
  type?: string;
  dateRange?: {
    start: number;
    end: number;
  };
  hasAttachments?: boolean;
  isSecret?: boolean;
  isTTL?: boolean;
}




