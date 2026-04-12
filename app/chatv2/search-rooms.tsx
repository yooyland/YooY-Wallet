import React from 'react';
import { Stack } from 'expo-router';
import SearchRoomsScreen from '@/app/chat/search-rooms';

export default function ChatV2SearchRoomsRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SearchRoomsScreen />
    </>
  );
}

