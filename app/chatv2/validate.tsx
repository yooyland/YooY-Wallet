import React, { useEffect } from 'react';
import { router } from 'expo-router';
import ChatV2ValidationScreen from '@/src/features/chatv2/screens/ChatV2ValidationScreen';

export default function Page() {
  useEffect(() => {
    // 사용자 동선 노출 금지: 개발 중 점검 화면은 DEV에서만 접근
    try {
      // eslint-disable-next-line no-undef
      if (typeof __DEV__ !== 'undefined' && __DEV__) return;
      router.replace('/chatv2/rooms');
    } catch {}
  }, []);
  return <ChatV2ValidationScreen />;
}

