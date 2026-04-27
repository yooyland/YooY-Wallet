import HamburgerMenu from '@/components/hamburger-menu';
import ProfileSheet from '@/components/profile-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import TopBar from '@/components/top-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link } from 'expo-router';
import { IOS_APP_STORE_SHELF } from '@/lib/featureFlags';
import { loadUserProfileLite } from '@/lib/userProfile';
import { useEffect, useMemo, useState } from 'react';
import {
    Dimensions,
    Linking,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View
} from 'react-native';

const { width } = Dimensions.get('window');

export default function MoreScreen() {
  const { currentUser } = useAuth();
  const { language } = usePreferences();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [username, setUsername] = useState<string>('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [profileUpdated, setProfileUpdated] = useState(false);
  
  // Load username and avatar on component mount
  useEffect(() => {
    (async () => {
      if (currentUser?.uid) {
        const p = await loadUserProfileLite({
          uid: currentUser.uid,
          displayName: (currentUser as any)?.displayName,
          email: (currentUser as any)?.email,
        });
        setUsername(p.username || (currentUser?.email?.split('@')[0] || 'User'));
        setAvatarUri(p.photoUri || null);
      }
    })();
  }, [currentUser?.uid, profileUpdated]);

  const moreMenuItems = useMemo(() => {
    const termsUrl = (process.env.EXPO_PUBLIC_TERMS_URL as string) || 'https://yooy.land/terms';
    const privacyUrl = (process.env.EXPO_PUBLIC_PRIVACY_URL as string) || 'https://yooy.land/privacy';
    const profileTitle = language === 'ko' ? '프로필 편집' : 'Edit profile';
    const settingsTitle = language === 'ko' ? '설정' : 'Settings';
    const helpTitle = language === 'ko' ? '도움말' : 'Help';
    const aboutTitle = language === 'ko' ? '정보' : 'About';
    const termsTitle = language === 'ko' ? '이용약관' : 'Terms of Service';
    const privacyTitle = language === 'ko' ? '개인정보처리방침' : 'Privacy Policy';

    const core: Array<{
      title: string;
      icon: string;
      href: string;
      description: string;
      external?: boolean;
    }> = [
      { title: profileTitle, icon: 'person.circle.fill', href: '/settings/profile', description: language === 'ko' ? '닉네임·사진' : 'Nickname & photo' },
      { title: settingsTitle, icon: 'gearshape.fill', href: '/settings', description: language === 'ko' ? '앱 환경설정' : 'App preferences' },
      { title: helpTitle, icon: 'questionmark.circle.fill', href: '/help', description: language === 'ko' ? '고객 지원' : 'Support center' },
      { title: aboutTitle, icon: 'info.circle.fill', href: '/about', description: language === 'ko' ? '앱 정보' : 'App information' },
    ];

    if (IOS_APP_STORE_SHELF) {
      return [
        ...core,
        { title: termsTitle, icon: 'doc.text.fill', href: termsUrl, description: language === 'ko' ? '웹에서 열기' : 'Open in browser', external: true },
        { title: privacyTitle, icon: 'hand.raised.fill', href: privacyUrl, description: language === 'ko' ? '웹에서 열기' : 'Open in browser', external: true },
      ];
    }

    return [
      { title: 'Explore', icon: 'paperplane.fill', href: '/explore', description: 'Discover new features' },
      { title: 'Shop / NFT', icon: 'bag.fill', href: '/shop', description: 'NFT marketplace' },
      ...core,
    ];
  }, [language]);

  return (
    <ThemedView style={{ flex: 1 }}>
      <TopBar 
        title={username}
        onProfilePress={() => setProfileOpen(true)}
        onMenuPress={() => setMenuOpen(true)}
        avatarUri={avatarUri}
        profileUpdated={profileUpdated}
      />
      
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <ThemedText style={styles.headerTitle}>More Options</ThemedText>
          <ThemedText style={styles.headerSubtitle}>
            Access additional features and settings
          </ThemedText>
        </View>

        <View style={styles.menuGrid}>
          {moreMenuItems.map((item, index) =>
            item.external ? (
              <TouchableOpacity
                key={index}
                style={styles.menuItem}
                onPress={() => {
                  try {
                    void Linking.openURL(item.href);
                  } catch {}
                }}
              >
                <View style={styles.menuIcon}>
                  <IconSymbol size={24} name={item.icon as any} color="#FFD700" />
                </View>
                <View style={styles.menuContent}>
                  <ThemedText style={styles.menuTitle}>{item.title}</ThemedText>
                  <ThemedText style={styles.menuDescription}>{item.description}</ThemedText>
                </View>
                <IconSymbol size={20} name="chevron.right" color="#666" />
              </TouchableOpacity>
            ) : (
              <Link key={index} href={item.href as any} asChild>
                <TouchableOpacity style={styles.menuItem}>
                  <View style={styles.menuIcon}>
                    <IconSymbol size={24} name={item.icon as any} color="#FFD700" />
                  </View>
                  <View style={styles.menuContent}>
                    <ThemedText style={styles.menuTitle}>{item.title}</ThemedText>
                    <ThemedText style={styles.menuDescription}>{item.description}</ThemedText>
                  </View>
                  <IconSymbol size={20} name="chevron.right" color="#666" />
                </TouchableOpacity>
              </Link>
            )
          )}
        </View>

        <View style={styles.footer}>
          <ThemedText style={styles.footerText}>
            YooY Land - Your Gateway to the Golden Era
          </ThemedText>
          <ThemedText style={styles.versionText}>
            Version 1.0.0
          </ThemedText>
        </View>
      </ScrollView>

      <HamburgerMenu 
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        avatarUri={avatarUri}
      />
      
      <ProfileSheet 
        visible={profileOpen} 
        onClose={() => setProfileOpen(false)} 
        onSaved={async (newAvatarUri) => {
          setAvatarUri(newAvatarUri);
          setProfileOpen(false);
          setProfileUpdated(prev => !prev); // 프로필 업데이트 상태 토글

          // username도 Firestore 우선으로 재로드
          try {
            if (currentUser?.uid) {
              const p = await loadUserProfileLite({
                uid: currentUser.uid,
                displayName: (currentUser as any)?.displayName,
                email: (currentUser as any)?.email,
              });
              setUsername(p.username || (currentUser?.email?.split('@')[0] || 'User'));
            }
          } catch {}
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  header: {
    padding: 20,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#CCCCCC',
    textAlign: 'center',
  },
  menuGrid: {
    paddingHorizontal: 20,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  menuDescription: {
    fontSize: 12,
    color: '#CCCCCC',
  },
  footer: {
    padding: 20,
    alignItems: 'center',
    marginTop: 20,
  },
  footerText: {
    fontSize: 16,
    color: '#FFD700',
    fontWeight: '600',
    marginBottom: 8,
  },
  versionText: {
    fontSize: 14,
    color: '#666',
  },
});
