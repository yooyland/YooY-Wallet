import React from 'react';
import { Stack } from 'expo-router';
import ChatFriendsV2 from '@/src/features/chatv2/screens/ChatFriendsV2';

export default function ChatV2FriendsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ChatFriendsV2 />
    </>
  );
}

