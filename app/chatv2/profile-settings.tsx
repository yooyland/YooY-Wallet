import React from 'react';
import { Stack } from 'expo-router';
import ChatProfileSettingsScreen from '@/app/chat/profile-settings';

export default function ChatV2ProfileSettingsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ChatProfileSettingsScreen />
    </>
  );
}

