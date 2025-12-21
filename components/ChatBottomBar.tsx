import { IconSymbol } from '@/components/ui/icon-symbol';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, TouchableOpacity, View, Keyboard } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = { active?: 'wallet' | 'payments' | 'market' | 'dashboard' | 'exchange' | 'todo' | 'chat' };

export default function ChatBottomBar({ active = 'chat' }: Props) {
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const subShow = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const subHide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);
  return (
    <View style={[styles.bottomBar, { bottom: 0, paddingBottom: 0, display: keyboardVisible ? 'none' : 'flex' }]}>
      {/* wallet */}
      <TouchableOpacity style={styles.bottomBarItem} onPress={() => router.push('/(tabs)/wallet')}>
        <View style={[styles.iconWrap, active==='wallet' && styles.iconWrapActive]}>
          <Ionicons name="wallet" size={24} color={active==='wallet' ? '#FFD700' : '#666666'} />
        </View>
      </TouchableOpacity>
      {/* payments */}
      <TouchableOpacity style={styles.bottomBarItem} onPress={() => router.push('/(tabs)/payments')}>
        <View style={[styles.iconWrap, active==='payments' && styles.iconWrapActive]}>
          <MaterialIcons name="swap-horiz" size={24} color={active==='payments' ? '#FFD700' : '#666666'} />
        </View>
      </TouchableOpacity>
      {/* market */}
      <TouchableOpacity style={styles.bottomBarItem} onPress={() => router.push('/(tabs)/market')}>
        <View style={[styles.iconWrap, active==='market' && styles.iconWrapActive]}>
          <Ionicons name="trending-up" size={24} color={active==='market' ? '#FFD700' : '#666666'} />
        </View>
      </TouchableOpacity>
      {/* dashboard (logo) - 130% size */}
      <TouchableOpacity style={styles.bottomBarItem} onPress={() => router.push('/(tabs)/dashboard')}>
        <View style={[styles.iconWrap, active==='dashboard' && styles.iconWrapActive]}>
          <Image
            source={require('@/assets/images/YooY_simbol_1.png')}
            style={{ width: 31.2, height: 31.2, tintColor: undefined }}
            resizeMode="contain"
          />
        </View>
      </TouchableOpacity>
      {/* exchange */}
      <TouchableOpacity style={styles.bottomBarItem} onPress={() => router.push('/(tabs)/exchange')}>
        <View style={[styles.iconWrap, active==='exchange' && styles.iconWrapActive]}>
          <MaterialIcons name="bar-chart" size={24} color={active==='exchange' ? '#FFD700' : '#666666'} />
        </View>
      </TouchableOpacity>
      {/* todo */}
      <TouchableOpacity style={styles.bottomBarItem} onPress={() => router.push('/(tabs)/todo')}>
        <View style={[styles.iconWrap, active==='todo' && styles.iconWrapActive]}>
          <MaterialIcons name="checklist" size={24} color={active==='todo' ? '#FFD700' : '#666666'} />
        </View>
      </TouchableOpacity>
      {/* chat (friends) */}
      <TouchableOpacity style={styles.bottomBarItem} onPress={() => router.push('/chat/friends')}>
        <View style={[styles.iconWrap, active==='chat' && styles.iconWrapActive]}>
          <Ionicons name="chatbubble-ellipses" size={24} color={active==='chat' ? '#FFD700' : '#666666'} />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bottomBar: {
    flexDirection: 'row',
    backgroundColor: '#0C0C0C',
    borderTopWidth: 2,
    borderTopColor: '#FFD700',
    height: 50,
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10000,
    paddingHorizontal: 8,
  },
  bottomBarItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  iconWrap: {
    borderWidth: 0,
    borderColor: 'transparent',
    borderRadius: 8,
    padding: 1,
    minWidth: 32,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    borderWidth: 0.5,
    borderColor: '#FFD700',
  },
});


