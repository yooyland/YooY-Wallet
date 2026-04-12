import React from 'react';
import { Stack } from 'expo-router';
import AddFriendRecommendedScreen from '@/app/chat/add-friend-recommended';

export default function ChatV2AddFriendRecommendedRoute() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AddFriendRecommendedScreen />
    </>
  );
}

