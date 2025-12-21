import React from 'react';
import { ThemedView } from '@/components/themed-view';
import QuickActionsSettings from '@/components/QuickActionsSettings';
import { router } from 'expo-router';

export default function QuickActionsPage() {
  return (
    <ThemedView style={{ flex:1, backgroundColor:'#0D0D0D' }}>
      <QuickActionsSettings
        visible
        onClose={() => router.back()}
        title="Quick Actions Settings"
      />
    </ThemedView>
  );
}


