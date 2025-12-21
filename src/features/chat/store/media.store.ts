import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type MediaVisibility = 'public' | 'private';
export type MediaLocation = 'gallery' | 'treasure';

export interface MediaItemV1 {
  id: string; // stable id (hash of uri or uuid)
  uriHttp?: string; // https url if uploaded
  uriData?: string; // dataURL (runtime preferred, not persisted if too large)
  name?: string;
  createdAt: number;
  visibility: MediaVisibility; // public -> visible to others
  location: MediaLocation; // gallery or treasure
  protect?: boolean;
  // optional content kind hint
  type?: 'image' | 'video' | 'file' | 'link';
}

export interface MediaStateV1 {
  version: 1;
  items: Record<string, MediaItemV1>;
  byLocation: { gallery: string[]; treasure: string[] };
}

export interface MediaActionsV1 {
  migrateFromLegacy: (uid: string) => Promise<void>;
  addOrUpdate: (item: Partial<MediaItemV1> & { id: string }) => void;
  moveToTreasure: (ids: string[]) => void;
  restoreToGallery: (ids: string[]) => void;
  remove: (ids: string[]) => void;
}

export function mediaIdForUri(uri: string): string {
  try {
    // simple hash
    let h = 0; for (let i = 0; i < uri.length; i++) { h = (h<<5)-h + uri.charCodeAt(i); h|=0; }
    return `m_${Math.abs(h)}`;
  } catch { return `m_${Date.now()}`; }
}

export type MediaStore = MediaStateV1 & MediaActionsV1;

export const useMediaStore = create<MediaStore>()(persist((set, get) => ({
  version: 1,
  items: {},
  byLocation: { gallery: [], treasure: [] },

  async migrateFromLegacy(uid: string) {
    const galleryKey = `u:${uid}:chat.media.items`;
    const treasureKey = `u:${uid}:treasure.items`;
    const metaKey = `u:${uid}:chat.media.meta`;
    try {
      const [rawG, rawT, rawM] = await Promise.all([
        AsyncStorage.getItem(galleryKey),
        AsyncStorage.getItem(treasureKey),
        AsyncStorage.getItem(metaKey),
      ]);
      const g = rawG ? JSON.parse(rawG) : [];
      const t = rawT ? JSON.parse(rawT) : [];
      const m = rawM ? JSON.parse(rawM) : {};
      const items: Record<string, MediaItemV1> = { ...get().items };
      const gallery: string[] = [...get().byLocation.gallery];
      const treasure: string[] = [...get().byLocation.treasure];
      const push = (arr: string[], id: string) => { if (!arr.includes(id)) arr.unshift(id); };
      const normalize = (arr: any[], location: MediaLocation) => {
        arr.forEach((it:any) => {
          const uri = String(it?.uri || it?.uriHttp || ''); if (!uri) return;
          const id = it?.id || mediaIdForUri(uri);
          const meta = m?.[uri] || {};
          const createdAt = it?.createdAt ?? Date.now();
          const item: MediaItemV1 = {
            id,
            uriHttp: it?.uri && /^https?:/i.test(it.uri) ? it.uri : undefined,
            name: meta?.name || it?.name,
            createdAt,
            visibility: meta?.public === false ? 'private' : (it?.public === false ? 'private' : 'public'),
            location,
            protect: !!(meta?.protect || it?.protect),
          };
          items[id] = { ...(items[id] || {}), ...item };
          push(location==='gallery'?gallery:treasure, id);
        });
      };
      normalize(Array.isArray(g)?g:[], 'gallery');
      normalize(Array.isArray(t)?t:[], 'treasure');
      set({ items, byLocation: { gallery, treasure } });
    } catch {}
  },

  addOrUpdate(partial) {
    const state = get();
    const id = partial.id || mediaIdForUri(partial.uriHttp || partial.uriData || '');
    const existing = state.items[id] || { id, createdAt: Date.now(), visibility: 'public', location: 'gallery' } as MediaItemV1;
    const updated: MediaItemV1 = { ...existing, ...partial } as MediaItemV1;
    const items = { ...state.items, [id]: updated };
    const loc = updated.location;
    const other = loc === 'gallery' ? 'treasure' : 'gallery';
    const by = { gallery: [...state.byLocation.gallery], treasure: [...state.byLocation.treasure] };
    // ensure in loc and remove from other
    if (!by[loc].includes(id)) by[loc].unshift(id);
    by[other] = by[other].filter(x=>x!==id);
    set({ items, byLocation: by });
  },

  moveToTreasure(ids) {
    const state = get();
    const items = { ...state.items };
    let gallery = [...state.byLocation.gallery];
    let treasure = [...state.byLocation.treasure];
    ids.forEach(id => {
      const it = items[id]; if (!it) return;
      items[id] = { ...it, visibility: 'private', location: 'treasure' };
      treasure = [id, ...treasure.filter(x=>x!==id)];
      gallery = gallery.filter(x=>x!==id);
    });
    set({ items, byLocation: { gallery, treasure } });
  },

  restoreToGallery(ids) {
    const state = get();
    const items = { ...state.items };
    let gallery = [...state.byLocation.gallery];
    let treasure = [...state.byLocation.treasure];
    ids.forEach(id => {
      const it = items[id]; if (!it) return;
      items[id] = { ...it, visibility: 'public', location: 'gallery' };
      gallery = [id, ...gallery.filter(x=>x!==id)];
      treasure = treasure.filter(x=>x!==id);
    });
    set({ items, byLocation: { gallery, treasure } });
  },

  remove(ids) {
    const state = get();
    const items = { ...state.items };
    let gallery = [...state.byLocation.gallery];
    let treasure = [...state.byLocation.treasure];
    ids.forEach(id => { delete items[id]; gallery = gallery.filter(x=>x!==id); treasure = treasure.filter(x=>x!==id); });
    set({ items, byLocation: { gallery, treasure } });
  },
}), {
  name: 'chat.media.v1',
  storage: createJSONStorage(() => AsyncStorage),
  // Persist 용량 제한: uriData 등 대용량은 저장하지 않고, 최신 N개만 저장
  partialize: (state: MediaStore) => {
    const MAX_PERSIST_ITEMS = 200; // 최신 200개까지만 저장
    try {
      const all: MediaItemV1[] = Object.values(state.items || {});
      const sorted = all.sort((a,b)=> (b.createdAt??0)-(a.createdAt??0));
      const keep = sorted.slice(0, MAX_PERSIST_ITEMS).map(i=>i.id);
      const keepSet = new Set(keep);
      const items: Record<string, MediaItemV1> = {};
      keep.forEach(id => {
        const it = state.items[id]; if (!it) return;
        // uriData(대용량)는 퍼시스트에서 제외
        items[id] = {
          id: it.id,
          uriHttp: it.uriHttp,
          name: it.name,
          createdAt: it.createdAt,
          visibility: it.visibility,
          location: it.location,
          protect: it.protect,
        } as MediaItemV1;
      });
      const byLocation = {
        gallery: (state.byLocation.gallery || []).filter(id => keepSet.has(id)),
        treasure: (state.byLocation.treasure || []).filter(id => keepSet.has(id)),
      };
      return { version: 1, items, byLocation } as MediaStateV1;
    } catch {
      // 실패 시 최소한의 구조만 저장
      return { version: 1, items: {}, byLocation: { gallery: [], treasure: [] } } as MediaStateV1;
    }
  },
}));

// Selectors
export const mediaSelectors = {
  galleryPublic: (s: MediaStore) => s.byLocation.gallery.filter(id => s.items[id]?.visibility !== 'private'),
  galleryAll: (s: MediaStore) => s.byLocation.gallery,
  treasureAll: (s: MediaStore) => s.byLocation.treasure,
  getById: (s: MediaStore, id: string) => s.items[id],
};


