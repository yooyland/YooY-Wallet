import React from 'react';
import { Stack } from 'expo-router';
import AddFriendContactsScreen from '@/app/chat/add-friend-contacts';

export default function ChatV2AddFriendContactsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AddFriendContactsScreen />
    </>
  );
}

