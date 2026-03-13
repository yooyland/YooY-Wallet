import { Audio } from 'expo-av';
import { Platform, Vibration } from 'react-native';

let soundObject: Audio.Sound | null = null;

export type NotificationMode = 'sound' | 'vibrate' | 'mute' | 'off';

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
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      // 기본 알림 소리 재생
      const { sound } = await Audio.Sound.createAsync(
        Platform.OS === 'ios'
          ? { uri: 'https://notificationsounds.com/storage/sounds/file-sounds-1150-pristine.mp3' }
          : { uri: 'https://notificationsounds.com/storage/sounds/file-sounds-1150-pristine.mp3' },
        { shouldPlay: true, volume: 0.5 }
      );
      soundObject = sound;

      // 재생 완료 후 정리
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
          soundObject = null;
        }
      });
    }
  } catch (e) {
    console.warn('[NotificationSound] Error:', e);
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
