import React from 'react';
import { Stack } from 'expo-router';
import ChatRoomListV2 from '@/src/features/chatv2/screens/ChatRoomListV2';

export default function ChatRoomListV2Route() {
  return (
    <>
      <Stack.Screen options={{ title: '채팅', headerShown: false }} />
      <ChatRoomListV2 />
    </>
  );
}

