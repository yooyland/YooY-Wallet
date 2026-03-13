import React from 'react';
import { View, Text } from 'react-native';
import type { RoomType } from '../types';
import useTTLCountdown from '../hooks/useTTLCountdown';

export interface TTLCountdownHeaderProps {
  roomType: RoomType;
  expiresAtMs: number;
  onExpired: () => void;
}

export default function TTLCountdownHeader({ roomType, expiresAtMs, onExpired }: TTLCountdownHeaderProps) {
  const { formatted, isExpired, tone } = useTTLCountdown({ roomType, expiresAtMs });

  React.useEffect(() => {
    if (isExpired) onExpired();
  }, [isExpired, onExpired]);

  if (roomType !== 'TTL' || !expiresAtMs) return null;
  const color = tone === 'danger' ? '#FF6B6B' : '#5DA7FF';

  return (
    <View style={{ paddingTop:8, paddingBottom:4, borderBottomWidth:1, borderBottomColor:'#1F1F1F', backgroundColor:'#0C0C0C', alignItems:'center' }}>
      <Text
        style={{
          color,
          fontSize: 42,
          fontWeight: '900',
          letterSpacing: 2,
          fontVariant: ['tabular-nums'],
          textAlign: 'center',
          includeFontPadding: false,
        }}
      >
        {formatted}
      </Text>
    </View>
  );
}

