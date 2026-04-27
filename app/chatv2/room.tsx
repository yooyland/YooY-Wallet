import React, { useMemo } from 'react';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { View, Text, TouchableOpacity } from 'react-native';
import ChatRoomV2 from '@/src/features/chatv2/screens/ChatRoomV2';
import { normalizeRoomId } from '@/src/features/chatv2/utils/roomId';
import { currentUserIsAppAdmin } from '@/src/features/chatv2/core/adminGhost';

export default function ChatRoomV2Route() {
  const params = useLocalSearchParams<{ id?: string; openSettings?: string; ghost?: string }>();
  const normalized = useMemo(() => normalizeRoomId(params?.id, 'app/chatv2/room'), [params?.id]);
  const initialOpenSettings = String(params?.openSettings || '') === '1';
  const ghostRequested = String(params?.ghost || '') === '1';
  const adminGhost = ghostRequested && currentUserIsAppAdmin();

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

  if (ghostRequested && !adminGhost) {
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
            유령 입장은 등록된 관리자 계정으로 로그인한 경우에만 사용할 수 있습니다.
          </Text>
          <TouchableOpacity
            onPress={() => {
              try {
                router.back();
              } catch {
                router.replace('/chatv2/rooms');
              }
            }}
            style={{ paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#333', borderRadius: 8 }}
          >
            <Text style={{ color: '#FFD700', fontWeight: '700' }}>돌아가기</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: '채팅', headerShown: false }} />
      <ChatRoomV2
        roomId={normalized}
        initialOpenSettings={initialOpenSettings && !adminGhost}
        adminGhost={adminGhost}
      />
    </>
  );
}
