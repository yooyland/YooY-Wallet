import React, { useMemo } from 'react';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { View, Text, TouchableOpacity } from 'react-native';
import ChatRoomV2 from '@/src/features/chatv2/screens/ChatRoomV2';
import { normalizeRoomId } from '@/src/features/chatv2/utils/roomId';

export default function ChatRoomV2Route() {
  const params = useLocalSearchParams<{ id?: string; openSettings?: string }>();
  const normalized = useMemo(() => normalizeRoomId(params?.id, 'app/chatv2/room'), [params?.id]);
  const initialOpenSettings = String(params?.openSettings || '') === '1';

  if (normalized === null) {
    return (
      <>
        <Stack.Screen options={{ title: '채팅', headerShown: false }} />
        <View
          style={{
            flex: 1,
            backgroundColor: '#0C0C0C',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <Text style={{ color: '#EEE', textAlign: 'center', marginBottom: 16 }}>
            잘못된 채팅방 경로입니다.
          </Text>
          <TouchableOpacity
            onPress={() => {
              try {
                router.replace('/chatv2/rooms');
              } catch {}
            }}
            style={{ paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#333', borderRadius: 8 }}
          >
            <Text style={{ color: '#FFD700', fontWeight: '700' }}>채팅 목록으로</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: '채팅', headerShown: false }} />
      <ChatRoomV2 roomId={normalized} initialOpenSettings={initialOpenSettings} />
    </>
  );
}
