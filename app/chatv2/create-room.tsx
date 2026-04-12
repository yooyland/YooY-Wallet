import React from 'react';
import { Stack } from 'expo-router';
import ChatCreateRoomV2 from '@/src/features/chatv2/screens/ChatCreateRoomV2';

export default function ChatV2CreateRoomRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ChatCreateRoomV2 />
    </>
  );
}

