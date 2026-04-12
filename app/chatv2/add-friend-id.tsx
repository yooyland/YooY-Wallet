import React from 'react';
import { Stack } from 'expo-router';
import AddFriendIdScreen from '@/app/chat/add-friend-id';

export default function ChatV2AddFriendIdRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AddFriendIdScreen />
    </>
  );
}

