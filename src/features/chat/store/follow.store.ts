import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { firebaseAuth, firestore } from '@/lib/firebase';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { useChatProfileStore } from '@/src/features/chat/store/chat-profile.store';

export interface FollowEvent {
  id: string; // unique id
  userId: string;
  name: string;
  message?: string;
  timestamp: number; // ms
  isRead?: boolean;
}

interface FollowState {
  following: Record<string, boolean>; // userId -> true
  followersEvents: FollowEvent[]; // incoming followers (others followed me)
  readFollowerIds: Record<string, boolean>; // locally read docs

  // derived
  followingCount: number;
  followersCount: number; // unique users from events
  unreadFollowerEventsCount: number;

  // actions
  initialize: () => void;
  follow: (userId: string, message?: string) => Promise<void> | void;
  unfollow: (userId: string) => Promise<void> | void;
  isFollowing: (userId: string) => boolean;

  receiveFollow: (userId: string, name: string, message?: string) => void;
  markEventRead: (id: string) => void;
  markAllRead: () => void;
}

export const useFollowStore = create<FollowState>()(
  persist(
    (set, get) => ({
      following: {},
      followersEvents: [],
      readFollowerIds: {},

      get followingCount() {
        return Object.values(get().following).filter(Boolean).length;
      },
      get followersCount() {
        const uniq = new Set<string>(get().followersEvents.map(e => e.userId));
        return uniq.size;
      },
      get unreadFollowerEventsCount() {
        const read = get().readFollowerIds;
        return get().followersEvents.filter(e => !read[e.id]).length;
      },
      initialize: () => {
        try {
          const uid = firebaseAuth.currentUser?.uid;
          if (!uid) return;
          // Subscribe following
          const followingRef = collection(firestore, 'users', uid, 'following');
          onSnapshot(followingRef, (snap) => {
            const map: Record<string, boolean> = {};
            snap.forEach((d) => { map[d.id] = true; });
            set({ following: map });
          });
          // Subscribe followers
          const followersRef = query(collection(firestore, 'users', uid, 'followers'), orderBy('createdAt', 'desc'));
          onSnapshot(followersRef, (snap) => {
            const read = get().readFollowerIds;
            const list: FollowEvent[] = [];
            snap.forEach((d) => {
              const data: any = d.data() || {};
              const ts = (data.createdAt && typeof (data.createdAt as any).toMillis === 'function') ? data.createdAt.toMillis() : (data.createdAt || Date.now());
              list.push({ id: d.id, userId: d.id, name: data.name || d.id, message: data.message, timestamp: ts, isRead: !!read[d.id] });
            });
            set({ followersEvents: list });
          });
        } catch {}
      },
      follow: async (userId, message) => {
        try {
          const me = firebaseAuth.currentUser?.uid;
          if (!me) return;
          // optimistic update
          set((state)=> ({ following: { ...state.following, [userId]: true } }));
          // write my following
          await setDoc(doc(firestore, 'users', me, 'following', userId), {
            createdAt: serverTimestamp(),
          }, { merge: true });
          // write to target followers
          const myName = useChatProfileStore.getState().currentProfile?.displayName || me;
          await setDoc(doc(firestore, 'users', userId, 'followers', me), {
            name: myName,
            message: message || '',
            createdAt: serverTimestamp(),
          }, { merge: true });
        } catch {
          // rollback if needed
        }
      },
      unfollow: async (userId) => {
        try {
          const me = firebaseAuth.currentUser?.uid;
          if (!me) return;
          set((state) => {
            const next = { ...state.following };
            delete next[userId];
            return { following: next } as any;
          });
          await deleteDoc(doc(firestore, 'users', me, 'following', userId));
          await deleteDoc(doc(firestore, 'users', userId, 'followers', me));
        } catch {}
      },
      isFollowing: (userId) => !!get().following[userId],

      receiveFollow: (userId, name, message) => set((state) => ({
        followersEvents: [
          { id: `fe_${Date.now()}_${Math.random().toString(36).slice(2,8)}`, userId, name, message, timestamp: Date.now(), isRead: false },
          ...state.followersEvents,
        ],
      })),
      markEventRead: (id) => set((state) => ({
        followersEvents: state.followersEvents.map(e => e.id === id ? { ...e, isRead: true } : e),
        readFollowerIds: { ...state.readFollowerIds, [id]: true },
      })),
      markAllRead: () => set((state) => ({
        followersEvents: state.followersEvents.map(e => ({ ...e, isRead: true })),
        readFollowerIds: Object.fromEntries(state.followersEvents.map(e => [e.id, true])),
      })),
    }),
    {
      name: 'follow.store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ following: state.following, followersEvents: state.followersEvents, readFollowerIds: state.readFollowerIds }),
    }
  )
);


