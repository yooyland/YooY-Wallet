import React from 'react';
import type { RoomType } from '../types';

export default function useTTLCountdown(params: { roomType: RoomType; expiresAtMs: number }) {
  const { roomType, expiresAtMs } = params;
  const [now, setNow] = React.useState<number>(Date.now());
  React.useEffect(() => {
    if (roomType !== 'TTL' || !expiresAtMs) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [roomType, expiresAtMs]);

  const remainingMs = Math.max(0, (expiresAtMs || 0) - now);
  const isExpired = roomType === 'TTL' && !!expiresAtMs && remainingMs <= 0;
  const tone: 'danger' | 'info' = remainingMs <= 24 * 60 * 60 * 1000 ? 'danger' : 'info';

  const totalSec = Math.floor(remainingMs / 1000);
  const dd = Math.floor(totalSec / (24 * 3600));
  const hh = Math.floor((totalSec % (24 * 3600)) / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  const formatted = `${String(dd).padStart(2, '0')} | ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;

  return { remainingMs, isExpired, tone, formatted };
}

