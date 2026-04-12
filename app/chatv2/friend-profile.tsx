import React from 'react';
import { Stack } from 'expo-router';
import FriendProfileScreen from '@/app/chat/friend-profile';

export default function ChatV2FriendProfileRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <FriendProfileScreen />
    </>
  );
}

