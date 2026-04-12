import React, { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { View, Text } from 'react-native';

export default function ChatV2IndexRoute() {
  useEffect(() => {
    try {
      console.log('[YY_LOGIN_FLOW] /chatv2 index mounted -> replace /chatv2/rooms');
      router.replace('/chatv2/rooms');
    } catch (e) {
      console.log('[YY_LOGIN_FLOW] /chatv2 index replace error', String((e as any)?.message || e));
    }
  }, []);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: '#0C0C0C', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#FFD700', fontWeight: '900' }}>채팅</Text>
      </View>
    </>
  );
}

