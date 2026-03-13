import React from 'react';
import type { RoomSettings } from '../types';

export default function useRoomSettingsState(initial: RoomSettings) {
  const [settings, setSettings] = React.useState<RoomSettings>(initial);
  const onChange = (partial: Partial<RoomSettings>) => {
    setSettings((prev) => ({
      ...prev,
      ...partial,
      basic: { ...prev.basic, ...(partial as any).basic },
      members: { ...prev.members, ...(partial as any).members },
      permissions: { ...prev.permissions, ...(partial as any).permissions },
      notifications: { ...prev.notifications, ...(partial as any).notifications },
      theme: { ...prev.theme, ...(partial as any).theme },
      ttl: { ...prev.ttl, ...(partial as any).ttl },
    }));
  };
  return { settings, onChange, setSettings };
}

