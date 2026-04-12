import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { firestore, firebaseAuth } from '@/lib/firebase';
import { getOrCreateDmRoomIdForUsersV2 } from '@/src/features/chatv2/services/dmEntryService';

export default function ChatV2DmRoute() {
  const params = useLocalSearchParams<{ otherId?: string }>();
  const otherId = String(params?.otherId || '');
  const me = String(firebaseAuth.currentUser?.uid || 'me');
  const [err, setErr] = useState<string>('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!otherId) throw new Error('otherId required');
        const roomId = await getOrCreateDmRoomIdForUsersV2(firestore, me, otherId);
        if (!alive) return;
        router.replace({ pathname: '/chatv2/room', params: { id: String(roomId) } } as any);
      } catch (e: any) {
        if (!alive) return;
        setErr(String(e?.message || e || 'DM open failed'));
      }
    })();
    return () => { alive = false; };
  }, [otherId, me]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: '#0C0C0C', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#FFD700', fontWeight: '900' }}>대화 여는 중...</Text>
        {!!err && <Text style={{ color: '#FF6B6B', marginTop: 10 }}>{err}</Text>}
      </View>
    </>
  );
}

