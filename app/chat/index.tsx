import { Redirect } from 'expo-router';
import React from 'react';

export default function ChatIndex() {
  // Legacy chat root is blocked permanently.
  return <Redirect href="/chatv2" />;
}


