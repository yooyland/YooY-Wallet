import { IconSymbol } from '@/components/ui/icon-symbol';
import { router } from 'expo-router';
import React from 'react';
import { Image, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = { active?: 'home' | 'exchange' | 'wallet' | 'payments' | 'chat' | 'todo' | 'more' };

export default function AppBottomBar({ active = 'home' }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bottomBar, { bottom: 0, paddingBottom: 0 }]}>
      <TouchableOpacity style={styles.bottomBarItem} onPress={() => router.push('/(tabs)/dashboard')}>
        <View style={[styles.iconWrap, active==='home' && styles.iconWrapActive]}>
          <IconSymbol size={28} name="house.fill" color={active==='home' ? '#FFD700' : '#666666'} />
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={styles.bottomBarItem} onPress={() => router.push('/(tabs)/exchange')}>
        <View style={[styles.iconWrap, active==='exchange' && styles.iconWrapActive]}>
          <IconSymbol size={28} name="chart.bar.fill" color={active==='exchange' ? '#FFD700' : '#666666'} />
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={styles.bottomBarItem} onPress={() => router.push('/(tabs)/wallet')}>
        <View style={[styles.iconWrap, active==='wallet' && styles.iconWrapActive]}>
          <IconSymbol size={28} name="wallet.pass.fill" color={active==='wallet' ? '#FFD700' : '#666666'} />
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={styles.bottomBarItem} onPress={() => router.push('/(tabs)/payments')}>
        <View style={[styles.iconWrap, active==='payments' && styles.iconWrapActive]}>
          <IconSymbol size={28} name="creditcard.fill" color={active==='payments' ? '#FFD700' : '#666666'} />
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={styles.bottomBarItem} onPress={() => router.push('/chat')}>
        <View style={[styles.iconWrap, active==='chat' && styles.iconWrapActive]}>
          <Image 
            source={require('@/assets/images/chat-icon.png')}
            style={{ width: 28, height: 28, tintColor: active==='chat' ? '#FFD700' : '#666666' }}
            resizeMode="contain"
          />
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={styles.bottomBarItem} onPress={() => router.push('/(tabs)/todo')}>
        <View style={[styles.iconWrap, active==='todo' && styles.iconWrapActive]}>
          <IconSymbol size={28} name="checklist" color={active==='todo' ? '#FFD700' : '#666666'} />
        </View>
      </TouchableOpacity>
      <TouchableOpacity style={styles.bottomBarItem} onPress={() => router.push('/(tabs)/more')}>
        <View style={[styles.iconWrap, active==='more' && styles.iconWrapActive]}>
          <IconSymbol size={28} name="ellipsis.circle" color={active==='more' ? '#FFD700' : '#666666'} />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bottomBar: {
    flexDirection: 'row',
    backgroundColor: '#0C0C0C',
    borderTopWidth: 1,
    borderTopColor: '#1E1E1E',
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
    borderWidth: 0,
  },
});


