/**
 * Google Play 인앱 업데이트(Android): 스토어에 더 새로운 버전이 있으면
 * Play가 제공하는 플로우로 자동 확인·(기본) Flexible 업데이트 시작.
 * - __DEV__ / 웹에서는 실행 안 함
 * - EXPO_PUBLIC_DISABLE_PLAY_IN_APP_UPDATE=1 이면 비활성
 * iOS는 스토어 정책상 동일한 인앱 다운로드가 없어 이 훅에서 제외합니다.
 */

import { useEffect } from 'react';
import { Platform } from 'react-native';

const START_DELAY_MS = 2800;

export function usePlayInAppUpdates() {
  useEffect(() => {
    if (__DEV__) return;
    if (Platform.OS !== 'android') return;
    if (String(process.env.EXPO_PUBLIC_DISABLE_PLAY_IN_APP_UPDATE || '').trim() === '1') return;

    const id = setTimeout(() => {
      void (async () => {
        try {
          const mod = await import('expo-in-app-updates');
          const checkAndStartUpdate = (mod as { checkAndStartUpdate?: (immediate?: boolean) => Promise<boolean> })
            .checkAndStartUpdate;
          if (typeof checkAndStartUpdate === 'function') {
            /** false = Flexible(백그라운드 다운로드 후 재시작 시 적용). true = 즉시 전체화면 업데이트 */
            await checkAndStartUpdate(false);
          }
        } catch {
          /* 스토어 미설치·사이드로드·모듈 미포함 빌드 등은 무시 */
        }
      })();
    }, START_DELAY_MS);

    return () => clearTimeout(id);
  }, []);
}
