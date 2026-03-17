import React from 'react';
import { View } from 'react-native';
import type { RoomSettingsModalProps } from '../components/RoomSettingsModal';
import PermissionTab from './PermissionTab';

// "관리" 탭: 보안/표시/차단/데이터 등 운영 항목을 한 곳으로 묶는다.
// 나가기 버튼은 모달 하단 공통 영역에서 처리한다.
export default function ManagementTab(props: RoomSettingsModalProps) {
  return (
    <View>
      {/* 보안/표시/차단/데이터(초기화/내보내기) */}
      <PermissionTab {...props} />
    </View>
  );
}

