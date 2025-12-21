import { firebaseAuth } from '@/lib/firebase';
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

      updateProfile: (updates) => set((state) => ({
        currentProfile: state.currentProfile ? { ...state.currentProfile, ...updates } : null,
        profiles: state.currentProfile ? {
          ...state.profiles,
          [state.currentProfile.userId]: {
            ...state.profiles[state.currentProfile.userId],
            ...updates
          }
        } : state.profiles,
      })),

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

      setAvatar: (uri) => get().updateProfile({ avatar: uri }),

      // 초기화
      initialize: async () => {
        try {
          const uid = firebaseAuth.currentUser?.uid || 'anonymous-user';
          const state = get();
          // 이미 현재 프로필이 있으면 그대로 사용
          if (state.currentProfile) {
            set({ isInitialized: true });
            return;
          }
          // 해당 uid의 프로필이 있으면 로드
          const existing = state.profiles[uid];
          if (existing) {
            set({ currentProfile: existing, isInitialized: true });
            return;
          }
          // 없으면 생성
          const created = await get().createProfile({
            userId: uid,
            displayName: firebaseAuth.currentUser?.displayName || '사용자',
            status: 'online',
            bio: '채팅 프로필을 설정해보세요!',
          });
          set({ currentProfile: created, isInitialized: true });
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
