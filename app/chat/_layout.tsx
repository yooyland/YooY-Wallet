import { Redirect } from 'expo-router';
import React from 'react';

export default function ChatLayout() {
  // Legacy chat routes are hard-blocked: always keep users on v2.
  return <Redirect href="/chatv2/rooms" />;
}




