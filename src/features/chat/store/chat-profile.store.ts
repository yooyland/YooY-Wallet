import { firebaseAuth, firestore } from '@/lib/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// ===== 채팅 프로필 타입 =====
export interface ChatProfile {
  id: string;
  userId: string; // App 사용자 ID와 연결
  displayName: string; // 채팅 대화명
  chatName?: string; // 별도 채팅 닉네임(우선 표시)
  useHashInChat?: boolean; // 닉네임 대신 해시 사용 여부
  /** 채팅/프로필에서 표시하는 사용자 ID (Firestore users/{uid}.username와 동기화) */
  username?: string;
  avatar?: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  customStatus?: string;
  bio?: string;
  tags?: string[]; // 친구 검색용 태그
  createdAt: number;
  lastActive: number;
}

// ===== 채팅 프로필 스토어 상태 =====
interface ChatProfileState {
  currentProfile: ChatProfile | null;
  profiles: Record<string, ChatProfile>; // userId -> ChatProfile
  isInitialized: boolean;
}

// ===== 액션 인터페이스 =====
interface ChatProfileActions {
  // 프로필 관리
  setCurrentProfile: (profile: ChatProfile) => void;
  updateProfile: (updates: Partial<ChatProfile>) => void;
  clearProfile: () => void;
  
  // 프로필 CRUD
  createProfile: (profile: Omit<ChatProfile, 'id' | 'createdAt'>) => Promise<ChatProfile>;
  updateProfileById: (userId: string, updates: Partial<ChatProfile>) => void;
  /** Set or merge profile for another user (e.g. DM peer). Does not change currentProfile. */
  setPeerProfile: (userId: string, data: Partial<ChatProfile> & { displayName?: string }) => void;
  deleteProfile: (userId: string) => void;
  getProfile: (userId: string) => ChatProfile | null;
  
  // 상태 관리
  setStatus: (status: ChatProfile['status']) => void;
  setCustomStatus: (status: string) => void;
  setLastActive: (timestamp: number) => void;
  setAvatar: (uri: string) => void;
  
  // 초기화
  initialize: () => Promise<void>;
  reset: () => void;
}

// ===== 스토어 구현 =====
// 안전 스토리지: 웹에서는 IndexedDB 기반 저장(용량 넉넉, 사이트 데이터 삭제 시 함께 비워짐)
const makeSafeJSONStorage = () => {
  if (Platform.OS === 'web') {
    try {
      const hasIDB = typeof indexedDB !== 'undefined' && !!indexedDB;
      if (hasIDB) {
        // 간단한 IDB KV 래퍼 (store: 'kv', key: name, value: string)
        const DB_NAME = 'yoo-chat';
        const STORE = 'kv';
        const openDB = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
          try {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => {
              const db = req.result;
              if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          } catch (e) { reject(e); }
        });
        const idbKV = {
          getItem: async (name: string) => {
            try {
              const db = await openDB();
              return await new Promise<string | null>((resolve, reject) => {
                try {
                  const tx = db.transaction(STORE, 'readonly');
                  const st = tx.objectStore(STORE);
                  const r = st.get(name);
                  r.onsuccess = () => resolve((r.result as string) ?? null);
                  r.onerror = () => reject(r.error);
                } catch (e) { reject(e); }
              });
            } catch { return null; }
          },
          setItem: async (name: string, value: string) => {
            try {
              const db = await openDB();
              await new Promise<void>((resolve, reject) => {
                try {
                  const tx = db.transaction(STORE, 'readwrite');
                  const st = tx.objectStore(STORE);
                  const r = st.put(value, name);
                  r.onsuccess = () => resolve();
                  r.onerror = () => reject(r.error);
                } catch (e) { reject(e); }
              });
            } catch {
              // 마지막 폴백: 메모리 저장
              mem.set(name, value);
            }
          },
          removeItem: async (name: string) => {
            try {
              const db = await openDB();
              await new Promise<void>((resolve, reject) => {
                try {
                  const tx = db.transaction(STORE, 'readwrite');
                  const st = tx.objectStore(STORE);
                  const r = st.delete(name);
                  r.onsuccess = () => resolve();
                  r.onerror = () => reject(r.error);
                } catch (e) { reject(e); }
              });
            } catch { mem.delete(name); }
          },
        } as unknown as Storage;
        // 메모리 폴백 준비
        const mem = new Map<string, string>();
        return createJSONStorage(() => idbKV as any);
      }
    } catch {}
    // IDB 미지원 시 메모리 폴백
    const mem = new Map<string, string>();
    return createJSONStorage(() => ({
      getItem: async (name: string) => (mem.has(name) ? (mem.get(name) as string) : null),
      setItem: async (name: string, value: string) => { mem.set(name, value); },
      removeItem: async (name: string) => { mem.delete(name); },
    }) as any);
  }
  // 네이티브: AsyncStorage 사용, 용량 초과 시 키 정리 후 최소 상태 저장
  return createJSONStorage(() => ({
    getItem: (n: string) => AsyncStorage.getItem(n),
    setItem: async (n: string, v: string) => {
      try {
        await AsyncStorage.setItem(n, v);
      } catch (e) {
        try { await AsyncStorage.removeItem(n); } catch {}
        try { await AsyncStorage.setItem(n, JSON.stringify({ state: { currentProfile: null, profiles: {}, isInitialized: false }, version: 0 })); } catch {}
      }
    },
    removeItem: (n: string) => AsyncStorage.removeItem(n),
  }) as any);
};

export const useChatProfileStore = create<ChatProfileState & ChatProfileActions>()(
  persist(
    (set, get) => ({
      // 초기 상태
      currentProfile: null,
      profiles: {},
      isInitialized: false,

      // 프로필 관리
      setCurrentProfile: (profile) => set({ currentProfile: profile }),

      updateProfile: (updates) => {
        set((state) => ({
          currentProfile: state.currentProfile ? { ...state.currentProfile, ...updates } : null,
          profiles: state.currentProfile ? {
            ...state.profiles,
            [state.currentProfile.userId]: {
              ...state.profiles[state.currentProfile.userId],
              ...updates
            }
          } : state.profiles,
        }));
        // Firestore users/{uid} 동기화: 프로필 페이지에서 변경한 값들을 최대한 반영
        const uid = firebaseAuth.currentUser?.uid;
        if (uid) {
          (async () => {
            try {
              const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
              const authUser = firebaseAuth.currentUser;
              const email = authUser?.email || undefined;
              const payload: any = {
                email,
                updatedAt: serverTimestamp(),
              };
              if (typeof updates.displayName === 'string') payload.displayName = updates.displayName;
              if (typeof updates.chatName === 'string') payload.chatName = updates.chatName || updates.displayName;
              if (typeof updates.customStatus === 'string') payload.customStatus = updates.customStatus;
              if (typeof updates.bio === 'string') payload.bio = updates.bio;
              if (typeof (updates as any).username === 'string') {
                payload.username = (updates as any).username;
                payload.usernameLower = String((updates as any).username).toLowerCase();
              }
              if (typeof updates.avatar === 'string') payload.avatar = updates.avatar;
              await setDoc(doc(firestore, 'users', uid), payload, { merge: true });
            } catch {
              // 네트워크/권한 오류는 조용히 무시
            }
          })();
        }
      },

      clearProfile: () => set({ currentProfile: null }),

      // 프로필 CRUD
      createProfile: async (profileData) => {
        const profile: ChatProfile = {
          ...profileData,
          id: `chat_profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          createdAt: Date.now(),
          chatName: (profileData as any).chatName || (profileData as any).displayName,
          useHashInChat: (profileData as any).useHashInChat ?? false,
        };
        
        set((state) => ({
          profiles: { ...state.profiles, [profileData.userId]: profile },
          currentProfile: profile,
        }));
        
        return profile;
      },

      updateProfileById: (userId, updates) => set((state) => ({
        profiles: {
          ...state.profiles,
          [userId]: state.profiles[userId] ? { ...state.profiles[userId], ...updates } : undefined
        }
      })),

      setPeerProfile: (userId, data) => set((state) => {
        const existing = state.profiles[userId];
        const now = Date.now();
        const merged: ChatProfile = existing
          ? { ...existing, ...data, userId }
          : {
              id: `peer_${userId}`,
              userId,
              displayName: data.displayName || data.chatName || userId,
              chatName: data.chatName ?? data.displayName,
              status: 'offline',
              createdAt: now,
              lastActive: now,
              ...data,
            };
        return {
          profiles: { ...state.profiles, [userId]: merged },
        };
      }),

      deleteProfile: (userId) => set((state) => {
        const newProfiles = { ...state.profiles };
        delete newProfiles[userId];
        return {
          profiles: newProfiles,
          currentProfile: state.currentProfile?.userId === userId ? null : state.currentProfile,
        };
      }),

      getProfile: (userId) => get().profiles[userId] || null,

      // 상태 관리
      setStatus: (status) => get().updateProfile({ status }),
      
      setCustomStatus: (customStatus) => get().updateProfile({ customStatus }),
      
      setLastActive: (timestamp) => get().updateProfile({ lastActive: timestamp }),

      setAvatar: (uri) => {
        const prev = get().currentProfile;
        const uid = firebaseAuth.currentUser?.uid;
        // 스토어 업데이트
        get().updateProfile({ avatar: uri });
        // Firestore users/{uid} 아바타/프로필 동기화
        if (uid) {
          (async () => {
            try {
              const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
              await setDoc(
                doc(firestore, 'users', uid),
                {
                  avatar: uri,
                  updatedAt: serverTimestamp(),
                } as any,
                { merge: true }
              );
            } catch {
              // 네트워크/권한 오류는 조용히 무시 (UI는 로컬 상태로 유지)
            }
          })();
        }
      },

      // 초기화
      initialize: async () => {
        try {
          const uid = firebaseAuth.currentUser?.uid || 'anonymous-user';
          const state = get();
          const authUser = firebaseAuth.currentUser;
          const email = authUser?.email || '';
          const emailLocalPart = (() => {
            try {
              if (!email) return '';
              const [local] = email.split('@');
              return String(local || '').trim();
            } catch {
              return '';
            }
          })();
          const fallbackBaseName = (() => {
            const fromDisplay = String(authUser?.displayName || '').trim();
            if (fromDisplay) return fromDisplay;
            if (emailLocalPart) return emailLocalPart;
            if (uid && uid !== 'anonymous-user') return uid.slice(0, 8);
            return '사용자';
          })();
          // 현재 프로필이 다른 계정의 것이라면 무시
          if (state.currentProfile && state.currentProfile.userId !== uid) {
            set({ currentProfile: null });
          }
          // 해당 uid의 프로필이 있으면 로드
          const existing = state.profiles[uid];
          if (existing) {
            // Firestore에서 username 등 최신 값 로드하여 채팅 리스트·프로필 설정과 동기화
            try {
              const { doc, getDoc, setDoc, serverTimestamp } = await import('firebase/firestore');
              const userSnap = await getDoc(doc(firestore, 'users', uid));
              const userData = userSnap.exists() ? (userSnap.data() as any) : {};
              const remoteDisplay = String(userData?.displayName ?? '').trim();
              const remoteChatName = String(userData?.chatName ?? '').trim();
              const remoteUsername = String(userData?.username ?? '').trim();
              const existingDisplay = String(existing.displayName || '').trim();
              const existingChatName = String(existing.chatName || '').trim();
              const merged = {
                ...existing,
                // Firestore 값이 있으면 사용하되, 비어 있거나 '사용자' 같은 기본값이면
                // 기존 로컬 값이나 이메일/UID 기반 이름을 유지
                username: (remoteUsername && remoteUsername !== '사용자') ? remoteUsername : (existing as any).username,
                displayName: (() => {
                  if (existingDisplay && existingDisplay !== '사용자') return existingDisplay;
                  if (remoteDisplay && remoteDisplay !== '사용자') return remoteDisplay;
                  return fallbackBaseName;
                })(),
                chatName: (() => {
                  if (existingChatName && existingChatName !== '사용자') return existingChatName;
                  if (remoteChatName && remoteChatName !== '사용자') return remoteChatName;
                  return fallbackBaseName;
                })(),
                avatar: userData?.avatar ?? existing.avatar,
                customStatus: userData?.customStatus ?? existing.customStatus,
                bio: userData?.bio ?? existing.bio,
              };
              set({
                currentProfile: merged,
                profiles: { ...state.profiles, [uid]: merged },
                isInitialized: true,
              });
            } catch {
              set({ currentProfile: existing, isInitialized: true });
            }
            // Firestore users/{uid} 문서에 이메일/닉네임/아바타 자동 동기화 (현재 프로필 기준)
            if (uid && uid !== 'anonymous-user') {
              try {
                const current = get().currentProfile;
                await setDoc(
                  doc(firestore, 'users', uid),
                  {
                    email: email || undefined,
                    displayName: (current?.displayName || existing.displayName || fallbackBaseName),
                    chatName: (current?.chatName ?? existing.chatName ?? fallbackBaseName),
                    username: (current as any)?.username ?? (existing as any).username ?? undefined,
                    usernameLower: (current as any)?.username ? String((current as any).username).toLowerCase() : ((existing as any).username ? String((existing as any).username).toLowerCase() : undefined),
                    avatar: (current?.avatar ?? existing.avatar) ?? undefined,
                    updatedAt: serverTimestamp(),
                  } as any,
                  { merge: true }
                );
              } catch {
                // 동기화 실패는 치명적이지 않으므로 무시
              }
            }
            return;
          }
          // 없으면 생성
          const created = await get().createProfile({
            userId: uid,
            displayName: fallbackBaseName,
            status: 'online',
            bio: '채팅 프로필을 설정해보세요!',
          });
          set({ currentProfile: created, isInitialized: true });
          // 새 프로필 생성 시 Firestore users/{uid} 기본 문서도 함께 생성
          if (uid && uid !== 'anonymous-user') {
            try {
              const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
              await setDoc(
                doc(firestore, 'users', uid),
                {
                  email: email || undefined,
                  displayName: created.displayName || fallbackBaseName,
                  chatName: created.chatName || created.displayName || fallbackBaseName,
                  username: (created as any).username || undefined,
                  usernameLower: (created as any).username ? String((created as any).username).toLowerCase() : undefined,
                  avatar: created.avatar || undefined,
                  updatedAt: serverTimestamp(),
                  bio: created.bio ?? '채팅 프로필을 설정해보세요!',
                } as any,
                { merge: true }
              );
            } catch {
              // 실패해도 앱 동작에는 영향 없음
            }
          }
        } catch (error) {
          console.error('Chat profile initialization failed:', error);
        }
      },

      reset: () => set({
        currentProfile: null,
        profiles: {},
        isInitialized: false,
      }),
    }),
    {
      name: 'yoo-chat-profile-store',
      storage: makeSafeJSONStorage(),
      partialize: (state) => {
        const sanitize = (p: ChatProfile | null | undefined): Partial<ChatProfile> | null => {
          if (!p) return null;
          const avatarStr = String(p.avatar || '');
          const isHttpAvatar = !!avatarStr && /^https?:\/\//i.test(avatarStr);
          return {
            id: p.id,
            userId: p.userId,
            displayName: p.displayName,
            chatName: p.chatName,
            username: (p as any).username,
            useHashInChat: p.useHashInChat ?? false,
            // 저장 용량 보호: dataURL/avatar는 퍼시스트하지 않음 (런타임에서만 유지)
            avatar: isHttpAvatar ? p.avatar : undefined,
            // 길이 제한으로 저장 용량 보호
            customStatus: (p.customStatus || '').slice(0, 140),
            bio: (p.bio || '').slice(0, 300),
            createdAt: p.createdAt,
            lastActive: p.lastActive,
            // status는 내부 용도지만 최소 저장(1바이트 수준)
            status: p.status,
          } as Partial<ChatProfile>;
        };

        // 용량 보호: 최근 항목 상위 N개만 보존 (lastActive 기준)
        const MAX_PROFILES_TO_PERSIST = 20;
        const entries = Object.entries(state.profiles || {}) as Array<[string, ChatProfile]>;
        const sorted = entries.sort((a, b) => (Number(b[1]?.lastActive || 0) - Number(a[1]?.lastActive || 0)));
        const limited = sorted.slice(0, MAX_PROFILES_TO_PERSIST);
        const slimProfiles: Record<string, Partial<ChatProfile>> = {};
        limited.forEach(([uid, prof]) => {
          const s = sanitize(prof as ChatProfile);
          if (s) slimProfiles[uid] = s;
        });

        const result = {
          currentProfile: sanitize(state.currentProfile as ChatProfile),
          profiles: slimProfiles,
          isInitialized: state.isInitialized,
        } as any;
        try {
          // 최종 안전장치: 직렬화 크기가 큰 경우 프로필 목록을 비워 용량 초과 방지
          const json = JSON.stringify(result);
          if ((json?.length || 0) > 200_000) {
            return { ...result, profiles: {} };
          }
        } catch {}
        return result;
      },
    }
  )
);
