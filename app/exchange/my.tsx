import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import React from 'react';

export default function MyExchangeScreen() {
  return (
    <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ThemedText>My Exchange</ThemedText>
      <ThemedText style={{ marginTop: 8, color: '#B8B8B8' }}>내 즐겨찾기, 나의 호가/매매 설정 등을 여기에 구성할 수 있습니다.</ThemedText>
    </ThemedView>
  );
}







