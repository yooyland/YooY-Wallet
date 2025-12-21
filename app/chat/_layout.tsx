import { Stack } from 'expo-router';
import React from 'react';
import ForwardModal from '@/src/features/chat/components/ForwardModal';

export default function ChatLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <ForwardModal />
    </>
  );
}




