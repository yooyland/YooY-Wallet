import AsyncStorage from '@react-native-async-storage/async-storage';
import { firebaseAuth, firestore } from '@/lib/firebase';
import { isAdmin } from '@/constants/admins';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { v4 as uuidv4 } from 'uuid';
import { create } from 'zustand';
import { Platform } from 'react-native';
import { createJSONStorage, persist } from 'zustand/middleware';
import { doc, setDoc, updateDoc, serverTimestamp, collection, deleteDoc } from 'firebase/firestore';
import { ref as storageRef, uploadString, uploadBytes, getDownloadURL } from 'firebase/storage';
import { firebaseStorage } from '@/lib/firebase';
import { signInAnonymously } from 'firebase/auth';

/** Stable key for a DM pair: sorted UIDs joined by '_'. A↔B always yields the same key. */
export function getDmPairKey(uid1: string, uid2: string): string {
  if (!uid1 || !uid2) return '';
  return [uid1, uid2].slice().sort().join('_');
}

export interface KakaoRoom {
  id: string;
  title: string;
  members: string[]; // userIds
  createdBy?: string; // room owner (creator)
  lastMessage?: string;
  lastMessageAt?: number;
  unreadCount: number;
  avatarUrl?: string;
  expiresAt?: number; // TTL 방 만료 시각 (ms), 일반 방은 undefined
  type?: 'dm' | 'group' | 'ttl' | 'secret' | 'notice';
  messageTtlMs?: number; // 메시지 자동 소멸 TTL (ms) - ttl 타입에서 사용
  tags?: string[];
  /** DM only: stable pair key (sorted UIDs) for reuse lookup */
  dmPairKey?: string;
  // 메타 정보(옵션): 설명, 공개 여부 등
  description?: string;
  isPublic?: boolean;
}

export interface KakaoMessage {
  id: string;
  roomId: string;
  senderId: string;
  content: string;
  createdAt: number;
  readBy: string[];
  type?: 'text' | 'image' | 'video' | 'file' | 'location' | 'link' | 'system' | 'album';
  /** Back-compat: legacy field name used by existing renderer */
  imageUrl?: string;
  /** Normalized: primary remote/local URL for this message (same value as imageUrl for media) */
  url?: string;
  /** Normalized thumbnail URL (optional). If absent and mimeType is image/*, render direct image. */
  thumbnailUrl?: string;
  /** Normalized filename (optional). */
  filename?: string;
  /** Normalized mime type (optional, but preferred). */
  mimeType?: string;
  albumUrls?: string[]; // type === 'album'일 때 다중 이미지 URL 목록
  replyToId?: string;
  // 누가 어떤 이모지를 선택했는지: userId -> emoji
  reactionsByUser?: Record<string, string>;
  // 집계된 카운트(빠른 렌더용)
  reactionsCount?: Record<string, number>; // emoji -> count
}

const guessMimeType = (type: string, uriOrName?: string): string | undefined => {
  try {
    const u = String(uriOrName || '').toLowerCase();
    const ext = (() => {
      const m = u.match(/\.([a-z0-9]{1,8})(\?|#|$)/i);
      return (m && m[1]) ? m[1].toLowerCase() : '';
    })();
    if (String(type) === 'image') {
      if (ext === 'png') return 'image/png';
      if (ext === 'webp') return 'image/webp';
      if (ext === 'gif') return 'image/gif';
      return 'image/jpeg';
    }
    if (String(type) === 'video') {
      if (ext === 'mov') return 'video/quicktime';
      if (ext === 'webm') return 'video/webm';
      return 'video/mp4';
    }
    if (String(type) === 'file') {
      if (ext === 'pdf') return 'application/pdf';
      if (ext === 'doc') return 'application/msword';
      if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      if (ext === 'xls') return 'application/vnd.ms-excel';
      if (ext === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      if (ext === 'ppt') return 'application/vnd.ms-powerpoint';
      if (ext === 'pptx') return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
      if (ext === 'png') return 'image/png';
      if (ext === 'webp') return 'image/webp';
      if (ext === 'gif') return 'image/gif';
      if (ext === 'mp4') return 'video/mp4';
      if (ext === 'mov') return 'video/quicktime';
    }
  } catch {}
  return undefined;
};

const guessFilename = (fallback: string | undefined, uri?: string): string | undefined => {
  try {
    const f = String(fallback || '').trim();
    if (f && f !== '[file]' && f !== '파일') return f;
  } catch {}
  try {
    const u = String(uri || '');
    const base = u.split('?')[0].split('#')[0];
    const seg = base.split('/').pop() || '';
    const dec = decodeURIComponent(seg);
    if (dec && dec.length >= 3) return dec;
  } catch {}
  return undefined;
};

type RoomRole = 'admin' | 'moderator' | 'member';

export interface RoomSettings {
  basic: {
    description?: string;
    thumbnailUrl?: string;
    inviteCode?: string;
    isPublic: boolean;
    participantLimit?: number | null;
  };
  members: {
    // 강퇴된 멤버 목록
    banned: string[];
    roles: Record<string, RoomRole>; // userId -> role
  };
  permissions: {
    canUploadFiles: boolean;
    canDeleteOrPin: boolean;
    allowLinks: boolean;
    canCreatePolls: boolean;
  };
  security: {
    blacklist: string[];
    reported: string[];
    passwordLock?: string | null;
    twoFactor?: boolean;
    // 방별 해시 사용 우선순위 (전역 설정을 덮어씀). true=해시 사용, false=닉네임 사용, undefined=전역 따름
    useHashInRoom?: boolean | null;
  };
  notifications: {
    messages: boolean;
    mentionsOnly: boolean;
    joinAlerts: boolean;
    sound: 'off' | 'vibrate' | 'sound';
  };
  theme: {
    backgroundType: 'default' | 'custom';
    backgroundImageUrl?: string;
    backgroundColor?: string;
    mode: 'dark' | 'light' | 'system';
    fontScale: number; // 0.8 ~ 1.4
    bubbleColor?: string;
  };
}

const defaultRoomSettings = (room?: Partial<KakaoRoom> & { participantLimit?: number | null }): RoomSettings => ({
  basic: {
    description: room?.description || '',
    thumbnailUrl: room?.avatarUrl || undefined,
    inviteCode: undefined,
    isPublic: typeof room?.isPublic === 'boolean' ? !!room?.isPublic : true,
    participantLimit: (typeof room?.participantLimit === 'number' || room?.participantLimit === null)
      ? (room?.participantLimit as number | null)
      : undefined,
  },
  members: { banned: [], roles: {} },
  // 사용자 편의 기능은 기본 ON
  permissions: { canUploadFiles: true, canDeleteOrPin: true, allowLinks: true, canCreatePolls: true },
  security: { blacklist: [], reported: [], passwordLock: null, twoFactor: false, useHashInRoom: false },
  notifications: { messages: true, mentionsOnly: false, joinAlerts: true, sound: 'sound' },
  theme: { backgroundType: 'default', backgroundImageUrl: undefined, backgroundColor: undefined, mode: 'dark', fontScale: 1.0, bubbleColor: undefined },
});

// Firestore가 undefined를 허용하지 않아, 중첩 객체에서 undefined를 제거
function removeUndefinedDeep<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(removeUndefinedDeep) as unknown as T;
  const out: any = {};
  Object.entries(obj as any).forEach(([k, v]) => {
    const nv = removeUndefinedDeep(v as any);
    if (nv !== undefined) out[k] = nv;
  });
  return out as T;
}

interface KakaoRoomsState {
  rooms: KakaoRoom[];
  messages: Record<string, KakaoMessage[]>; // roomId -> messages
  currentRoomId?: string;
  typing: Record<string, Record<string, boolean>>; // roomId -> { userId: isTyping }
  roomSettings: Record<string, RoomSettings>; // roomId -> settings
  hiddenByRoom: Record<string, Record<string, boolean>>; // roomId -> { messageId: true }
  lastUid?: string; // 퍼시스트 분리용: 마지막 로그인 UID
  roomSubs: Record<string, () => void>; // Firestore room doc subscriptions
}

interface KakaoRoomsActions {
  createRoom: (
    title: string,
    members: string[],
    type?: KakaoRoom['type'],
    expiresAt?: number,
    messageTtlMs?: number,
    tags?: string[],
    avatarUrl?: string,
    password?: string,
    participantLimit?: number
  ) => KakaoRoom;
  enterRoom: (roomId: string) => void;
  sendMessage: (roomId: string, senderId: string, content: string, type?: KakaoMessage['type'], imageUrl?: string, replyToId?: string, albumUrls?: string[], meta?: Partial<Pick<KakaoMessage,'mimeType'|'filename'|'thumbnailUrl'|'url'>>) => KakaoMessage;
  markRead: (roomId: string, userId: string, lastReadMessageId?: string) => void;
  setRoomTTL: (roomId: string, expiresAt: number) => void;
  setMessageTTL: (roomId: string, ttlMs: number) => void;
  setRoomPrivacy: (roomId: string, isPublic: boolean, password?: string | null) => Promise<void>;
  getRoomById: (roomId: string) => KakaoRoom | undefined;
  getMessages: (roomId: string) => KakaoMessage[];
  toggleReaction: (roomId: string, messageId: string, emoji: string, userId: string) => void;
  deleteMessage: (roomId: string, messageId: string) => void;
  hideForUser: (roomId: string, messageId: string, userId?: string) => void;
  unhideForUser: (roomId: string, messageId: string) => void;
  updateMessage: (roomId: string, messageId: string, updates: Partial<KakaoMessage>) => void;
  setTyping: (roomId: string, userId: string, isTyping: boolean) => void;
  setUnreadCount: (roomId: string, count: number) => void;
  removeRooms: (roomIds: string[]) => void;

  // 이전 메시지 로드 (lazy loading)
  loadOlderMessages: (roomId: string, beforeTimestamp: number, limit?: number) => Promise<any[]>;
  
  // 룸 설정
  loadRoomSettings: (roomId: string) => Promise<RoomSettings>;
  saveRoomSettings: (roomId: string, updates: Partial<RoomSettings>) => Promise<void>;
  updateRoomMeta: (roomId: string, meta: Partial<Pick<KakaoRoom, 'title' | 'description' | 'avatarUrl' | 'isPublic' | 'tags' | 'createdBy'>>) => Promise<void>;
  generateInvite: (roomId: string) => Promise<{ code: string; qrUrl: string }>;

  // 멤버 관리
  setMemberRole: (roomId: string, userId: string, role: RoomRole | null) => Promise<void> | void;
  kickMember: (roomId: string, userId: string) => Promise<void> | void;
  closeChatForUser: (roomId: string, userId: string) => Promise<void> | void;
  // 내 화면에서만 채팅방 초기화 (로컬 메시지/숨김정보 제거)
  resetRoomForUser: (roomId: string, userId: string) => void;
  // 사용자가 방에서 나가기: 방장이면 방을 아카이브 처리, 일반 멤버면 멤버 목록에서 제거
  leaveRoom: (roomId: string, userId: string) => Promise<void>;
  // 1:1 DM 방을 기존 방 우선으로 열고 없으면 생성
  getOrCreateDmRoom: (me: string, other: string) => Promise<string>;
}

export const useKakaoRoomsStore = create<KakaoRoomsState & KakaoRoomsActions>()(
  persist(
    (set, get) => ({
      // 내부 유틸: 방 권한 오류 발생 시 멤버십을 보강하고 재시도할 때 사용
      // 주로 웹에서 익명 로그인 직후 rules에 의해 PERMISSION_DENIED가 나는 경우가 있어 즉시 멤버 문서를 기록합니다.
      _ensureMember: async (roomId: string) => {
        try {
          if (!firebaseAuth.currentUser && Platform.OS === 'web') { try { await signInAnonymously(firebaseAuth); } catch {} }
          const uid = firebaseAuth.currentUser?.uid || 'me';
          const memberRef = doc(firestore, 'rooms', roomId, 'members', uid);
          await setDoc(memberRef, { joinedAt: serverTimestamp() }, { merge: true });
        } catch {}
      },
      rooms: [],
      messages: {},
      typing: {},
      roomSettings: {},
      hiddenByRoom: {},
      lastUid: (firebaseAuth?.currentUser?.uid || 'me'),
      roomSubs: {},

      // 1:1 DM 방: 동일 유저쌍이면 기존 방 재사용, 없을 때만 생성 (dmPairKey로 중복 방지)
      getOrCreateDmRoom: async (me: string, other: string) => {
        try { if (!firebaseAuth.currentUser && Platform.OS === 'web') { try { await signInAnonymously(firebaseAuth); } catch {} } } catch {}
        const myUid = me || (firebaseAuth.currentUser?.uid || 'me');
        const friendUid = other;
        if (!friendUid) throw new Error('friendUid required');
        const pairKey = getDmPairKey(myUid, friendUid);
        if (!pairKey) throw new Error('invalid dm pair');

        // 1) 로컬에서 기존 DM 탐색: dmPairKey 일치 또는 멤버 2명 일치
        try {
          const local = get().rooms.find((r: any) => {
            if (r.type !== 'dm') return false;
            if (r.dmPairKey === pairKey) return true;
            const mem = Array.isArray(r.members) ? r.members : [];
            return mem.length === 2 && mem.includes(myUid) && mem.includes(friendUid);
          });
          if (local?.id) return local.id;
        } catch {}

        // 2) Firestore에서 기존 DM 탐색: dmPairKey 우선(동일 유저쌍 재사용), 없으면 members 쿼리
        // Firestore 인덱스: rooms 컬렉션 (type Asc, dmPairKey Asc)
        try {
          const { query, collection, where, getDocs, limit } = await import('firebase/firestore');
          let snap = await getDocs(query(
            collection(firestore, 'rooms'),
            where('type', '==', 'dm'),
            where('dmPairKey', '==', pairKey),
            limit(1)
          ));
          if (snap.empty) {
            snap = await getDocs(query(
              collection(firestore, 'rooms'),
              where('type', '==', 'dm'),
              where(`members.${myUid}`, '==', true) as any,
              where(`members.${friendUid}`, '==', true) as any,
              limit(1)
            ));
          }
          if (!snap.empty) {
            const docSnap = snap.docs[0];
            const id = docSnap.id;
            const data = docSnap.data();
            const membersArr = [myUid, friendUid];
            try {
              set((s) => {
                if (s.rooms.some((r: any) => r.id === id)) return s;
                return {
                  rooms: [{ id, title: 'DM', members: membersArr, unreadCount: 0, type: 'dm', lastMessageAt: Date.now(), dmPairKey: pairKey }, ...s.rooms ],
                } as any;
              });
            } catch {}
            return id;
          }
        } catch {}

        // 3) 새 DM 방 생성 (dmPairKey 저장으로 이후 조회 일관)
        const { doc, writeBatch, serverTimestamp } = await import('firebase/firestore');
        const batch = writeBatch(firestore);
        const roomId = uuidv4();
        const roomRef = doc(firestore, 'rooms', roomId);
        const now = serverTimestamp();
        batch.set(roomRef, {
          type: 'dm',
          dmPairKey: pairKey,
          title: 'DM',
          members: { [myUid]: true, [friendUid]: true },
          isPublic: false,
          createdBy: myUid,
          createdAt: now,
          updatedAt: now,
          lastActiveAt: Date.now(),
          memberCount: 2,
        } as any, { merge: true } as any);
        // 멤버 문서 (양쪽 동일한 멤버십 + unread 0)
        batch.set(doc(firestore, 'rooms', roomId, 'members', myUid), { role: 'member', joinedAt: now, unread: 0 } as any, { merge: true } as any);
        batch.set(doc(firestore, 'rooms', roomId, 'members', friendUid), { role: 'member', joinedAt: now, unread: 0 } as any, { merge: true } as any);
        const nowMs = Date.now();
        const membersArr = [myUid, friendUid];
        // 양쪽 joinedRooms: 동일 구조로 방 목록/헤더 대칭 (members, lastActiveAt 포함)
        batch.set(doc(firestore, 'users', myUid, 'joinedRooms', roomId), { dmWith: friendUid, joinedAt: now, type: 'dm', members: membersArr, lastActiveAt: nowMs, unread: 0 } as any, { merge: true } as any);
        batch.set(doc(firestore, 'users', friendUid, 'joinedRooms', roomId), { dmWith: myUid, joinedAt: now, type: 'dm', members: membersArr, lastActiveAt: nowMs, unread: 0 } as any, { merge: true } as any);
        await batch.commit();
        // 로컬 반영 (dmPairKey 포함하여 이후 재조회 시 재사용)
        try { set((s)=>({ rooms: [{ id: roomId, title: 'DM', members: membersArr, unreadCount: 0, type: 'dm', lastMessageAt: nowMs, dmPairKey: pairKey }, ...s.rooms ] })); } catch {}
        return roomId;
      },

      createRoom: (title, members, type, expiresAt, messageTtlMs, tags = [], avatarUrl, password, participantLimit) => {
        // 기본 타입 판정
        let finalType: KakaoRoom['type'] | undefined = type || (members.length <= 2 ? 'dm' : 'group');
        // TTL 입력값이 주어진 경우에는 생성 경로가 어디든 TTL 방으로 강제 고정
        if ((expiresAt && expiresAt > 0) || (messageTtlMs && messageTtlMs > 0)) {
          finalType = 'ttl';
        }
        // TTL 방인데 메시지 TTL이 비어 있으면 기본 30초로 보정
        if (finalType === 'ttl' && (!messageTtlMs || messageTtlMs <= 0)) {
          messageTtlMs = 30 * 1000;
        }
        // 공지방은 관리자만 생성 가능
        if (finalType === 'notice') {
          const email = firebaseAuth.currentUser?.email || '';
          if (!email || !isAdmin(email)) {
            finalType = members.length <= 2 ? 'dm' : 'group';
          }
        }
        const creatorUid = firebaseAuth.currentUser?.uid || 'me';
        const room: KakaoRoom = {
          id: uuidv4(),
          title,
          members,
          createdBy: creatorUid,
          unreadCount: 0,
          lastMessage: undefined,
          lastMessageAt: undefined,
          type: finalType,
          isPublic: (finalType === 'dm' || finalType === 'secret') ? false : true,
          // 생성 직후 UI에서 바로 읽을 수 있도록 값을 강제로 반영
          expiresAt: expiresAt || undefined,
          messageTtlMs: (finalType === 'ttl' ? (messageTtlMs || 0) : 0) || undefined,
          tags: Array.from(new Set((tags||[]).map(t => String(t).trim().toLowerCase()).filter(Boolean))),
          avatarUrl: avatarUrl,
        };
        set((s) => ({ rooms: [room, ...s.rooms] }));
        // 생성 직후 즉시 TTL 값을 스토어에 반영(입장 지연/동기화 지연 보정)
        try {
          if (expiresAt && expiresAt > 0) {
            const { rooms } = get();
            set((s) => ({
              rooms: (s.rooms || []).map(r => r.id === room.id ? { ...r, expiresAt } : r),
            }));
          }
          if (messageTtlMs && messageTtlMs > 0) {
            const ttlVal = messageTtlMs;
            set((s) => ({
              rooms: (s.rooms || []).map(r => r.id === room.id ? { ...r, messageTtlMs: ttlVal } : r),
            }));
          }
        } catch {}

        // Firestore에 rooms 컬렉션 동기화 (best-effort)
        try {
          // createRoom은 동기 반환이므로 익명 로그인은 fire-and-forget 처리
          if (!firebaseAuth.currentUser && Platform.OS === 'web') { try { signInAnonymously(firebaseAuth).catch(()=>{}); } catch {}
          }
          const ref = doc(firestore, 'rooms', room.id);
          const now = Date.now();
          const payload: Record<string, any> = {
            title: room.title,
            title_lower: String(room.title || '').toLowerCase(),
            tags: room.tags || [],
            tags_lower: Array.isArray(room.tags) ? room.tags.map(t => String(t).toLowerCase()) : [],
            isPublic: (typeof room.isPublic === 'boolean') ? room.isPublic : true,
            type: room.type || 'group',
            memberCount: Array.isArray(room.members) ? room.members.length : 0,
            lastActiveAt: now,
            messageTtlMs: room.type === 'ttl' ? (room.messageTtlMs || null) : null,
            expiresAt: room.expiresAt || null,
            createdBy: creatorUid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            settings: (() => {
              const base = defaultRoomSettings({ ...room, participantLimit: (participantLimit ?? undefined) as any });
              const uid = firebaseAuth.currentUser?.uid || 'me';
              return removeUndefinedDeep({
                ...base,
                members: { banned: [], roles: { [uid]: 'admin' as RoomRole } },
              });
            })(),
            avatarUrl: room.avatarUrl || null,
          };
          void setDoc(ref, payload, { merge: true });
          // 모든 멤버에게 멤버십 및 joinedRooms 기록 (초대된 사람도 방 목록에 표시)
          // createRoom은 동기 반환이므로 비동기 쓰기는 백그라운드에서 실행
          const allMembers = Array.isArray(members) ? members : [creatorUid];
          void (async () => {
            try {
              for (const memberId of allMembers) {
                try {
                  const isCreator = memberId === creatorUid;
                  const memberRef = doc(firestore, 'rooms', room.id, 'members', memberId);
                  const userRoomRef = doc(firestore, 'users', memberId, 'joinedRooms', room.id);
                  await setDoc(memberRef, { joinedAt: serverTimestamp(), role: isCreator ? 'admin' : 'member', unread: 0 }, { merge: true });
                  await setDoc(userRoomRef, {
                    joinedAt: serverTimestamp(),
                    title: room.title,
                    type: room.type || 'group',
                    createdBy: creatorUid,
                    members: allMembers,
                    lastActiveAt: now,
                    avatarUrl: room.avatarUrl || null,
                    isPublic: room.isPublic ?? true,
                    unread: 0,
                  }, { merge: true });
                } catch {}
              }
              await updateDoc(ref, { memberCount: allMembers.length, updatedAt: serverTimestamp() } as any).catch(async () => { try { await setDoc(ref, { memberCount: allMembers.length, updatedAt: serverTimestamp() } as any, { merge: true }); } catch {} });
            } catch {}
          })();
        } catch {}
        return room;
      },

      enterRoom: (roomId) => {
        set({ currentRoomId: roomId });
        // 보장: 멤버십 기록
        (async () => { try { await (get() as any)._ensureMember(roomId); } catch {} })();
        // 실시간 룸 메타 구독(중복 방지)
        (async () => {
          try {
            const subs = get().roomSubs || {};
            if (!subs[roomId]) {
              const { doc, onSnapshot, collection, query, orderBy, limit: qlimit } = await import('firebase/firestore');
              // 룸 메타 구독
              const unsubRoom = onSnapshot(doc(firestore, 'rooms', roomId), (snap) => {
                try {
                  if (!snap.exists()) return;
                  const data: any = snap.data() || {};
                  // members: Firestore는 map일 수 있음 → 배열로 통일 (1:1/그룹 양쪽 동일 동작)
                  const membersArr = Array.isArray(data.members)
                    ? data.members
                    : data.members && typeof data.members === 'object'
                      ? Object.keys(data.members).filter(Boolean)
                      : [];
                  const merged = { ...data, id: roomId, members: membersArr };
                  set((s) => {
                    const nextRooms = (s.rooms || []).map((r: any) =>
                      r.id === roomId ? { ...r, ...merged, members: (merged.members?.length ? merged.members : r.members) || [] } : r
                    );
                    const prevRS = s.roomSettings?.[roomId] || ({} as any);
                    const prevTTL = prevRS.ttl || {};
                    const ttlMerged = {
                      ...prevTTL,
                      expiresAtMs: Number(data?.expiresAt ?? prevTTL.expiresAtMs ?? 0),
                      messageTtlMs: Number(data?.messageTtlMs ?? prevTTL.messageTtlMs ?? 0),
                    };
                    // settings 전체 병합(roles, ttlSecurity, theme 등)
                    const srvSettings = (data?.settings || {}) as any;
                    const mergedSettings = {
                      ...prevRS,
                      ...srvSettings,
                      ttl: { ...(prevTTL || {}), ...(srvSettings?.ttl || {}), ...ttlMerged },
                      members: {
                        ...(prevRS?.members || {}),
                        ...(srvSettings?.members || {}),
                      },
                      permissions: { ...(prevRS?.permissions || {}), ...(srvSettings?.permissions || {}) },
                      notifications: { ...(prevRS?.notifications || {}), ...(srvSettings?.notifications || {}) },
                      theme: { ...(prevRS?.theme || {}), ...(srvSettings?.theme || {}) },
                      ttlSecurity: { ...(prevRS?.ttlSecurity || {}), ...(srvSettings?.ttlSecurity || {}) },
                    };
                    return {
                      rooms: nextRooms,
                      roomSettings: { ...(s.roomSettings || {}), [roomId]: mergedSettings },
                    } as any;
                  });
                } catch {}
              });
              // 메시지 구독 (최근 500건, createdAt 오름차순)
              let unsubMsgs: undefined | (() => void);
              let unsubMembers: undefined | (() => void);
              // 메시지 onSnapshot 배치/디바운스: 잦은 이벤트를 100ms 단위로 합쳐 상태 갱신(채팅 페이지 부하 완화)
              // OPTIMIZED: Reduced initial load from 500 to 100 for faster room entry
              let latestMsgs: any[] | null = null;
              let flushTimer: any = null;
              try {
                const q = query(
                  collection(firestore, 'rooms', roomId, 'messages'),
                  orderBy('createdAt', 'desc'),
                  qlimit(30)
                );
                let isFirstLoad = true;
                unsubMsgs = onSnapshot(q, (snap) => {
                  try {
                    if (isFirstLoad) {
                      isFirstLoad = false;
                      const incoming: any[] = [];
                      snap.forEach((d: any) => {
                        const v: any = d.data() || {};
                        const createdMs = (() => {
                          try { return typeof v.createdAt?.toMillis === 'function' ? v.createdAt.toMillis() : Number(v.createdAt || 0); } catch { return 0; }
                        })();
                        const rawType = v.type || 'text';
                        const rawUrl = v.url || v.imageUrl || undefined;
                        incoming.push({
                          id: v.id || d.id,
                          roomId,
                          senderId: v.senderId,
                          content: v.content || '',
                          type: rawType,
                          imageUrl: rawUrl,
                          url: rawUrl,
                          thumbnailUrl: v.thumbnailUrl || undefined,
                          filename: v.filename || undefined,
                          mimeType: v.mimeType || undefined,
                          albumUrls: Array.isArray(v.albumUrls) ? v.albumUrls : undefined,
                          replyToId: v.replyToId || undefined,
                          createdAt: createdMs || Date.now(),
                          readBy: Array.isArray(v.readBy) ? v.readBy : [],
                          reactionsByUser: v.reactionsByUser || {},
                          reactionsCount: v.reactionsCount || {},
                        });
                      });
                      const sorted = [...incoming].sort((a: any, b: any) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
                      set((s) => ({
                        messages: {
                          ...(s.messages || {}),
                          [roomId]: sorted,
                        },
                      } as any));
                      const latestId = sorted.length ? sorted[sorted.length - 1]?.id : undefined;
                      if (latestId && get().currentRoomId === roomId && firebaseAuth.currentUser?.uid) {
                        get().markRead(roomId, firebaseAuth.currentUser.uid, latestId);
                      }
                      return;
                    }
                    const changes = snap.docChanges();
                    if (changes.length === 0) return;
                    const added: any[] = [];
                    const modified: any[] = [];
                    const removedIds: Set<string> = new Set();
                    changes.forEach((change: any) => {
                      const d = change.doc;
                      const v: any = d.data() || {};
                      const createdMs = (() => {
                        try { return typeof v.createdAt?.toMillis === 'function' ? v.createdAt.toMillis() : Number(v.createdAt || 0); } catch { return 0; }
                      })();
                      const rawType = v.type || 'text';
                      const rawUrl = v.url || v.imageUrl || undefined;
                      const msg = {
                        id: v.id || d.id,
                        roomId,
                        senderId: v.senderId,
                        content: v.content || '',
                        type: rawType,
                        imageUrl: rawUrl,
                        url: rawUrl,
                        thumbnailUrl: v.thumbnailUrl || undefined,
                        filename: v.filename || undefined,
                        mimeType: v.mimeType || undefined,
                        albumUrls: Array.isArray(v.albumUrls) ? v.albumUrls : undefined,
                        replyToId: v.replyToId || undefined,
                        createdAt: createdMs || Date.now(),
                        readBy: Array.isArray(v.readBy) ? v.readBy : [],
                        reactionsByUser: v.reactionsByUser || {},
                        reactionsCount: v.reactionsCount || {},
                      };
                      if (change.type === 'added') added.push(msg);
                      else if (change.type === 'modified') modified.push(msg);
                      else if (change.type === 'removed') removedIds.add(msg.id);
                    });
                    if (added.length === 0 && modified.length === 0 && removedIds.size === 0) return;
                    set((s) => {
                      let prevMsgs = s.messages?.[roomId] || [];
                      if (removedIds.size > 0) {
                        prevMsgs = prevMsgs.filter((m: any) => !removedIds.has(m.id));
                      }
                      const existingIds = new Set(prevMsgs.map((m: any) => m.id));
                      const newAdded = added.filter((m: any) => !existingIds.has(m.id));
                      let nextMsgs = [...prevMsgs, ...newAdded];
                      if (modified.length > 0) {
                        const modMap = new Map(modified.map((m: any) => [m.id, m]));
                        nextMsgs = nextMsgs.map((m: any) => {
                          const upd = modMap.get(m.id);
                          if (!upd) return m;
                          const merged = { ...upd };
                          if (m.imageUrl && !upd.imageUrl) merged.imageUrl = m.imageUrl;
                          if (Array.isArray(m.albumUrls) && m.albumUrls.length > 0 && (!upd.albumUrls || upd.albumUrls.length === 0)) {
                            merged.albumUrls = m.albumUrls;
                          }
                          return merged;
                        });
                      }
                      nextMsgs.sort((a: any, b: any) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
                      return {
                        messages: { ...(s.messages || {}), [roomId]: nextMsgs },
                      } as any;
                    });
                    // 현재 사용자가 이 방을 보고 있을 때 새 메시지가 오면 즉시 읽음 처리 (배지 증가 방지)
                    if (added.length > 0) {
                      const cur = get().currentRoomId;
                      const uid = firebaseAuth.currentUser?.uid;
                      if (cur === roomId && uid && added.some((m: any) => m.senderId !== uid)) {
                        const latest = added[added.length - 1];
                        get().markRead(roomId, uid, latest?.id);
                      }
                    }
                  } catch {}
                }, () => {});
              } catch {}
              // 멤버 목록 구독: 모든 계정에서 동일하게 members 배열/카운트를 동기화
              try {
                const { collection, onSnapshot } = await import('firebase/firestore');
                unsubMembers = onSnapshot(collection(firestore, 'rooms', roomId, 'members'), (snap) => {
                  try {
                    const ids: string[] = [];
                    snap.forEach((d: any) => { if (d?.id) ids.push(String(d.id)); });
                    set((s) => ({
                      rooms: (s.rooms || []).map((r: any) => r.id === roomId ? { ...r, members: ids, memberCount: ids.length } : r),
                    }) as any);
                  } catch {}
                }, () => {});
              } catch {}
              // 단일 언서브 핸들에 결합
              const combinedUnsub = () => {
                try { unsubRoom && unsubRoom(); } catch {}
                try { unsubMsgs && unsubMsgs(); } catch {}
                try { unsubMembers && unsubMembers(); } catch {}
              };
              set((s) => ({ roomSubs: { ...(s.roomSubs || {}), [roomId]: combinedUnsub } }));
            }
          } catch {}
        })();
      },

      sendMessage: (roomId, senderId, content, type = 'text', imageUrl, replyToId, albumUrls, meta) => {
        // Ensure authenticated before any Firestore writes to avoid permission errors
        try { if (!firebaseAuth.currentUser && Platform.OS === 'web') { try { signInAnonymously(firebaseAuth).catch(()=>{}); } catch {} } } catch {}
        const normalizedUrl = (meta as any)?.url || imageUrl || undefined;
        const normalizedMime = (meta as any)?.mimeType || guessMimeType(String(type), String((meta as any)?.filename || content || normalizedUrl || ''));
        const normalizedFilename = (meta as any)?.filename || guessFilename(content, normalizedUrl);
        const normalizedThumb = (meta as any)?.thumbnailUrl || undefined;
        const msg: KakaoMessage = {
          id: uuidv4(),
          roomId,
          senderId,
          content,
          createdAt: Date.now(),
          readBy: [senderId],
          type,
          imageUrl: normalizedUrl,
          url: normalizedUrl,
          thumbnailUrl: normalizedThumb,
          filename: normalizedFilename,
          mimeType: normalizedMime,
          albumUrls: (type === 'album' && Array.isArray(albumUrls) && albumUrls.length) ? albumUrls : undefined,
          replyToId,
          reactionsByUser: {},
          reactionsCount: {},
        };
        set((s) => {
          const list = s.messages[roomId] || [];
          // 동일 ID 메시지 중복 방지
          if (list.length && list[list.length - 1]?.id === msg.id) {
            return s as any;
          }
          const updatedRooms = s.rooms.map(r => r.id === roomId ? {
            ...r,
            lastMessage: content,
            lastMessageAt: msg.createdAt,
          } : r);
          return {
            rooms: updatedRooms,
            messages: { ...s.messages, [roomId]: [...list, msg] },
          };
        });

        // Firestore rooms 문서의 lastActiveAt 갱신 (best-effort)
        try {
          if (!firebaseAuth.currentUser) { try { signInAnonymously(firebaseAuth).catch(()=>{}); } catch {} }
          const ref = doc(firestore, 'rooms', roomId);
          // 메시지 컬렉션에 기록
          try {
            const mref = doc(collection(firestore, 'rooms', roomId, 'messages'), msg.id);
            // Safety: 업로드 후 영구 URL로 치환하여 1MB 제한/blob 만료 회피 (이미지/비디오 공통)
            const preparePayload = async (): Promise<{ imageUrl: string | null; albumUrls?: string[] | null }> => {
              try {
                let finalUrl = imageUrl || null;
                // helper: upload arbitrary local uri (file://, content://, blob:, data:)
                const uploadLocalFile = async (localUri: string, extHint?: string): Promise<string> => {
                  try {
                    const Plat = (await import('react-native')).Platform;
                    const isWeb = Plat?.OS === 'web';
                    const storage = firebaseStorage;
                    const { ensureAuthedUid } = await import('@/lib/firebase');
                    const realUid = ensureAuthedUid ? await ensureAuthedUid() : senderId;
                    const ext = (() => {
                      const m = String(localUri).match(/\.([A-Za-z0-9]+)(\?|#|$)/);
                      return (m && m[1]) ? m[1].toLowerCase() : (extHint || 'bin');
                    })();
                    const path = `chat/${realUid}/${Date.now()}-${msg.id}.${ext}`;
                    const r = storageRef(storage, path);
                    // data: URIs
                    if (/^data:/i.test(localUri)) {
                      await uploadString(r, String(localUri), 'data_url');
                      return await getDownloadURL(r);
                    }
                    // blob: (web)
                    if (/^blob:/i.test(localUri)) {
                      const resp = await fetch(String(localUri));
                      const b = await resp.blob();
                      await uploadBytes(r, b);
                      return await getDownloadURL(r);
                    }
                    // file:// or content:// (native) → base64로 업로드
                    try {
                      // eslint-disable-next-line @typescript-eslint/no-var-requires
                      const FileSystem = require('expo-file-system');
                      const b64 = await FileSystem.readAsStringAsync(localUri, { encoding: 'base64' });
                      const mimeGuess = ext === 'mp4' ? 'video/mp4' : (ext === 'png' || ext === 'jpg' || ext === 'jpeg' ? `image/${ext === 'png' ? 'png' : 'jpeg'}` : 'application/octet-stream');
                      const dataUrl = `data:${mimeGuess};base64,${b64}`;
                      await uploadString(r, dataUrl, 'data_url');
                      return await getDownloadURL(r);
                    } catch {
                      // 마지막 폴백: fetch로 읽어 업로드 (일부 안드로이드 content:// 지원)
                      try {
                        const resp = await fetch(String(localUri));
                        const b = await resp.blob();
                        await uploadBytes(r, b);
                        return await getDownloadURL(r);
                      } catch {}
                    }
                    return localUri;
                  } catch { return localUri; }
                };
                // 이미지 dataURL 업로드
                if (finalUrl && /^data:image\//i.test(String(finalUrl))) {
                  const storage = firebaseStorage;
                  const { ensureAuthedUid } = await import('@/lib/firebase');
                  const realUid = ensureAuthedUid ? await ensureAuthedUid() : senderId;
                  const path = `chat/${realUid}/${Date.now()}-${msg.id}.png`;
                  const r = storageRef(storage, path);
                  await uploadString(r, String(finalUrl), 'data_url');
                  finalUrl = await getDownloadURL(r);
                }
                // 비디오 업로드: data: 또는 blob: URL → Storage로 올려 영구 https URL 확보
                if ((msg as any).type === 'video' && finalUrl && !/^https?:\/\//i.test(String(finalUrl))) {
                  finalUrl = await uploadLocalFile(String(finalUrl), 'mp4');
                }
                // 이미지 업로드: file://, content://, blob: 등 로컬 URI면 업로드하여 https URL 확보
                if ((msg as any).type === 'image' && finalUrl && !/^https?:\/\//i.test(String(finalUrl)) && !/^data:/i.test(String(finalUrl))) {
                  // 확장자 힌트는 png로 지정(데이터 URL 케이스는 위에서 처리)
                  finalUrl = await uploadLocalFile(String(finalUrl), 'png');
                }
                // 앨범 처리
                let finalAlbum: string[] | null | undefined = undefined;
                if ((msg as any).type === 'album' && Array.isArray(albumUrls) && albumUrls.length > 0) {
                  const out = await Promise.all((albumUrls || []).map(async (u, idx) => {
                    try {
                      const str = String(u || '');
                      // data URL → 업로드
                      if (str && /^data:image\//i.test(str)) {
                        const { ensureAuthedUid } = await import('@/lib/firebase');
                        const realUid2 = ensureAuthedUid ? await ensureAuthedUid() : senderId;
                        const r = storageRef(firebaseStorage, `chat/${realUid2}/${Date.now()}-${msg.id}-${idx}.png`);
                        await uploadString(r, str, 'data_url');
                        return await getDownloadURL(r);
                      }
                      // http(s) 이미 URL이면 그대로 사용
                      if (/^https?:\/\//i.test(str)) return str;
                      // file://, content:// 등 로컬 URI → 업로드
                      return await uploadLocalFile(str, 'png');
                    } catch { return ''; }
                  }));
                  finalAlbum = out.filter((u) => typeof u === 'string' && String(u));
                }
                // 일반 파일 업로드(type === 'file')
                if ((msg as any).type === 'file' && finalUrl && !/^https?:\/\//i.test(String(finalUrl))) {
                  // 확장자 추출 후 업로드
                  finalUrl = await uploadLocalFile(String(finalUrl));
                }
                if (finalUrl && /^data:image\//i.test(String(finalUrl))) finalUrl = null;
                return { imageUrl: finalUrl, albumUrls: finalAlbum };
              } catch { return { imageUrl: null, albumUrls: null }; }
            };
            // 업로드가 완료되어 최종 URL이 준비된 상태에서만 Firestore에 기록한다.
            // (수신자 측 "업로드 지연"/무한 로딩의 원인: url/imageUrl=null 상태의 메시지가 먼저 전달됨)
            void (async () => {
              const safe = await preparePayload();
              const finalUrl = safe?.imageUrl || null;
              const finalAlbum = (type === 'album') ? (safe?.albumUrls || []) : null;
              // 업로드 실패 시에는 서버에 "불완전한 미디어"를 남기지 않음 (수신자 무한 로딩 방지)
              if ((type === 'image' || type === 'video' || type === 'file') && !finalUrl) return;
              if (type === 'album' && (!Array.isArray(finalAlbum) || finalAlbum.length === 0)) return;
              try {
                await setDoc(mref, {
                  id: msg.id,
                  roomId,
                  senderId,
                  content,
                  type,
                  filename: normalizedFilename || null,
                  mimeType: normalizedMime || null,
                  thumbnailUrl: normalizedThumb || null,
                  imageUrl: finalUrl,
                  url: finalUrl,
                  albumUrls: finalAlbum,
                  replyToId: replyToId || null,
                  createdAt: serverTimestamp(),
                } as any, { merge: true });
              } catch {}
              // 로컬 메시지도 업로드된 최종 URL로 동기화
              try {
                set((s) => {
                  const list = s.messages[roomId] || [];
                  const next = list.map((m) => {
                    if (m.id !== msg.id) return m;
                    const patched: any = { ...m };
                    if (type === 'album') {
                      patched.albumUrls = Array.isArray(finalAlbum) ? finalAlbum : [];
                      patched.type = 'album';
                    } else {
                      if (finalUrl) { patched.imageUrl = finalUrl; patched.url = finalUrl; }
                      patched.type = type;
                    }
                    patched.filename = normalizedFilename || patched.filename;
                    patched.mimeType = normalizedMime || patched.mimeType;
                    patched.thumbnailUrl = normalizedThumb || patched.thumbnailUrl;
                    return patched as typeof m;
                  });
                  return { messages: { ...s.messages, [roomId]: next } } as any;
                });
              } catch {}
            })();
          } catch {}
          void updateDoc(ref, {
            lastActiveAt: serverTimestamp(),
            lastMessage: content || (type === 'image' ? '[이미지]' : ''),
            updatedAt: serverTimestamp(),
          } as any).catch(async()=>{ try { await setDoc(ref, { lastActiveAt: serverTimestamp(), lastMessage: content || (type === 'image' ? '[이미지]' : ''), updatedAt: serverTimestamp() } as any, { merge: true }); } catch {} });
          // 다른 멤버의 unread +1 at write time (roomMembers + userRooms). 발신자는 제외.
          try {
            const displayContent = content || (type === 'image' ? '[이미지]' : type === 'file' ? '[파일]' : type === 'album' ? '[앨범]' : '');
            const lastMsgAt = msg.createdAt;
            void (async () => {
              try {
                let memberIds: string[] = [];
                try { memberIds = (get().rooms.find(r=>r.id===roomId)?.members || []) as string[]; } catch {}
                if (!Array.isArray(memberIds) || memberIds.length === 0) {
                  try {
                    const { getDocs, collection } = await import('firebase/firestore');
                    const ms = await getDocs(collection(firestore, 'rooms', roomId, 'members'));
                    memberIds = ms.docs.map(d=>d.id);
                  } catch {}
                }
                const { increment } = await import('firebase/firestore');
                const others = (memberIds || []).filter((uid: string) => uid && uid !== senderId);
                await Promise.all(others.map(async (uid: string) => {
                  try {
                    const mref = doc(firestore, 'rooms', roomId, 'members', uid);
                    await setDoc(mref, { unread: increment(1), lastServerAt: serverTimestamp() } as any, { merge: true });
                  } catch {}
                }));
                // userRooms (joinedRooms): unread +1, lastMessage, lastMessageAt so room list is source of truth
                await Promise.all(others.map(async (uid: string) => {
                  try {
                    const userRoomRef = doc(firestore, 'users', uid, 'joinedRooms', roomId);
                    await setDoc(userRoomRef, {
                      unread: increment(1),
                      lastMessage: displayContent,
                      lastMessageAt: lastMsgAt,
                      lastActiveAt: lastMsgAt,
                    } as any, { merge: true });
                  } catch {}
                }));
              } catch {}
            })();
          } catch {}
        } catch {}
        return msg;
      },

      markRead: (roomId, userId, lastReadMessageId) => {
        set((s) => {
        const list = (s.messages?.[roomId] || []).map((m:any) => (Array.isArray(m.readBy) && m.readBy.includes(userId)) ? m : { ...m, readBy: [...(Array.isArray(m.readBy)?m.readBy:[]), userId] });
          // 로컬 방 unread 0 (저장된 unread 상태 모델: 재계산 없음)
          const nextRooms = (s.rooms || []).map((r:any) => r.id === roomId ? { ...r, unreadCount: 0 } : r);
          return { messages: { ...(s.messages||{}), [roomId]: list }, rooms: nextRooms } as any;
        });
        // Firestore: roomMembers (lastReadAt, lastReadMessageId, unreadCount=0) + userRooms (unreadCount=0)
        (async () => {
          try {
            const mref = doc(firestore, 'rooms', roomId, 'members', userId);
            await setDoc(mref, {
              unread: 0,
              lastReadAt: serverTimestamp(),
              ...(lastReadMessageId != null ? { lastReadMessageId } : {}),
            } as any, { merge: true });
          } catch {}
          try {
            const userRoomRef = doc(firestore, 'users', userId, 'joinedRooms', roomId);
            await setDoc(userRoomRef, { unread: 0 } as any, { merge: true });
          } catch {}
          // Firestore: 최근 메시지들의 readBy에 내 uid 추가 (best-effort, 상위 100개)
          try {
            const { collection, query, orderBy, limit: qlimit, getDocs, updateDoc, arrayUnion } = await import('firebase/firestore');
            const q = query(collection(firestore, 'rooms', roomId, 'messages'), orderBy('createdAt', 'desc'), qlimit(100));
            const snap = await getDocs(q);
            await Promise.all(snap.docs.map(async (d) => {
              try {
                await updateDoc(d.ref, { readBy: arrayUnion(userId) } as any);
              } catch {}
            }));
          } catch {}
        })();
      },

      setRoomTTL: (roomId, expiresAt) => {
        set((s) => ({
          rooms: s.rooms.map(r => r.id === roomId ? { ...r, expiresAt } : r),
        }));
        // Persist to Firestore (best-effort)
        try {
          const ref = doc(firestore, 'rooms', roomId);
          void updateDoc(ref, { expiresAt, updatedAt: serverTimestamp() } as any).catch(async()=>{ try { await setDoc(ref, { expiresAt, updatedAt: serverTimestamp() } as any, { merge: true }); } catch {} });
        } catch {}
      },

      setMessageTTL: (roomId, ttlMs) => {
        set((s) => ({
          rooms: s.rooms.map(r => r.id === roomId ? { ...r, messageTtlMs: ttlMs } : r),
        }));
        // Persist to Firestore (best-effort)
        try {
          const ref = doc(firestore, 'rooms', roomId);
          void updateDoc(ref, { messageTtlMs: ttlMs || null, updatedAt: serverTimestamp() } as any).catch(async()=>{ try { await setDoc(ref, { messageTtlMs: ttlMs || null, updatedAt: serverTimestamp() } as any, { merge: true }); } catch {} });
        } catch {}
      },

      // Atomic privacy setter to keep top-level and settings in sync
      setRoomPrivacy: async (roomId, isPublic, password) => {
        const prevSettings = get().roomSettings?.[roomId] || defaultRoomSettings();
        const nextSettings: RoomSettings = {
          ...prevSettings,
          basic: { ...prevSettings.basic, isPublic },
          security: { ...prevSettings.security },
        } as RoomSettings;
        // 규칙:
        // - 비공개로 전환 시: 전달된 password(있으면) 적용, 없으면 기존 값 유지
        // - 공개로 전환 시: 비밀번호는 보관하되, 공개 상태에서는 강제 사용하지 않음 (입장 제한 없음)
        //   → passwordLock은 남겨두되 isPublic=true면 UI/입장에서 비밀번호 요구하지 않음
        //   (완전 삭제를 원하면 별도 "비밀번호 제거" 액션에서 null 처리)
        if (!isPublic) {
          const pwd = (typeof password === 'string' ? password : (prevSettings.security?.passwordLock || '')) || '';
          nextSettings.security.passwordLock = String(pwd || '').trim() || null;
        } else {
          // 공개 전환: 저장은 유지하되, 빈 문자열 전달 시에는 제거를 허용
          if (typeof password === 'string' && String(password).trim() === '') {
            nextSettings.security.passwordLock = null;
          }
        }
        set((s) => ({
          roomSettings: { ...(s.roomSettings || {}), [roomId]: nextSettings },
          rooms: (s.rooms || []).map(r => r.id === roomId ? { ...r, isPublic } : r),
        }));
        try {
          if (!firebaseAuth.currentUser && Platform.OS === 'web') { try { await signInAnonymously(firebaseAuth); } catch {} }
          const ref = doc(firestore, 'rooms', roomId);
          try {
            await updateDoc(ref, { settings: removeUndefinedDeep(nextSettings), isPublic, updatedAt: serverTimestamp() } as any);
          } catch (e) {
            await setDoc(ref, { settings: removeUndefinedDeep(nextSettings), isPublic, updatedAt: serverTimestamp() } as any, { merge: true });
          }
        } catch (e) { console.warn('[rooms] setRoomPrivacy failed', e); }
      },

      getRoomById: (roomId) => {
        const { rooms } = get();
        return rooms.find(r => r.id === roomId);
      },

      getMessages: (roomId) => {
        const { messages, hiddenByRoom } = get();
        const base = messages[roomId] || [];
        const hidden = hiddenByRoom[roomId] || {};
        if (!hidden || !Object.keys(hidden).length) return base;
        return base.filter(m => !hidden[m.id]);
      },

      toggleReaction: (roomId, messageId, emoji, userId) => set((s) => {
        const list = (s.messages[roomId] || []).map(m => {
          if (m.id !== messageId) return m;
          const byUser = { ...(m.reactionsByUser || {}) } as Record<string,string>;
          const counts = { ...(m.reactionsCount || {}) } as Record<string,number>;
          const prev = byUser[userId];
          if (prev === emoji) {
            // 동일 이모지 다시 누르면 제거
            delete byUser[userId];
            counts[emoji] = Math.max((counts[emoji] || 1) - 1, 0);
          } else {
            // 기존 반응 제거 후 새 반응 설정
            if (prev) counts[prev] = Math.max((counts[prev] || 1) - 1, 0);
            byUser[userId] = emoji;
            counts[emoji] = (counts[emoji] || 0) + 1;
          }
          return { ...m, reactionsByUser: byUser, reactionsCount: counts };
        });
        // Firestore에 반응 집계 반영 (best-effort)
        try {
          const ref = doc(firestore, 'rooms', roomId, 'messages', messageId);
          void updateDoc(ref, {
            reactionsByUser: (list.find(m => m.id === messageId)?.reactionsByUser) || {},
            reactionsCount: (list.find(m => m.id === messageId)?.reactionsCount) || {},
            updatedAt: serverTimestamp(),
          } as any).catch(()=>{});
        } catch {}
        return { messages: { ...s.messages, [roomId]: list } };
      }),

      deleteMessage: (roomId, messageId) => {
        set((s) => {
          const list = (s.messages[roomId] || []).filter(m => m.id !== messageId);
          return { messages: { ...s.messages, [roomId]: list } } as any;
        });
        // Firestore 전파 (모두에게 삭제)
        try {
          const ref = doc(firestore, 'rooms', roomId, 'messages', messageId);
          void deleteDoc(ref).catch(()=>{});
        } catch {}
      },

      hideForUser: (roomId, messageId, userId) => set((s) => {
        const roomHidden = { ...(s.hiddenByRoom[roomId] || {}) };
        roomHidden[messageId] = true;
        return { hiddenByRoom: { ...(s.hiddenByRoom || {}), [roomId]: roomHidden } } as any;
      }),

      unhideForUser: (roomId, messageId) => set((s) => {
        const roomHidden = { ...(s.hiddenByRoom[roomId] || {}) };
        delete roomHidden[messageId];
        return { hiddenByRoom: { ...(s.hiddenByRoom || {}), [roomId]: roomHidden } } as any;
      }),

      updateMessage: (roomId, messageId, updates) => set((s) => {
        const list = (s.messages[roomId] || []).map(m => m.id === messageId ? { ...m, ...updates } : m);
        return { messages: { ...s.messages, [roomId]: list } };
      }),

      setTyping: (roomId, userId, isTyping) => set((s) => {
        const cur = s.typing[roomId] || {};
        const nextRoom = { ...cur, [userId]: isTyping };
        return { typing: { ...s.typing, [roomId]: nextRoom } } as any;
      }),

      setUnreadCount: (roomId, count) => set((s) => ({
        rooms: s.rooms.map(r => r.id === roomId ? { ...r, unreadCount: Math.max(0, count) } : r),
      })),

      removeRooms: (roomIds) => {
        try {
          const subs = get().roomSubs || {};
          roomIds.forEach((rid) => { try { subs[rid]?.(); delete subs[rid]; } catch {} });
          set({ roomSubs: subs });
        } catch {}
        set((s) => ({
          rooms: s.rooms.filter(r => !roomIds.includes(r.id)),
          messages: Object.fromEntries(Object.entries(s.messages).filter(([rid]) => !roomIds.includes(rid))) as any,
          roomSettings: Object.fromEntries(Object.entries(s.roomSettings || {}).filter(([rid]) => !roomIds.includes(rid))) as any,
        }));
      },

      // 룸 설정 로드/저장
      loadRoomSettings: async (roomId: string) => {
        const cur = get().roomSettings?.[roomId];
        if (cur) return cur;
        try {
          const ref = doc(firestore, 'rooms', roomId);
          // lazy import to keep bundle size
          const { getDoc } = await import('firebase/firestore');
          const snap = await getDoc(ref);
          const data = snap.exists() ? (snap.data() as any) : {};
          let settings = (data?.settings as RoomSettings) || defaultRoomSettings(data as any);
          // Auto-heal: if password exists, enforce private
          try {
            const hasPassword = !!(settings?.security?.passwordLock);
            const isPublic = !!(settings?.basic?.isPublic);
            if (hasPassword && isPublic) {
              const fixed: RoomSettings = {
                ...settings,
                basic: { ...settings.basic, isPublic: false },
              } as RoomSettings;
              settings = fixed;
              set((s) => ({
                roomSettings: { ...(s.roomSettings || {}), [roomId]: fixed },
                rooms: (s.rooms || []).map((r) => r.id === roomId ? { ...r, isPublic: false } : r),
              }));
              try {
                try { await updateDoc(ref, { settings: removeUndefinedDeep(fixed), isPublic: false, updatedAt: serverTimestamp() } as any); } catch { try { await setDoc(ref, { settings: removeUndefinedDeep(fixed), isPublic: false, updatedAt: serverTimestamp() } as any, { merge: true }); } catch {} }
              } catch {}
              return fixed;
            }
          } catch {}
          set((s) => ({ roomSettings: { ...(s.roomSettings || {}), [roomId]: settings } }));
          return settings;
        } catch {
          const fallback = defaultRoomSettings();
          set((s) => ({ roomSettings: { ...(s.roomSettings || {}), [roomId]: fallback } }));
          return fallback;
        }
      },

      saveRoomSettings: async (roomId: string, updates: Partial<RoomSettings>) => {
        const prev = get().roomSettings?.[roomId] || defaultRoomSettings();
        const next: RoomSettings = {
          ...prev,
          ...updates,
          // 깊은 병합 간단 처리
          basic: { ...prev.basic, ...(updates.basic || {}) },
          members: { ...prev.members, ...(updates.members || {}), roles: { ...(prev.members?.roles || {}), ...((updates.members?.roles) || {}) } },
          permissions: { ...prev.permissions, ...(updates.permissions || {}) },
          security: { ...prev.security, ...(updates.security || {}) },
          notifications: { ...prev.notifications, ...(updates.notifications || {}) },
          theme: { ...prev.theme, ...(updates.theme || {}) },
        } as RoomSettings;
        // 공개/비공개 여부는 호출자가 명시한 값(updates.basic.isPublic)을 우선합니다.
        // 비밀번호가 존재하더라도 공개로 전환하는 것을 막지 않습니다.
        set((s) => ({
          roomSettings: { ...(s.roomSettings || {}), [roomId]: next },
          // keep root meta in local store in sync when isPublic changes through settings
          rooms: (s.rooms || []).map((r) =>
            r.id === roomId
              ? {
                  ...r,
                  isPublic: typeof (updates as any)?.basic?.isPublic === 'boolean'
                    ? Boolean((updates as any).basic.isPublic)
                    : (typeof next.basic?.isPublic === 'boolean' ? next.basic.isPublic : r.isPublic),
                }
              : r
          ),
        }));
        try {
          if (!firebaseAuth.currentUser && Platform.OS === 'web') { try { await signInAnonymously(firebaseAuth); } catch {} }
          const ref = doc(firestore, 'rooms', roomId);
          const payload: any = { settings: removeUndefinedDeep(next), updatedAt: serverTimestamp() };
          if (typeof (updates as any)?.basic?.isPublic === 'boolean') {
            payload.isPublic = Boolean((updates as any).basic.isPublic);
          }
          // 공개/비공개 최상위 플래그는 호출 의도를 그대로 반영 (비번이 있어도 공개 가능)
          try {
            await setDoc(ref, payload, { merge: true });
          } catch (e) {
            // 권한 오류 시 멤버십 보강 후 1회 재시도
            await (get() as any)._ensureMember(roomId);
            await setDoc(ref, payload, { merge: true });
          }
        } catch (e) { console.warn('[rooms] saveRoomSettings failed', e); throw e; }
      },

      updateRoomMeta: async (roomId, meta) => {
        set((s) => ({ rooms: s.rooms.map(r => r.id === roomId ? { ...r, ...meta } : r) }));
        try {
          if (!firebaseAuth.currentUser && Platform.OS === 'web') { try { await signInAnonymously(firebaseAuth); } catch {} }
          const ref = doc(firestore, 'rooms', roomId);
          const payload: any = { ...meta, updatedAt: serverTimestamp() };
          if (typeof (meta as any)?.title === 'string') payload.title_lower = String((meta as any).title).toLowerCase();
          try {
            await setDoc(ref, payload, { merge: true });
          } catch (e) {
            await (get() as any)._ensureMember(roomId);
            await setDoc(ref, payload, { merge: true });
          }
        } catch (e) { console.warn('[rooms] updateRoomMeta failed', e); throw e; }
      },
      transferOwnership: async (roomId: string, newOwnerUserId: string) => {
        try {
          // roles 업데이트: 기존 admin -> moderator, newOwner -> admin
          const prev = get().roomSettings?.[roomId] || defaultRoomSettings();
          const roles = { ...(prev.members?.roles || {}) } as Record<string, RoomRole>;
          const prevAdmins = Object.entries(roles).filter(([,r])=>r==='admin').map(([u])=>u);
          prevAdmins.forEach((u)=>{ roles[u] = 'moderator'; });
          roles[newOwnerUserId] = 'admin';
          const next: RoomSettings = { ...prev, members: { ...(prev.members || { banned: [], roles: {} }), roles } };
          set((s)=>({ roomSettings: { ...(s.roomSettings||{}), [roomId]: next }, rooms: s.rooms.map(r=> r.id===roomId ? { ...r, createdBy: newOwnerUserId } : r) }));
          const ref = doc(firestore, 'rooms', roomId);
          await setDoc(ref, { createdBy: newOwnerUserId, settings: removeUndefinedDeep(next), updatedAt: serverTimestamp() } as any, { merge: true });
        } catch (e) {
          console.warn('[rooms] transferOwnership failed', e);
        }
      },

      generateInvite: async (roomId, opts?: { maxAgeSec?: number; maxUses?: number }) => {
        // 6자리 코드 + 만료
        const code = Math.random().toString(36).slice(2, 8).toUpperCase();
        const deep = `yooy://invite?room=${roomId}&code=${code}`;
        const qrUrl = `https://chart.googleapis.com/chart?cht=qr&chs=400x400&chld=H|1&chl=${encodeURIComponent(deep)}`;
        const maxAgeSec = Math.max(60, Number(opts?.maxAgeSec || (3 * 24 * 3600))); // 기본 3일
        const expiresAt = Date.now() + maxAgeSec * 1000;
        const prev = get().roomSettings?.[roomId] || defaultRoomSettings();
        const next: RoomSettings = { ...prev, basic: { ...prev.basic, inviteCode: code }, notifications: { ...(prev.notifications||{ messages:true, mentionsOnly:false, joinAlerts:true, sound:'sound' as any }) } } as any;
        // 로컬 반영
        set((s) => ({ roomSettings: { ...(s.roomSettings || {}), [roomId]: next } }));
        try {
          const ref = doc(firestore, 'rooms', roomId);
          try { await updateDoc(ref, { settings: removeUndefinedDeep({ ...next, basic: { ...next.basic, inviteExpiresAt: expiresAt } }), updatedAt: serverTimestamp() } as any); } catch { try { await setDoc(ref, { settings: removeUndefinedDeep({ ...next, basic: { ...next.basic, inviteExpiresAt: expiresAt } }), updatedAt: serverTimestamp() } as any, { merge: true }); } catch {} }
          // invites 서브컬렉션에 히스토리 기록 (선택)
          try {
            const invRef = doc(collection(firestore, 'rooms', roomId, 'invites'));
            await setDoc(invRef, { code, deep, createdAt: serverTimestamp(), expiresAt, maxUses: Number(opts?.maxUses||0)||null, uses: 0 } as any);
          } catch {}
        } catch {}
        return { code, qrUrl, deepLink: deep, expiresAt };
      },

      // ===== 멤버 관리 =====
      setMemberRole: async (roomId, userId, role) => {
        const prev = get().roomSettings?.[roomId] || defaultRoomSettings();
        const roles = { ...(prev.members?.roles || {}) } as Record<string, RoomRole>;
        if (role) roles[userId] = role; else delete roles[userId];
        const next: RoomSettings = { ...prev, members: { ...(prev.members || { banned: [], roles: {} }), roles } };
        set((s) => ({ roomSettings: { ...(s.roomSettings || {}), [roomId]: next } }));
        try {
          const ref = doc(firestore, 'rooms', roomId);
          try { await updateDoc(ref, { settings: next, updatedAt: serverTimestamp() } as any); } catch { try { await setDoc(ref, { settings: next, updatedAt: serverTimestamp() } as any, { merge: true }); } catch {} }
        } catch {}
      },

      kickMember: async (roomId, userId) => {
        const prevSettings = get().roomSettings?.[roomId] || defaultRoomSettings();
        const banned = Array.from(new Set([...(prevSettings.members?.banned || []), userId]));
        const roles = { ...(prevSettings.members?.roles || {}) };
        delete roles[userId];
        const nextSettings: RoomSettings = { ...prevSettings, members: { banned, roles } };
        set((s) => ({
          rooms: s.rooms.map(r => r.id === roomId ? { ...r, members: (r.members || []).filter(id => id !== userId) } : r),
          roomSettings: { ...(s.roomSettings || {}), [roomId]: nextSettings },
        }));
        try {
          const ref = doc(firestore, 'rooms', roomId);
          try { await updateDoc(ref, { members: (get().rooms.find(r=>r.id===roomId)?.members || []), settings: nextSettings, updatedAt: serverTimestamp() } as any); } catch { try { await setDoc(ref, { members: (get().rooms.find(r=>r.id===roomId)?.members || []), settings: nextSettings, updatedAt: serverTimestamp() } as any, { merge: true }); } catch {} }
        } catch {}
      },

      closeChatForUser: async (roomId, userId) => {
        // 인증 보장 (권한 오류 방지)
        try { if (!firebaseAuth.currentUser && Platform.OS === 'web') { try { await signInAnonymously(firebaseAuth); } catch {} } } catch {}
        // 로컬에서만 해당 유저를 멤버 목록에서 제거 (차단 아님)
        set((s) => ({
          rooms: s.rooms.map(r => r.id === roomId ? { ...r, members: (r.members || []).filter(id => id !== userId) } : r),
        }));
        try {
          const ref = doc(firestore, 'rooms', roomId);
          try { await updateDoc(ref, { members: (get().rooms.find(r=>r.id===roomId)?.members || []), updatedAt: serverTimestamp() } as any); } catch { try { await setDoc(ref, { members: (get().rooms.find(r=>r.id===roomId)?.members || []), updatedAt: serverTimestamp() } as any, { merge: true }); } catch {} }
        } catch {}
      },

      // 이전 메시지 로드 (lazy loading)
      loadOlderMessages: async (roomId: string, beforeTimestamp: number, limit: number = 30) => {
        try {
          const { collection, query, orderBy, where, getDocs, limit: qlimit } = await import('firebase/firestore');
          const q = query(
            collection(firestore, 'rooms', roomId, 'messages'),
            where('createdAt', '<', beforeTimestamp),
            orderBy('createdAt', 'desc'),
            qlimit(limit)
          );
          const snap = await getDocs(q);
          const older: any[] = [];
          snap.forEach((d: any) => {
            const v: any = d.data() || {};
            const createdMs = (() => {
              try { return typeof v.createdAt?.toMillis === 'function' ? v.createdAt.toMillis() : Number(v.createdAt || 0); } catch { return 0; }
            })();
            older.push({
              id: v.id || d.id,
              roomId,
              senderId: v.senderId,
              content: v.content || '',
              type: v.type || 'text',
              imageUrl: v.imageUrl || undefined,
              albumUrls: Array.isArray(v.albumUrls) ? v.albumUrls : undefined,
              replyToId: v.replyToId || undefined,
              createdAt: createdMs || Date.now(),
              readBy: Array.isArray(v.readBy) ? v.readBy : [],
              reactionsByUser: v.reactionsByUser || {},
              reactionsCount: v.reactionsCount || {},
            });
          });
          if (older.length > 0) {
            set((s) => {
              const prev = s.messages?.[roomId] || [];
              const existingIds = new Set(prev.map((m: any) => m.id));
              const newOlder = older.filter((m: any) => !existingIds.has(m.id));
              const merged = [...newOlder, ...prev].sort((a: any, b: any) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
              return { messages: { ...(s.messages || {}), [roomId]: merged } } as any;
            });
          }
          return older;
        } catch (err) {
          console.error('[loadOlderMessages] error:', err);
          return [];
        }
      },

      // 내 화면에서만 채팅방 초기화
      resetRoomForUser: (roomId: string, userId: string) => {
        // 서버에는 영향 주지 않음. 로컬 메시지/숨김 정보만 초기화
        set((s) => ({
          messages: { ...(s.messages || {}), [roomId]: [] },
          hiddenByRoom: { ...(s.hiddenByRoom || {}), [roomId]: {} as any },
        }) as any);
      },

      // 방 나가기: 방장이면 방을 아카이브 처리하고, 일반 멤버면 내 리스트에서 제거
      leaveRoom: async (roomId: string, userId: string) => {
        try { if (!firebaseAuth.currentUser) { try { await signInAnonymously(firebaseAuth); } catch {} } } catch {}
        // Clean up Firebase listener subscription to prevent memory leak
        try {
          const subs = get().roomSubs || {};
          if (subs[roomId]) {
            subs[roomId]();
            delete subs[roomId];
            set({ roomSubs: { ...subs } });
          }
        } catch {}
        // 현재 방에서 나가는 경우, currentRoomId 초기화
        try {
          const cur = get().currentRoomId;
          if (cur === roomId) {
            set({ currentRoomId: undefined as any });
          }
        } catch {}
        // 현재 역할 확인 (스토어 → Firestore 순서)
        let roles: Record<string, RoomRole> = {};
        try {
          const loc = get().roomSettings?.[roomId];
          if (loc?.members?.roles) roles = loc.members.roles;
          if (!Object.keys(roles).length) {
            const { getDoc } = await import('firebase/firestore');
            const ref = doc(firestore, 'rooms', roomId);
            const snap = await getDoc(ref);
            const data: any = snap.exists() ? snap.data() : {};
            roles = (data?.settings?.members?.roles || {}) as Record<string, RoomRole>;
          }
        } catch {}
        const isAdminUser = String((roles||{})[userId]) === 'admin';

        if (isAdminUser) {
          // 방장: 방 아카이브 처리 (숨김 + 기록 보존)
          try {
            const ref = doc(firestore, 'rooms', roomId);
            try {
              await setDoc(ref, { archived: true, archivedAt: serverTimestamp(), memberCount: 0, updatedAt: serverTimestamp() } as any, { merge: true });
            } catch (e) {
              await (get() as any)._ensureMember(roomId);
              await setDoc(ref, { archived: true, archivedAt: serverTimestamp(), memberCount: 0, updatedAt: serverTimestamp() } as any, { merge: true });
            }
          } catch {}
          // 로컬에서 완전히 제거
          set((s) => ({
            rooms: s.rooms.filter(r => r.id !== roomId),
            messages: Object.fromEntries(Object.entries(s.messages).filter(([rid]) => rid !== roomId)) as any,
            roomSettings: Object.fromEntries(Object.entries(s.roomSettings || {}).filter(([rid]) => rid !== roomId)) as any,
            hiddenByRoom: Object.fromEntries(Object.entries(s.hiddenByRoom || {}).filter(([rid]) => rid !== roomId)) as any,
            typing: Object.fromEntries(Object.entries(s.typing || {}).filter(([rid]) => rid !== roomId)) as any,
          }));
        } else {
          // 일반 멤버: 서버 멤버 목록에서 내 uid만 제거 → 로컬 제거
          try {
            const ref = doc(firestore, 'rooms', roomId);
            let baseMembers: string[] = [];
            // 1) 로컬에 있으면 로컬 멤버 기준
            try { baseMembers = (get().rooms.find(r=>r.id===roomId)?.members || []) as string[]; } catch {}
            // 2) 로컬이 비어있으면 서버에서 한번 조회
            if (!Array.isArray(baseMembers) || baseMembers.length === 0) {
              try {
                const { getDoc } = await import('firebase/firestore');
                const snap = await getDoc(ref);
                baseMembers = (snap.exists() ? ((snap.data() as any)?.members || []) : []) as string[];
              } catch {}
            }
            const afterMembers = (Array.isArray(baseMembers) ? baseMembers : []).filter((id) => id !== userId);
            try {
              await setDoc(ref, { members: afterMembers, memberCount: Math.max(0, afterMembers.length), updatedAt: serverTimestamp() } as any, { merge: true });
            } catch (e) {
              await (get() as any)._ensureMember(roomId);
              await setDoc(ref, { members: afterMembers, memberCount: Math.max(0, afterMembers.length), updatedAt: serverTimestamp() } as any, { merge: true });
            }
          } catch {}
          // 3) 로컬 제거는 마지막에 수행
          set((s) => ({
            rooms: s.rooms.filter(r => r.id !== roomId),
            messages: Object.fromEntries(Object.entries(s.messages).filter(([rid]) => rid !== roomId)) as any,
            roomSettings: Object.fromEntries(Object.entries(s.roomSettings || {}).filter(([rid]) => rid !== roomId)) as any,
            hiddenByRoom: Object.fromEntries(Object.entries(s.hiddenByRoom || {}).filter(([rid]) => rid !== roomId)) as any,
            typing: Object.fromEntries(Object.entries(s.typing || {}).filter(([rid]) => rid !== roomId)) as any,
          }));
        }
        // 4) rooms/{roomId}/members/{userId} 서브컬렉션에서 내 멤버 문서 제거 (둘 다 공통)
        try {
          const memberRef = doc(firestore, 'rooms', roomId, 'members', userId);
          await deleteDoc(memberRef);
        } catch {}
        // 5) 내 joinedRooms에서 제거 (둘 다 공통)
        try {
          const userRoomRef = doc(firestore, 'users', userId, 'joinedRooms', roomId);
          await deleteDoc(userRoomRef);
        } catch {}
      },
    }),
    {
      name: 'yoo-kakao-rooms-store',
      storage: createJSONStorage(() => AsyncStorage),
      version: 5,
      merge: (persistedState: any, currentState: KakaoRoomsState) => {
        const merged = { ...currentState, ...(persistedState as object || {}) } as KakaoRoomsState;
        merged.rooms = [];
        merged.messages = {};
        return merged;
      },
      migrate: (persistedState: any, version: number) => {
        try {
          const s = persistedState as Partial<KakaoRoomsState> | undefined;
          const uidNow = firebaseAuth?.currentUser?.uid || 'me';
          if (!s) return { rooms: [], messages: {}, roomSettings: {}, typing: {}, hiddenByRoom: {}, lastUid: uidNow, roomSubs: {} } as KakaoRoomsState;
          // 계정 불일치 시 완전 초기화하여 계정 간 데이터 섞임 방지
          if ((s as any).lastUid && (s as any).lastUid !== uidNow) {
            return { rooms: [], messages: {}, roomSettings: {}, typing: {}, hiddenByRoom: {}, lastUid: uidNow, roomSubs: {} } as KakaoRoomsState;
          }
          // 과거 거대 데이터 정리: 메시지/히든/타이핑을 최소화
          const currentRoomId = (s as any).currentRoomId as string | undefined;
          const MAX_KEEP = 30;
          const onlyCurrentMessages: Record<string, KakaoMessage[]> = {};
          if (currentRoomId && s.messages && (s.messages as any)[currentRoomId]) {
            const src = ((s.messages as any)[currentRoomId] as KakaoMessage[] | undefined) || [];
            const trimmed = src.slice(-MAX_KEEP).map((m) => {
              const content = m.content && m.content.length > 300 ? m.content.slice(0, 300) : m.content;
              const imageUrl = m.imageUrl && /^https?:\/\//i.test(String(m.imageUrl)) ? m.imageUrl : undefined;
              const albumUrls = Array.isArray((m as any).albumUrls) ? (m as any).albumUrls.filter((u: string) => /^https?:\/\//i.test(String(u))).slice(0, 12) : undefined;
              const out: any = { ...m, content, imageUrl };
              if (albumUrls && albumUrls.length) out.albumUrls = albumUrls; else delete out.albumUrls;
              return out as KakaoMessage;
            });
            onlyCurrentMessages[currentRoomId] = trimmed;
          }
          const hiddenByRoom = currentRoomId && (s.hiddenByRoom && (s.hiddenByRoom as any)[currentRoomId])
            ? { [currentRoomId]: (s.hiddenByRoom as any)[currentRoomId] }
            : {};
          const shrunkRooms = (s.rooms || []).map((r) => ({
            id: r.id,
            title: r.title,
            members: r.members,
            createdBy: r.createdBy,
            lastMessage: r.lastMessage,
            lastMessageAt: r.lastMessageAt,
            unreadCount: r.unreadCount,
            avatarUrl: r.avatarUrl,
            expiresAt: r.expiresAt,
            type: r.type,
            messageTtlMs: r.messageTtlMs,
            tags: r.tags,
            isPublic: r.isPublic,
          })) as KakaoRoom[];
          return {
            rooms: shrunkRooms,
            messages: onlyCurrentMessages,
            currentRoomId: currentRoomId,
            typing: {},
            roomSettings: (s as any).roomSettings || {},
            hiddenByRoom,
            lastUid: uidNow,
            roomSubs: {},
          } as KakaoRoomsState;
        } catch {
          const uidNow = firebaseAuth?.currentUser?.uid || 'me';
          return { rooms: [], messages: {}, roomSettings: {}, typing: {}, hiddenByRoom: {}, lastUid: uidNow, roomSubs: {} } as KakaoRoomsState;
        }
      },
      // 방/메시지는 저장하지 않음 → 앱 시작 시 항상 빈 목록, joinedRooms 구독으로만 채움 (고스트 방 방지)
      partialize: (state) => {
        const currentRoomId = state.currentRoomId;
        const hiddenByRoom = currentRoomId && state.hiddenByRoom[currentRoomId]
          ? { [currentRoomId]: state.hiddenByRoom[currentRoomId] }
          : {};
        const roomSettings = (() => {
          const src = (state as any).roomSettings || {};
          const out: Record<string, any> = {};
          Object.keys(src || {}).forEach((rid) => {
            try {
              const s: any = src[rid] || {};
              const keep: any = {};
              if (s.ttl) {
                keep.ttl = {
                  expiresAtMs: Number(s.ttl.expiresAtMs || 0),
                  messageDeleteOnExpiry: s.ttl.messageDeleteOnExpiry !== false,
                };
              }
              if (s.ttlSecurity) {
                const ts = s.ttlSecurity || {};
                keep.ttlSecurity = {
                  allowImageUpload: ts.allowImageUpload !== false,
                  allowImageDownload: !!ts.allowImageDownload,
                  allowCapture: !!ts.allowCapture,
                  allowExternalShare: !!ts.allowExternalShare,
                };
              }
              if (s.theme) {
                const th = s.theme || {};
                keep.theme = {
                  bubbleColorHex: th.bubbleColorHex,
                  backgroundColorHex: th.backgroundColorHex,
                  fontScaleLevel: th.fontScaleLevel,
                  backgroundImageUrl: th.backgroundImageUrl,
                };
              }
              if (Object.keys(keep).length) out[rid] = keep;
            } catch {}
          });
          return out;
        })();
        return {
          rooms: [],
          messages: {},
          currentRoomId,
          hiddenByRoom,
          roomSettings,
          lastUid: (firebaseAuth?.currentUser?.uid || 'me'),
        } as KakaoRoomsState;
      },
    }
  )
);


