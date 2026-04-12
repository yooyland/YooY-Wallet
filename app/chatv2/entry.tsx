import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { firestore, firebaseAuth } from '@/lib/firebase';
import { routeFromQrOrLinkV2 } from '@/src/features/chatv2/services/qrLinkService';

export default function ChatV2EntryRoute() {
  const params = useLocalSearchParams<{ raw?: string }>();
  const raw = String(params?.raw || '');
  const uid = String(firebaseAuth.currentUser?.uid || 'me');
  const [err, setErr] = useState<string>('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!raw) throw new Error('raw required');
        const res = await routeFromQrOrLinkV2({ firestore, uid, raw });
        if (!alive) return;
        if (res.type === 'navigate_room' || res.type === 'navigate_dm') {
          router.replace({ pathname: '/chatv2/room', params: { id: String(res.roomId) } } as any);
          return;
        }
        if (res.type === 'external') {
          // For now, show info; app can implement external open later.
          setErr(`외부 링크: ${res.url}`);
          return;
        }
        setErr(`진입 실패: ${res.reason || 'unknown'}`);
      } catch (e: any) {
        if (!alive) return;
        const m = String(e?.message || e || '');
        if (m.includes('invite_required')) {
          setErr('이 방은 참여 코드(초대 QR/링크)가 필요합니다. 방장에게 초대를 받으세요.');
          return;
        }
        if (m.includes('invite_invalid')) {
          setErr('초대 코드가 맞지 않거나 만료되었습니다.');
          return;
        }
        if (m.includes('invites_disabled')) {
          setErr('이 방은 초대가 비활성화되어 새로 들어갈 수 없습니다.');
          return;
        }
        setErr(m || 'entry failed');
      }
    })();
    return () => { alive = false; };
  }, [raw, uid]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: '#0C0C0C', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 }}>
        <Text style={{ color: '#FFD700', fontWeight: '900' }}>링크/QR 처리 중...</Text>
        {!!err && <Text style={{ color: '#AAA', marginTop: 12, textAlign: 'center' }}>{err}</Text>}
      </View>
    </>
  );
}

