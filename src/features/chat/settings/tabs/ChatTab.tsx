import React from 'react';
import { View } from 'react-native';
import type { RoomSettingsModalProps } from '../components/RoomSettingsModal';
import ThemeTab from './ThemeTab';

// "채팅" 탭: 글자 크기 + 테마(기본/다크/커스텀) 등 채팅 표시 설정을 한 곳으로 묶는다.
export default function ChatTab(props: RoomSettingsModalProps) {
  return (
    <View>
      <ThemeTab {...props} />
    </View>
  );
}

