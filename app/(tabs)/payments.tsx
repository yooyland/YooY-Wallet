import TopBar from '@/components/top-bar';
import HamburgerMenu from '@/components/hamburger-menu';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StyleSheet, View } from 'react-native';
import { useEffect, useState } from 'react';

export default function PaymentsScreen() {
  const { currentUser } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem('profile.photoUri');
      if (saved) setAvatarUri(saved);
    })();
  }, []);

  return (
    <ThemedView style={{ flex: 1 }}>
      <TopBar 
        title={currentUser?.email?.split('@')[0] || 'admin'} 
        onMenuPress={() => setMenuOpen(true)}
        avatarUri={avatarUri} 
      />
      <View style={styles.container}>
        <ThemedText type="title">Payments</ThemedText>
        <ThemedText>입출금(스테이블, 스테이킹) 자리표시자</ThemedText>
      </View>
      <HamburgerMenu visible={menuOpen} onClose={() => setMenuOpen(false)} avatarUri={avatarUri} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
});


