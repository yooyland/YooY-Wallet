import { Redirect } from 'expo-router';
import React from 'react';

export default function ChatTab() {
  // Default chat -> v2. Old chat remains accessible via /chat/* for debug/rollback.
  return <Redirect href="/chatv2" />;
}



