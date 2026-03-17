/**
 * Renders forced or optional update modal based on useAppVersionCheck.
 * Mount once at root (e.g. _layout) so version is checked on app launch.
 */

import React from 'react';
import { useAppVersionCheck } from '@/src/hooks/useAppVersionCheck';
import UpdateOptionalModal from '@/src/components/UpdateOptionalModal';
import UpdateRequiredModal from '@/src/components/UpdateRequiredModal';

export default function AppUpdateGate() {
  const { result, dismissOptional } = useAppVersionCheck();

  // 강제 업데이트 팝업은 당분간 비활성화하여 앱 진입을 막지 않는다.
  // (Remote Config / versionCode 로직이 안정화된 뒤 다시 활성화 예정)
  // if (result?.type === 'forced') {
  //   return (
  //     <UpdateRequiredModal
  //       visible
  //       config={result.config}
  //     />
  //   );
  // }

  if (result?.type === 'optional') {
    return (
      <UpdateOptionalModal
        visible
        config={result.config}
        onDismiss={dismissOptional}
      />
    );
  }

  return null;
}
