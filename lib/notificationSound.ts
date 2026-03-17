import { Audio } from 'expo-av';
import { Vibration } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

let soundObject: Audio.Sound | null = null;

export type NotificationMode = 'sound' | 'vibrate' | 'mute' | 'off';

export type NotificationSoundType =
  | 'gold'
  | 'simple'
  | 'urgent'
  | 'dm_message'
  | 'coin_reward'
  | 'mention'
  | 'system_notice'
  | 'warning'
  | 'system_default'
  | 'silent';

/** Event-based override: some events use a fixed sound regardless of room setting */
export type NotificationEventType =
  | 'normal'
  | 'dm_message'
  | 'mention'
  | 'coin_reward'
  | 'system_notice'
  | 'warning';

const VOLUME_STORAGE_KEY = 'notification_volume';
let currentVolume = 0.7;

export async function loadNotificationVolume(): Promise<number> {
  try {
    const saved = await AsyncStorage.getItem(VOLUME_STORAGE_KEY);
    if (saved !== null) {
      currentVolume = Math.max(0, Math.min(1, parseFloat(saved)));
    }
  } catch {}
  return currentVolume;
}

export async function setNotificationVolume(volume: number): Promise<void> {
  try {
    currentVolume = Math.max(0, Math.min(1, volume));
    await AsyncStorage.setItem(VOLUME_STORAGE_KEY, String(currentVolume));
  } catch {}
}

export function getNotificationVolume(): number {
  return currentVolume;
}

// All YooY Land sounds from bundled assets (assets/sounds/*.wav). No remote URLs.
// system_default uses a bundled "device-style" tone; replace with native API later if needed.
const SOUND_ASSETS: Record<Exclude<NotificationSoundType, 'silent'>, number> = {
  gold: require('../assets/sounds/gold_notification.wav'),
  simple: require('../assets/sounds/simple_notification.wav'),
  urgent: require('../assets/sounds/urgent_notification.wav'),
  dm_message: require('../assets/sounds/dm_message.wav'),
  coin_reward: require('../assets/sounds/coin_reward.wav'),
  mention: require('../assets/sounds/mention_alert.wav'),
  system_notice: require('../assets/sounds/system_notice.wav'),
  warning: require('../assets/sounds/warning_alert.wav'),
  system_default: require('../assets/sounds/system_default.wav'),
};

function getBundledAsset(soundType: NotificationSoundType | undefined): number {
  if (soundType === 'silent') return SOUND_ASSETS.gold;
  if (soundType && soundType in SOUND_ASSETS) return SOUND_ASSETS[soundType as keyof typeof SOUND_ASSETS];
  return SOUND_ASSETS.gold;
}

/** Resolve which sound to play: event overrides room setting for specific events */
export function resolveSoundTypeForEvent(
  roomSoundType: NotificationSoundType | undefined,
  eventType: NotificationEventType | undefined
): NotificationSoundType | undefined {
  if (eventType && eventType !== 'normal') {
    return eventType as NotificationSoundType;
  }
  return roomSoundType === undefined || roomSoundType === 'silent' ? 'gold' : roomSoundType;
}

const VOLUME_MAP: Record<string, number> = { low: 0.3, medium: 0.5, high: 0.7, max: 1 };

export function getVolumeFromLevel(level: 'low' | 'medium' | 'high' | 'max' | undefined): number {
  if (level && VOLUME_MAP[level] !== undefined) return VOLUME_MAP[level];
  return currentVolume;
}

async function playFromAsset(asset: number, volume: number): Promise<boolean> {
  try {
    const { sound } = await Audio.Sound.createAsync(asset, { shouldPlay: true, volume });
    soundObject = sound;
    sound.setOnPlaybackStatusUpdate((status: any) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync().catch(() => {});
        soundObject = null;
      }
    });
    return true;
  } catch (e) {
    if (__DEV__) console.warn('[NotificationSound] Asset failed:', e);
    return false;
  }
}

export async function playNotificationSound(
  mode: NotificationMode = 'sound',
  volumeOverride?: number,
  soundType?: NotificationSoundType,
  eventType?: NotificationEventType
) {
  try {
    if (mode === 'mute' || mode === 'off') return;
    if (mode === 'vibrate') {
      Vibration.vibrate(200);
      return;
    }
    if (mode !== 'sound') return;

    const resolved = resolveSoundTypeForEvent(soundType, eventType);
    if (resolved === 'silent') return;

    Vibration.vibrate(100);

    if (soundObject) {
      try {
        await soundObject.unloadAsync();
      } catch {}
      soundObject = null;
    }

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
    } catch (e) {
      if (__DEV__) console.warn('[NotificationSound] Audio mode error:', e);
    }

    const volume = volumeOverride !== undefined
      ? Math.max(0, Math.min(1, volumeOverride))
      : (await loadNotificationVolume());

    const asset = getBundledAsset(resolved);
    const loaded = await playFromAsset(asset, volume);
    if (!loaded) {
      Vibration.vibrate([0, 100, 50, 100]);
    }
  } catch (e) {
    if (__DEV__) console.warn('[NotificationSound] Error:', e);
    try { Vibration.vibrate(200); } catch {}
  }
}

export async function cleanupSound() {
  try {
    if (soundObject) {
      await soundObject.unloadAsync();
      soundObject = null;
    }
  } catch {}
}
