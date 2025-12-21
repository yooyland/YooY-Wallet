import React from 'react';
import { ThemedView } from '@/components/themed-view';
import ProfileSheet from '@/components/profile-sheet';
import { router } from 'expo-router';

export default function ProfilePage() {
  return (
    <ThemedView style={{ flex: 1, backgroundColor: '#0D0D0D' }}>
      <ProfileSheet visible onClose={() => router.back()} onSaved={() => router.back()} />
    </ThemedView>
  );
}


