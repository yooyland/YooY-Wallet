import React from 'react';
import { Stack } from 'expo-router';
import AddFriendQRScreen from '@/app/chat/add-friend-qr';

export default function ChatV2AddFriendQrRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AddFriendQRScreen />
    </>
  );
}

