import { Audio } from 'expo-av';
import { Platform, Vibration } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

let soundObject: Audio.Sound | null = null;

export type NotificationMode = 'sound' | 'vibrate' | 'mute' | 'off';

// 볼륨 설정 저장/로드 키
const VOLUME_STORAGE_KEY = 'notification_volume';

// 기본 볼륨 (0.0 ~ 1.0)
let currentVolume = 0.7;

// 볼륨 로드
export async function loadNotificationVolume(): Promise<number> {
  try {
    const saved = await AsyncStorage.getItem(VOLUME_STORAGE_KEY);
    if (saved !== null) {
      currentVolume = Math.max(0, Math.min(1, parseFloat(saved)));
    }
  } catch {}
  return currentVolume;
}

// 볼륨 저장
export async function setNotificationVolume(volume: number): Promise<void> {
  try {
    currentVolume = Math.max(0, Math.min(1, volume));
    await AsyncStorage.setItem(VOLUME_STORAGE_KEY, String(currentVolume));
  } catch {}
}

// 현재 볼륨 반환
export function getNotificationVolume(): number {
  return currentVolume;
}

// 안정적인 알림 소리 URL 목록 (폴백용)
const SOUND_URLS = [
  // GitHub에서 제공하는 무료 알림 소리
  'https://github.com/niconicolibs/discord-sfx/raw/main/audios/message1.mp3',
  // 백업 URL
  'https://cdn.freesound.org/previews/536/536420_4921277-lq.mp3',
];

export async function playNotificationSound(mode: NotificationMode = 'sound') {
  try {
    if (mode === 'mute' || mode === 'off') {
      return;
    }

    if (mode === 'vibrate') {
      Vibration.vibrate(200);
      return;
    }

    if (mode === 'sound') {
      // 진동도 함께 실행
      Vibration.vibrate(100);

      // 이전 소리 정리
      if (soundObject) {
        try {
          await soundObject.unloadAsync();
        } catch {}
        soundObject = null;
      }

      // 오디오 모드 설정
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });
      } catch (e) {
        console.warn('[NotificationSound] Audio mode error:', e);
      }

      // 볼륨 로드
      await loadNotificationVolume();

      // 소리 재생 시도 (폴백 URL 포함)
      let loaded = false;
      for (const url of SOUND_URLS) {
        try {
          const { sound } = await Audio.Sound.createAsync(
            { uri: url },
            { shouldPlay: true, volume: currentVolume }
          );
          soundObject = sound;
          loaded = true;
          console.log('[NotificationSound] Playing sound at volume:', currentVolume);

          // 재생 완료 후 정리
          sound.setOnPlaybackStatusUpdate((status: any) => {
            if (status.isLoaded && status.didJustFinish) {
              sound.unloadAsync().catch(() => {});
              soundObject = null;
            }
          });
          break;
        } catch (e) {
          console.warn('[NotificationSound] Failed to load:', url, e);
        }
      }

      // 모든 URL 실패 시 추가 진동
      if (!loaded) {
        console.warn('[NotificationSound] All sound URLs failed, using vibration');
        Vibration.vibrate([0, 100, 50, 100]);
      }
    }
  } catch (e) {
    console.warn('[NotificationSound] Error:', e);
    // 실패 시 진동으로 폴백
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
