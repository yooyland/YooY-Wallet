import { Alert, InteractionManager, Platform } from 'react-native';
import type { RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';

/**
 * 모달 등에 고정된 QR 박스만 고해상도 캡처해 갤러리(또는 웹 다운로드)로 저장 — 스캔 인식률 향상용.
 */
export async function saveQrViewShotToGallery(
  viewRef: RefObject<View | null>,
  options?: { webElementId?: string; fileName?: string }
): Promise<boolean> {
  const fileName = options?.fileName || 'yooy-qr.png';
  await new Promise<void>((resolve) => {
    InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => setTimeout(() => resolve(), 380));
    });
  });
  if (Platform.OS !== 'web') {
    if (!viewRef.current) {
      Alert.alert('안내', '저장할 이미지가 없습니다.');
      return false;
    }
    let uri: string | undefined;
    try {
      uri = await captureRef(viewRef.current, { format: 'png', quality: 1, result: 'tmpfile', width: 900, height: 900 });
    } catch {
      Alert.alert('저장 실패', '이미지를 캡처할 수 없습니다. 잠시 후 다시 시도해 주세요.');
      return false;
    }
    if (!uri) {
      Alert.alert('저장 실패', '캡처된 이미지가 없습니다.');
      return false;
    }
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      try {
        const Share = require('expo-sharing');
        if (Share.isAvailableAsync && (await Share.isAvailableAsync())) {
          await Share.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'QR 저장' });
          return true;
        }
      } catch {}
      Alert.alert('권한', '사진 저장 권한이 필요합니다. 설정에서 허용하거나 공유로 저장해 주세요.');
      return false;
    }
    try {
      await MediaLibrary.saveToLibraryAsync(uri);
      return true;
    } catch {
      try {
        const Share = require('expo-sharing');
        if (Share.isAvailableAsync && (await Share.isAvailableAsync())) {
          await Share.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'QR 저장' });
          return true;
        }
      } catch {}
      Alert.alert('저장 실패', '갤러리 저장에 실패했습니다.');
      return false;
    }
  }
  try {
    if (viewRef.current) {
      try {
        const dataUri = await captureRef(viewRef.current, { format: 'png', quality: 1, result: 'data-uri' });
        if (dataUri && String(dataUri).startsWith('data:')) {
          const a0 = document.createElement('a');
          a0.href = String(dataUri);
          a0.download = fileName;
          document.body.appendChild(a0);
          a0.click();
          a0.remove();
          return true;
        }
      } catch {}
    }
    const el = options?.webElementId ? document.getElementById(options.webElementId) : null;
    if (el) {
      const h2c = (await import('html2canvas')).default;
      const canvas0 = await h2c(el as HTMLElement, { backgroundColor: '#FFFFFF', scale: 2, useCORS: true });
      const uri0 = canvas0.toDataURL('image/png');
      const a0 = document.createElement('a');
      a0.href = uri0;
      a0.download = fileName;
      document.body.appendChild(a0);
      a0.click();
      a0.remove();
      return true;
    }
  } catch {}
  Alert.alert('오류', '이미지 저장에 실패했습니다.');
  return false;
}
