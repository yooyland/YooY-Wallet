import { useEffect } from 'react';
import { View, Text } from 'react-native';
import { router, usePathname } from 'expo-router';

export default function NotFoundScreen() {
  const pathname = usePathname();
  useEffect(() => {
    // 알 수 없는 딥링크(예: appyooyland:///)로 진입 시 기본 탭으로 우회
    try {
      router.replace('/(tabs)/wallet');
    } catch {}
  }, [pathname]);
  return (
    <View style={{ flex:1, alignItems:'center', justifyContent:'center', backgroundColor:'#000' }}>
      <Text style={{ color:'#fff' }}>Routing…</Text>
    </View>
  );
}


