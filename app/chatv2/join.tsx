import React, { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { buildInviteQrPayloadV2 } from '@/src/features/chatv2/services/roomInviteService';

function firstParam(v: string | string[] | undefined): string {
  if (v == null) return '';
  const s = Array.isArray(v) ? v[0] : v;
  return String(s || '').trim();
}

/**
 * Universal / App Link: https://yooy.land/chatv2/join?roomId=...&t=...&c=...
 * Expo Router 매칭용 화면. 실제 입장 로직은 /chatv2/entry?raw=... 로 위임.
 */
export default function ChatV2JoinUniversalRoute() {
  const params = useLocalSearchParams<{ roomId?: string | string[]; t?: string | string[]; c?: string | string[] }>();

  useEffect(() => {
    const roomId = firstParam(params.roomId);
    const t = firstParam(params.t);
    const c = firstParam(params.c);
    let raw = '';
    if (roomId && t && c) {
      raw = buildInviteQrPayloadV2({ roomId, inviteToken: t, inviteCode: c });
    } else if (roomId) {
      const qs = [`roomId=${encodeURIComponent(roomId)}`];
      if (t) qs.push(`t=${encodeURIComponent(t)}`);
      if (c) qs.push(`c=${encodeURIComponent(c)}`);
      raw = `https://yooy.land/chatv2/join?${qs.join('&')}`;
    }
    try {
      if (!raw) {
        router.replace('/chatv2/rooms');
        return;
      }
      router.replace({ pathname: '/chatv2/entry', params: { raw } } as any);
    } catch {
      try {
        router.replace('/chatv2/rooms');
      } catch {}
    }
  }, [params.roomId, params.t, params.c]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: '#0C0C0C', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 }}>
        <ActivityIndicator color="#FFD700" />
        <Text style={{ color: '#888', marginTop: 14, textAlign: 'center' }}>초대 링크로 입장하는 중…</Text>
      </View>
    </>
  );
}
