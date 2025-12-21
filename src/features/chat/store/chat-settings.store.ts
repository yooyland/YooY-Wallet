import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface ChatSettingsState {
  readReceipts: boolean;
  typingIndicator: boolean;
  autoSaveMedia: boolean;
  hideInviteForInstalled: boolean;
  ttlDefault: boolean;
  // new sections
  notifications?: {
    sound: boolean;
    vibrate: boolean;
    mentionOnly: boolean;
    joinAlerts?: boolean;
    soundMode?: 'off'|'vibrate'|'sound';
  };
  privacy?: {
    lastSeen: 'everyone'|'friends'|'nobody';
    readReceipts: boolean;
    allowInvites: boolean;
  };
  chat?: {
    compactMode: boolean;
    autoDownloadImages: boolean;
  };
  data?: {
    lowDataMode: boolean;
    mediaQuality: 'auto'|'high'|'low';
  };
  appearance?: {
    theme: 'system'|'dark'|'light';
    bubbleStyle: 'round'|'square';
    fontScale?: number; // 0.8 ~ 1.4
    bubbleColor?: 'default'|'gold'|'purple'|'mint'|'red'|'white';
    backgroundColor?: string; // hex
  };
}

export interface ChatSettingsActions {
  setSettings: (partial: Partial<ChatSettingsState>) => void;
  toggle: (key: keyof ChatSettingsState) => void;
}

export const useChatSettingsStore = create<ChatSettingsState & ChatSettingsActions>()(
  persist(
    (set, get) => ({
      readReceipts: true,
      typingIndicator: true,
      autoSaveMedia: false,
      hideInviteForInstalled: true,
      ttlDefault: false,
      notifications: { sound: true, vibrate: true, mentionOnly: false, joinAlerts: true, soundMode: 'sound' },
      privacy: { lastSeen: 'everyone', readReceipts: true, allowInvites: true },
      chat: { compactMode: false, autoDownloadImages: true },
      data: { lowDataMode: false, mediaQuality: 'auto' },
      appearance: { theme: 'dark', bubbleStyle: 'round', fontScale: 1, bubbleColor: 'default', backgroundColor: '#0C0C0C' },

      setSettings: (partial) => set({ ...(get()), ...(partial || {}) }),
      toggle: (key) => set({ ...(get()), [key]: !get()[key] } as any),
    }),
    {
      name: 'chat.user.settings.v1',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);


