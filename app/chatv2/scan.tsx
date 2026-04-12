import React from 'react';
import { Stack } from 'expo-router';
import ChatQrScanV2 from '@/src/features/chatv2/screens/ChatQrScanV2';

export default function ChatV2ScanRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ChatQrScanV2 />
    </>
  );
}

