import React from 'react';
import { Stack } from 'expo-router';
import ChatSettingsScreen from '@/app/chat/settings';

export default function ChatV2SettingsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ChatSettingsScreen />
    </>
  );
}

