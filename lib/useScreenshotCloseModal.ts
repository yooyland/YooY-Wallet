import { useEffect, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';

/**
 * 모달이 열린 상태에서 시스템 스크린샷을 찍으면 알림 후 모달을 닫습니다.
 * (OS가 갤러리에 스크린샷을 저장하는 동작과 별개로, UI만 닫음)
 */
export function useScreenshotCloseModal(visible: boolean, onClose: () => void, language: string) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!visible || Platform.OS === 'web') return;

    const subscription = ScreenCapture.addScreenshotListener(() => {
      Alert.alert(
        language === 'en' ? '✅ Saved!' : '✅ 저장 완료!',
        language === 'en'
          ? 'Screenshot has been saved to your gallery'
          : '스크린샷이 갤러리에 저장되었습니다'
      );
      try {
        onCloseRef.current();
      } catch {}
    });

    return () => {
      try {
        subscription.remove();
      } catch {}
    };
  }, [visible, language]);
}
