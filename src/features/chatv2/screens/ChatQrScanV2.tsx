import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Platform, Dimensions, TextInput } from 'react-native';
import { CameraView, Camera } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';

import { scanBarcodeFromFileUri } from '@/lib/qrScanner';

export default function ChatQrScanV2() {
  // Some builds/devices may not have expo-camera permission hook available.
  // Guard to prevent "undefined is not a function" crashes.
  const hasPermHook = typeof (Camera as any)?.useCameraPermissions === 'function';
  const permState = hasPermHook ? (Camera as any).useCameraPermissions() : [null, async () => ({ status: 'granted' })];
  const perm = permState?.[0] || null;
  const requestPerm = (permState?.[1] as any) || (async () => ({ status: 'granted' }));
  const [scanned, setScanned] = useState(false);
  const lastRawRef = useRef<string>('');
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [manualText, setManualText] = useState('');

  useEffect(() => {
    try {
      if (!hasPermHook) return;
      if (perm?.granted) return;
      requestPerm?.().catch?.(() => {});
    } catch {}
  }, [perm?.granted]);

  const onScanned = (raw: string) => {
    const s = String(raw || '').trim();
    if (!s) return;
    if (s === lastRawRef.current) return;
    lastRawRef.current = s;
    setScanned(true);
    if (lockTimerRef.current) {
      clearTimeout(lockTimerRef.current);
    }
    lockTimerRef.current = setTimeout(() => {
      setScanned(false);
      lastRawRef.current = '';
    }, 4000);
    router.replace({ pathname: '/chatv2/entry', params: { raw: s } } as any);
  };

  const pickFromGallery = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      const uri = String(res.assets[0].uri);
      const detected = (await scanBarcodeFromFileUri(uri)) || '';
      if (detected) onScanned(detected);
    } catch {}
  };

  // If camera permission APIs are not available, show gallery-only fallback to avoid crashes.
  if (!hasPermHook) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0C0C0C', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 }}>
        <Text style={{ color: '#FFD700', fontWeight: '900' }}>QR 스캔</Text>
        <Text style={{ color: '#777', marginTop: 8, textAlign: 'center' }}>
          이 기기/빌드에서는 카메라 스캔이 비활성화되어 있습니다.{'\n'}갤러리에서 QR 이미지를 선택해 주세요.
        </Text>
        <TouchableOpacity onPress={pickFromGallery} style={{ marginTop: 14, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#FFD700' }}>
          <Text style={{ color: '#FFD700', fontWeight: '900' }}>갤러리에서 QR 선택</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { try { router.back(); } catch {} }} style={{ marginTop: 10, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#333' }}>
          <Text style={{ color: '#AAA', fontWeight: '900' }}>뒤로</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (perm && !perm.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0C0C0C', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 }}>
        <Text style={{ color: '#FFD700', fontWeight: '900' }}>카메라 권한이 필요합니다</Text>
        <TouchableOpacity onPress={() => requestPerm().catch(() => {})} style={{ marginTop: 12, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#FFD700' }}>
          <Text style={{ color: '#FFD700', fontWeight: '900' }}>권한 요청</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={pickFromGallery} style={{ marginTop: 10, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#333' }}>
          <Text style={{ color: '#AAA', fontWeight: '900' }}>갤러리에서 QR 선택</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={{ height: 56, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0C0C0C' }}>
        <TouchableOpacity onPress={() => { try { router.back(); } catch {} }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={{ color: '#FFD700', fontWeight: '900' }}>←</Text>
        </TouchableOpacity>
        <Text style={{ color: '#EEE', fontWeight: '900' }}>QR 스캔</Text>
        <TouchableOpacity onPress={pickFromGallery} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={{ color: '#FFD700', fontWeight: '900' }}>사진</Text>
        </TouchableOpacity>
      </View>

      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] as any }}
        onBarcodeScanned={(e: any) => {
          try {
            if (scanned) return;
            const data = String(e?.data || '').trim();
            if (!data) return;
            onScanned(data);
          } catch {}
        }}
      />

      {/* Scan guide frame */}
      {(() => {
        const { width, height } = Dimensions.get('window');
        const size = Math.min(width * 0.68, 280);
        const top = Math.max(90, (height - size) * 0.38);
        const left = (width - size) / 2;
        const border = 2;
        const corner = 26;
        const c = '#FFD700';
        return (
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 56, bottom: 0 }}>
            <View style={{ position: 'absolute', left, top, width: size, height: size }}>
              <View style={{ position: 'absolute', left: 0, top: 0, width: corner, height: corner, borderLeftWidth: border, borderTopWidth: border, borderColor: c }} />
              <View style={{ position: 'absolute', right: 0, top: 0, width: corner, height: corner, borderRightWidth: border, borderTopWidth: border, borderColor: c }} />
              <View style={{ position: 'absolute', left: 0, bottom: 0, width: corner, height: corner, borderLeftWidth: border, borderBottomWidth: border, borderColor: c }} />
              <View style={{ position: 'absolute', right: 0, bottom: 0, width: corner, height: corner, borderRightWidth: border, borderBottomWidth: border, borderColor: c }} />
              <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderWidth: 1, borderColor: 'rgba(255,215,0,0.35)', borderRadius: 6 }} />
            </View>
          </View>
        );
      })()}

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, backgroundColor: 'rgba(0,0,0,0.7)' }}>
        <Text style={{ color: '#EEE', fontWeight: '800', textAlign: 'center' }}>
          초대장 QR을 스캔하거나 아래에 URL/텍스트를 붙여 넣어 입장할 수 있습니다.
        </Text>
        {scanned ? <Text style={{ color: '#FFD700', textAlign: 'center', marginTop: 4 }}>처리 중…</Text> : null}
        <View style={{ marginTop: 8 }}>
          <TextInput
            value={manualText}
            onChangeText={setManualText}
            placeholder="초대장 URL 또는 QR 텍스트를 붙여 넣으세요"
            placeholderTextColor="#777"
            style={{
              borderWidth: 1,
              borderColor: '#444',
              borderRadius: 10,
              paddingHorizontal: 10,
              paddingVertical: 6,
              color: '#EEE',
              backgroundColor: '#111',
              fontSize: 13,
            }}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={{ flexDirection: 'row', marginTop: 6, justifyContent: 'space-between' }}>
            <TouchableOpacity
              onPress={async () => {
                try {
                  const clip = await (await import('expo-clipboard')).getStringAsync();
                  if (clip) setManualText(clip);
                } catch {}
              }}
              style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#555' }}
            >
              <Text style={{ color: '#CFCFCF', fontWeight: '800', fontSize: 12 }}>붙여넣기</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                const s = String(manualText || '').trim();
                if (!s) return;
                onScanned(s);
              }}
              style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#FFD700', backgroundColor: '#111' }}
            >
              <Text style={{ color: '#FFD700', fontWeight: '900', fontSize: 12 }}>이 텍스트로 입장</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

