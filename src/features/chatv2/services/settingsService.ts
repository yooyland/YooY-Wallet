import type { Firestore } from 'firebase/firestore';
import { getDoc, setDoc } from 'firebase/firestore';
import type { NotificationSoundType } from '@/lib/notificationSound';
import { getRoomMemberDocRef, getUserJoinedRoomDocRef, getUserRoomPreferenceDocRef, getLegacyUserRoomPreferenceFlatDocRef } from '../firebase/roomRefs';

export type RoomMemberSettingsV2 = {
  notifications?: {
    enabled: boolean;
    mode: 'sound' | 'vibrate' | 'mute';
    notificationSound?: NotificationSoundType;
    notificationVolume?: 'low' | 'medium' | 'high' | 'max';
    keywordAlerts?: string[];
    mentionAlertEnabled?: boolean;
  };
  chat?: {
    fontSizeLevel: 1 | 2 | 3 | 4 | 5;
  };
  /** 방별 UI 테마 (userRoomPreferences와 동기화) */
  theme?: {
    themeId?: 'default' | 'darkGold' | 'custom';
    wallpaperUrl?: string;
    bubbleStyle?: 'rounded' | 'square';
    backgroundColorHex?: string;
    bubbleColorHex?: string;
  };
};

/** users/{uid}/chatRoomPrefs/{roomId} (구 userRoomPreferences 평면 문서와 동일 필드) */
export type UserRoomPreferenceDocV2 = {
  uid: string;
  roomId: string;
  notificationsEnabled?: boolean;
  notificationMode?: 'sound' | 'vibrate' | 'mute';
  notificationSound?: NotificationSoundType;
  notificationVolume?: 'low' | 'medium' | 'high' | 'max';
  keywordAlerts?: string[];
  mentionAlertEnabled?: boolean;
  muteUntil?: number | null;
  theme?: 'default' | 'darkGold' | 'custom';
  fontSize?: number;
  wallpaper?: string;
  bubbleStyle?: 'rounded' | 'square';
  backgroundColorHex?: string;
  bubbleColorHex?: string;
  updatedAt?: number;
};

/** chatRoomPrefs 스냅샷 → 채팅 화면 글자·배경·말풍선 모양 (ChatRoomV2 실시간 반영용) */
export function applyChatVisualFromRoomPreferenceDoc(
  data: Record<string, unknown> | undefined,
  apply: {
    setFontSizePx: (px: number) => void;
    setWallpaperUri: (uri: string) => void;
    setSurfaceColor: (hex: string) => void;
    setBubbleStyle: (s: 'rounded' | 'square') => void;
  }
): void {
  if (!data || typeof data !== 'object') return;
  const fontLvlRaw = Number((data as any).fontSize);
  const fontLvl = Number.isFinite(fontLvlRaw) && fontLvlRaw >= 1 && fontLvlRaw <= 5 ? Math.floor(fontLvlRaw) : 3;
  const map = [12, 14, 16, 18, 20];
  apply.setFontSizePx(map[fontLvl - 1]);
  apply.setWallpaperUri(String((data as any).wallpaper || '').trim());
  const tid = String((data as any).theme || 'default');
  const hex = String((data as any).backgroundColorHex || '').trim();
  const hexOk = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(hex);
  if (tid === 'darkGold') apply.setSurfaceColor('#0A0806');
  else if (tid === 'custom' && hexOk) apply.setSurfaceColor(hex);
  else apply.setSurfaceColor('#0C0C0C');
  const bs = String((data as any).bubbleStyle || 'rounded');
  apply.setBubbleStyle(bs === 'square' ? 'square' : 'rounded');
}

/** chatRoomPrefs 없이 roomMembers+레거시만 있는 경우 1회 반영 */
export function applyChatVisualFromMemberSettings(
  s: RoomMemberSettingsV2 | undefined,
  apply: {
    setFontSizePx: (px: number) => void;
    setWallpaperUri: (uri: string) => void;
    setSurfaceColor: (hex: string) => void;
    setBubbleStyle: (st: 'rounded' | 'square') => void;
  }
): void {
  if (!s || typeof s !== 'object') return;
  const fontLvlRaw = Number(s.chat?.fontSizeLevel ?? 3);
  const fontLvl = Number.isFinite(fontLvlRaw) && fontLvlRaw >= 1 && fontLvlRaw <= 5 ? Math.floor(fontLvlRaw) : 3;
  const map = [12, 14, 16, 18, 20];
  apply.setFontSizePx(map[fontLvl - 1]);
  apply.setWallpaperUri(String(s.theme?.wallpaperUrl || '').trim());
  const tid = String(s.theme?.themeId || 'default');
  const hex = String(s.theme?.backgroundColorHex || '').trim();
  const hexOk = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(hex);
  if (tid === 'darkGold') apply.setSurfaceColor('#0A0806');
  else if (tid === 'custom' && hexOk) apply.setSurfaceColor(hex);
  else apply.setSurfaceColor('#0C0C0C');
  apply.setBubbleStyle(s.theme?.bubbleStyle === 'square' ? 'square' : 'rounded');
}

function parseKeywordAlerts(raw: unknown): string[] | undefined {
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
  if (typeof raw === 'string' && raw.trim())
    return raw
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
  return undefined;
}

export async function loadRoomMemberSettingsV2(input: { firestore: Firestore; roomId: string; uid: string }): Promise<RoomMemberSettingsV2> {
  const snap = await getDoc(getRoomMemberDocRef(input.firestore, input.roomId, input.uid));
  const base = (snap.exists() ? ((snap.data() as any)?.settings || {}) : {}) as RoomMemberSettingsV2;

  try {
    const prefRef = getUserRoomPreferenceDocRef(input.firestore, input.uid, input.roomId);
    let prefSnap = await getDoc(prefRef);
    if (!prefSnap.exists()) {
      try {
        const leg = await getDoc(getLegacyUserRoomPreferenceFlatDocRef(input.firestore, input.uid, input.roomId));
        if (leg.exists()) prefSnap = leg;
      } catch {}
    }
    if (!prefSnap.exists()) return base;
    const p = prefSnap.data() as any;
    const merged: RoomMemberSettingsV2 = { ...base };
    if (
      typeof p?.notificationsEnabled === 'boolean' ||
      typeof p?.notificationMode === 'string' ||
      p?.notificationSound ||
      p?.notificationVolume ||
      p?.keywordAlerts != null ||
      typeof p?.mentionAlertEnabled === 'boolean'
    ) {
      const kw = parseKeywordAlerts(p.keywordAlerts) ?? base.notifications?.keywordAlerts ?? [];
      merged.notifications = {
        enabled: typeof p.notificationsEnabled === 'boolean' ? p.notificationsEnabled : base.notifications?.enabled !== false,
        mode: (p.notificationMode || base.notifications?.mode || 'sound') as any,
        notificationSound: (p.notificationSound || base.notifications?.notificationSound || 'gold') as NotificationSoundType,
        notificationVolume: (p.notificationVolume || base.notifications?.notificationVolume || 'medium') as any,
        keywordAlerts: kw,
        mentionAlertEnabled: typeof p.mentionAlertEnabled === 'boolean' ? p.mentionAlertEnabled : base.notifications?.mentionAlertEnabled !== false,
      };
    }
    if (typeof p?.fontSize === 'number' && p.fontSize >= 1 && p.fontSize <= 5) {
      merged.chat = { ...(merged.chat || { fontSizeLevel: 3 as any }), fontSizeLevel: p.fontSize as any };
    }
    if (p?.theme || p?.wallpaper || p?.bubbleStyle || p?.backgroundColorHex || p?.bubbleColorHex) {
      merged.theme = {
        themeId: (p.theme || merged.theme?.themeId || 'default') as any,
        wallpaperUrl: p.wallpaper != null ? String(p.wallpaper) : merged.theme?.wallpaperUrl,
        bubbleStyle: (p.bubbleStyle || merged.theme?.bubbleStyle || 'rounded') as any,
        backgroundColorHex:
          typeof p.backgroundColorHex === 'string' ? p.backgroundColorHex : merged.theme?.backgroundColorHex,
        bubbleColorHex: typeof p.bubbleColorHex === 'string' ? p.bubbleColorHex : merged.theme?.bubbleColorHex,
      };
    }
    return merged;
  } catch {
    return base;
  }
}

export async function saveRoomMemberSettingsV2(input: { firestore: Firestore; roomId: string; uid: string; settings: RoomMemberSettingsV2 }): Promise<void> {
  const now = Date.now();
  const enabled = input.settings.notifications?.enabled !== false;
  const mode = input.settings.notifications?.mode || 'sound';
  const fontLvl = Number(input.settings.chat?.fontSizeLevel || 3);
  const themeId = input.settings.theme?.themeId || 'default';
  const wallpaper = String(input.settings.theme?.wallpaperUrl || '');
  const bubbleStyle = input.settings.theme?.bubbleStyle || 'rounded';
  const n = input.settings.notifications || {};
  const sound = (n.notificationSound || 'gold') as NotificationSoundType;
  const vol = (n.notificationVolume || 'medium') as 'low' | 'medium' | 'high' | 'max';
  const keywords = Array.isArray(n.keywordAlerts) ? n.keywordAlerts.map((x) => String(x).trim()).filter(Boolean) : [];
  const mentionOn = n.mentionAlertEnabled !== false;
  const bgHex = String(input.settings.theme?.backgroundColorHex || '').trim();
  const bubbleHex = String(input.settings.theme?.bubbleColorHex || '').trim();

  /** 1) 개인 선호 users/{uid}/chatRoomPrefs/{roomId} */
  await setDoc(
    getUserRoomPreferenceDocRef(input.firestore, input.uid, input.roomId),
    {
      uid: input.uid,
      roomId: input.roomId,
      notificationsEnabled: enabled,
      notificationMode: mode,
      notificationSound: sound,
      notificationVolume: vol,
      keywordAlerts: keywords,
      mentionAlertEnabled: mentionOn,
      muteUntil: mode === 'mute' ? null : null,
      theme: themeId,
      fontSize: fontLvl,
      wallpaper,
      bubbleStyle,
      backgroundColorHex: bgHex || null,
      bubbleColorHex: bubbleHex || null,
      updatedAt: now,
    } as any,
    { merge: true }
  );

  /** 2) roomMembers 본인 settings (앱 동기화용) */
  await setDoc(
    getRoomMemberDocRef(input.firestore, input.roomId, input.uid),
    { settings: input.settings, updatedAt: now } as any,
    { merge: true }
  );

  try {
    await setDoc(
      getUserJoinedRoomDocRef(input.firestore, input.uid, input.roomId),
      {
        muted: !enabled || mode === 'mute',
        notifyMode: mode,
        updatedAt: now,
      } as any,
      { merge: true }
    );
  } catch (e) {
    try {
      console.warn('[saveRoomMemberSettingsV2] joinedRooms sync failed', String((e as any)?.message || e));
    } catch {}
  }
}
