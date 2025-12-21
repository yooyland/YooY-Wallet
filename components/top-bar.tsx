import { useAuth } from '@/contexts/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { router, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  title?: string;
  onMenuPress?: () => void;
  onProfilePress?: () => void;
  avatarUri?: string | null;
  profileUpdated?: boolean; // 프로필 업데이트 감지용
};

const basePhotoKey = (uid?: string) => uid ? `u:${uid}:profile.photoUri` : 'profile.photoUri';
const baseInfoKey = (uid?: string) => uid ? `u:${uid}:profile.info` : 'profile.info';

export default function TopBar({ title, onMenuPress, onProfilePress, avatarUri, profileUpdated }: Props) {
  const { currentUser } = useAuth();
  const [savedAvatar, setSavedAvatar] = useState<string | null>(null);
  const [savedInfo, setSavedInfo] = useState<any>(null);
  const pathname = usePathname() as unknown as string | undefined;
  const isChat = (() => { try { return /(\/chat(\b|\/))/i.test(String(pathname||'')); } catch { return false; } })();
  const showCenterLogo = !isChat;

  // Load saved profile data
  useEffect(() => {
    (async () => {
      if (currentUser?.uid) {
        const photo = await AsyncStorage.getItem(basePhotoKey(currentUser.uid));
        const info = await AsyncStorage.getItem(baseInfoKey(currentUser.uid));
        setSavedAvatar(photo);
        if (info) {
          try {
            setSavedInfo(JSON.parse(info));
          } catch {}
        }
      }
    })();
  }, [currentUser?.uid, profileUpdated]); // profileUpdated 의존성 추가

  const displayNameRaw = savedInfo?.username || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Guest';
  const displayName = String(displayNameRaw).trim().toLowerCase()==='user' ? 'Guest' : displayNameRaw;

  // Chat 페이지에서는 전역 TopBar 숨김 (모든 훅 호출 후 안전하게 return)
  if (isChat) return null as any;

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.left} onPress={onProfilePress}>
        {(avatarUri || savedAvatar) ? (
          <Image source={{ uri: avatarUri || savedAvatar }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={styles.defaultAvatar}>
            <Text style={styles.defaultAvatarText}>{(displayName[0] || 'U').toUpperCase()}</Text>
          </View>
        )}
        <Text style={styles.name}>{title ?? displayName}</Text>
      </TouchableOpacity>
      
      <View style={styles.centerContainer}>
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/dashboard')}
          style={{ opacity: showCenterLogo ? 1 : 0, pointerEvents: showCenterLogo ? 'auto' as any : 'none' as any }}
          disabled={!showCenterLogo}
        >
          <Image source={require('@/assets/images/logo.png')} style={styles.logo} contentFit="contain" />
        </TouchableOpacity>
      </View>
      
      <TouchableOpacity onPress={onMenuPress} style={styles.menuBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <View style={styles.menuLine} />
        <View style={styles.menuLine} />
        <View style={styles.menuLine} />
      </TouchableOpacity>
    </View>
  );
}

const GOLD = '#D4AF37';

const styles = StyleSheet.create({
  container: {
    height: 56,
    backgroundColor: '#0A0A0A',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: GOLD,
    position: 'relative',
  },
  left: { 
    flexDirection: 'row', 
    alignItems: 'center',
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: { width: 28, height: 28, borderRadius: 14, marginRight: 8, borderWidth: 1, borderColor: GOLD },
  defaultAvatar: { width: 28, height: 28, borderRadius: 14, marginRight: 8, borderWidth: 1, borderColor: GOLD, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' },
  defaultAvatarText: { color: '#0A0A0A', fontWeight: 'bold', fontSize: 14 },
  name: { color: '#ffffff', fontWeight: '600' },
  logo: { width: 60, height: 28 },
  // 로고를 오른쪽으로 30px 이동
  // 중앙 컨테이너는 가운데 정렬이므로, 로고 자체에 마진을 부여합니다.
  // 노치/세이프에어리어 처리와 충돌 없음
  // (필요 시 화면별로 centerContainer 스타일을 덮어쓸 수 있습니다)
  // 기존 width/height 유지
  logo: { width: 60, height: 28, marginLeft: 30 },
  menuBtn: { 
    padding: 6,
    flex: 1,
    alignItems: 'flex-end',
  },
  menuLine: { width: 18, height: 2, backgroundColor: GOLD, marginVertical: 2 },
});


