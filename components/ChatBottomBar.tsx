import { EXCHANGE_UI_ENABLED, IOS_APP_STORE_SHELF, ORDER_ENABLED, STAKING_ENABLED, SWAP_ENABLED } from '@/lib/featureFlags';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, TouchableOpacity, View, Keyboard } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';

type Props = { active?: 'wallet' | 'payments' | 'market' | 'dashboard' | 'exchange' | 'todo' | 'chat' | 'home' | 'more' };

export default function ChatBottomBar({ active = 'chat' }: Props) {
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const subShow = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const subHide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);
  if (keyboardVisible) return null;

  const showExchange = EXCHANGE_UI_ENABLED;
  const showPayments = ORDER_ENABLED && STAKING_ENABLED && SWAP_ENABLED;

  if (IOS_APP_STORE_SHELF) {
    return (
      <View style={[styles.bottomBar, { bottom: 0, paddingBottom: 0 }]}>
        <TouchableOpacity style={styles.bottomBarItem} onPress={() => router.push('/(tabs)/dashboard')}>
          <View style={[styles.iconWrap, active === 'home' && styles.iconWrapActive]}>
            <Ionicons name="home" size={24} color={active === 'home' ? '#FFD700' : '#666666'} />
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomBarItem} onPress={() => router.push('/(tabs)/wallet')}>
          <View style={[styles.iconWrap, active === 'wallet' && styles.iconWrapActive]}>
            <Ionicons name="wallet" size={24} color={active === 'wallet' ? '#FFD700' : '#666666'} />
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomBarItem} onPress={() => router.push('/(tabs)/todo')}>
          <View style={[styles.iconWrap, active === 'todo' && styles.iconWrapActive]}>
            <MaterialIcons name="checklist" size={24} color={active === 'todo' ? '#FFD700' : '#666666'} />
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomBarItem} onPress={() => router.push('/chatv2/rooms')}>
          <View style={[styles.iconWrap, active === 'chat' && styles.iconWrapActive]}>
            <Ionicons name="chatbubble-ellipses" size={24} color={active === 'chat' ? '#FFD700' : '#666666'} />
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomBarItem} onPress={() => router.push('/(tabs)/more')}>
          <View style={[styles.iconWrap, active === 'more' && styles.iconWrapActive]}>
            <Ionicons name="person-circle-outline" size={24} color={active === 'more' ? '#FFD700' : '#666666'} />
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.bottomBar, { bottom: 0, paddingBottom: 0 }]}>
      {/* wallet */}
      <TouchableOpacity style={styles.bottomBarItem} onPress={() => router.push('/(tabs)/wallet')}>
        <View style={[styles.iconWrap, active==='wallet' && styles.iconWrapActive]}>
          <Ionicons name="wallet" size={24} color={active==='wallet' ? '#FFD700' : '#666666'} />
        </View>
      </TouchableOpacity>
      {/* payments */}
      {showPayments ? (
      <TouchableOpacity style={styles.bottomBarItem} onPress={() => router.push('/(tabs)/payments')}>
        <View style={[styles.iconWrap, active==='payments' && styles.iconWrapActive]}>
          <MaterialIcons name="swap-horiz" size={24} color={active==='payments' ? '#FFD700' : '#666666'} />
        </View>
      </TouchableOpacity>
      ) : null}
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
      {showExchange ? (
      <TouchableOpacity style={styles.bottomBarItem} onPress={() => router.push('/(tabs)/exchange')}>
        <View style={[styles.iconWrap, active==='exchange' && styles.iconWrapActive]}>
          <MaterialIcons name="bar-chart" size={24} color={active==='exchange' ? '#FFD700' : '#666666'} />
        </View>
      </TouchableOpacity>
      ) : null}
      {/* todo */}
      <TouchableOpacity style={styles.bottomBarItem} onPress={() => router.push('/(tabs)/todo')}>
        <View style={[styles.iconWrap, active==='todo' && styles.iconWrapActive]}>
          <MaterialIcons name="checklist" size={24} color={active==='todo' ? '#FFD700' : '#666666'} />
        </View>
      </TouchableOpacity>
      {/* chat (default -> v2) */}
      <TouchableOpacity style={styles.bottomBarItem} onPress={() => router.push('/chatv2')}>
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
