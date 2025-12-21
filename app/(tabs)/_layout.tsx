import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Redirect, Tabs, usePathname, router } from 'expo-router';
import { Image, StyleSheet, TouchableOpacity, View, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
// IconSymbol 제거: 탭 아이콘은 @expo/vector-icons 사용
import { useAuth } from '@/contexts/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ORDER_ENABLED, STAKING_ENABLED } from '@/lib/featureFlags';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { isAuthenticated, isLoading } = useAuth();
  const showExchange = ORDER_ENABLED;
  const showPayments = ORDER_ENABLED && STAKING_ENABLED;
  const pathname = usePathname();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const subShow = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const subHide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  const GlobalBottomBar = () => {
    const insets = useSafeAreaInsets();
    const activeColor = '#D4AF37';
    const inactiveColor = '#666666';
    const Item = ({ active, onPress, children }: { active: boolean; onPress: () => void; children: React.ReactNode }) => (
      <TouchableOpacity style={{ flex:1, alignItems:'center', justifyContent:'center' }} onPress={onPress}>
        <View style={{ width: 34, height: 34, justifyContent: 'center', alignItems: 'center', borderWidth: active ? 0.5 : 0, borderColor: '#D4AF37', borderRadius: 5 }}>
          {children}
        </View>
      </TouchableOpacity>
    );
    const isActive = (key: 'wallet'|'payments'|'market'|'dashboard'|'exchange'|'todo'|'chat') => {
      const p = String(pathname || '');
      if (key === 'dashboard') return /\/\(tabs\)\/dashboard/i.test(p);
      if (key === 'wallet') return /\/\(tabs\)\/wallet/i.test(p);
      if (key === 'payments') return /\/\(tabs\)\/payments/i.test(p);
      if (key === 'market') return /\/\(tabs\)\/market/i.test(p);
      if (key === 'exchange') return /\/\(tabs\)\/exchange/i.test(p);
      if (key === 'todo') return /\/\(tabs\)\/todo/i.test(p);
      if (key === 'chat') return /\/chat(\/|$)/i.test(p);
      return false;
    };
    return (
      <View style={[styles.tabBarCustom, { bottom: 0, paddingBottom: 0, display: keyboardVisible ? 'none' : 'flex' }]}>
        <Item active={isActive('wallet')} onPress={() => router.push('/(tabs)/wallet')}>
          <Ionicons name="wallet" size={22.4} color={isActive('wallet') ? activeColor : inactiveColor} />
        </Item>
        <Item active={isActive('payments')} onPress={() => router.push('/(tabs)/payments')}>
          <MaterialIcons name="swap-horiz" size={22.4} color={isActive('payments') ? activeColor : inactiveColor} />
        </Item>
        <Item active={isActive('market')} onPress={() => router.push('/(tabs)/market')}>
          <Ionicons name="trending-up" size={22.4} color={isActive('market') ? activeColor : inactiveColor} />
        </Item>
        <Item active={isActive('dashboard')} onPress={() => router.push('/(tabs)/dashboard')}>
          <Image source={require('@/assets/images/YooY_simbol_1.png')} style={{ width: 29.1, height: 29.1 }} resizeMode="contain" />
        </Item>
        <Item active={isActive('exchange')} onPress={() => router.push('/(tabs)/exchange')}>
          <MaterialIcons name="bar-chart" size={22.4} color={isActive('exchange') ? activeColor : inactiveColor} />
        </Item>
        <Item active={isActive('todo')} onPress={() => router.push('/(tabs)/todo')}>
          <MaterialIcons name="checklist" size={22.4} color={isActive('todo') ? activeColor : inactiveColor} />
        </Item>
        <Item active={isActive('chat')} onPress={() => router.push('/chat/friends')}>
          <Ionicons name="chatbubble-ellipses" size={22.4} color={isActive('chat') ? activeColor : inactiveColor} />
        </Item>
      </View>
    );
  };

  if (!isLoading && !isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <>
      <Tabs
        screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
      }}>
      {/* 1) wallet */}
      <Tabs.Screen
        name="wallet"
        options={{
          title: '',
          tabBarIcon: ({ color, focused }) => (
            <View style={{ width: 34, height: 34, justifyContent: 'center', alignItems: 'center', borderWidth: focused ? 0.5 : 0, borderColor: '#D4AF37', borderRadius: 5 }}>
              <Ionicons name="wallet" size={22.4} color={color} />
            </View>
          ),
        }}
      />
      {/* 2) payments */}
      {showPayments ? (
        <Tabs.Screen
          name="payments"
          options={{
            title: '',
            tabBarIcon: ({ color, focused }) => (
              <View style={{ width: 34, height: 34, justifyContent: 'center', alignItems: 'center', borderWidth: focused ? 0.5 : 0, borderColor: '#D4AF37', borderRadius: 5 }}>
                <MaterialIcons name="swap-horiz" size={22.4} color={color} />
              </View>
            ),
          }}
        />
      ) : null}
      {/* 3) market */}
      <Tabs.Screen
        name="market"
        options={{
          title: '',
          tabBarIcon: ({ color, focused }) => (
            <View style={{ width: 34, height: 34, justifyContent: 'center', alignItems: 'center', borderWidth: focused ? 0.5 : 0, borderColor: '#D4AF37', borderRadius: 5 }}>
              <Ionicons name="trending-up" size={22.4} color={color} />
            </View>
          ),
        }}
      />
      {/* 4) dashboard - 로고 아이콘 */}
      <Tabs.Screen 
        name="dashboard" 
        options={{ 
          title: '',
          tabBarIcon: ({ color, focused }) => (
            <Image 
              source={focused 
                ? require('@/assets/images/YooY_simbol_1.png') 
                : require('@/assets/images/YooY_simbol_2.png')
              } 
              style={{ width: 34, height: 34 }} 
              resizeMode="contain" 
            />
          ),
        }} 
      />
      {/* 5) exchange */}
      {showExchange ? (
        <Tabs.Screen
          name="exchange"
          options={{
            title: '',
            tabBarIcon: ({ color, focused }) => (
              <View style={{ width: 34, height: 34, justifyContent: 'center', alignItems: 'center', borderWidth: focused ? 0.5 : 0, borderColor: '#D4AF37', borderRadius: 5 }}>
                <MaterialIcons name="bar-chart" size={22.4} color={color} />
              </View>
            ),
          }}
        />
      ) : null}
      {/* 6) todo */}
      <Tabs.Screen name="todo" options={{ title: '', tabBarIcon: ({ color, focused }) => (
        <View style={{ width: 34, height: 34, justifyContent: 'center', alignItems: 'center', borderWidth: focused ? 0.5 : 0, borderColor: '#D4AF37', borderRadius: 5 }}>
          <MaterialIcons name="checklist" size={22.4} color={color} />
        </View>
      ) }} />
      
      {/* 7) chat */}
      <Tabs.Screen name="chat" options={{ title: '', tabBarIcon: ({ color, focused }) => (
        <View style={{ width: 34, height: 34, justifyContent: 'center', alignItems: 'center', borderWidth: focused ? 0.5 : 0, borderColor: '#D4AF37', borderRadius: 5 }}>
          <Ionicons name="chatbubble-ellipses" size={22.4} color={color} />
        </View>
      ) }} />
      
      </Tabs>
      <GlobalBottomBar />
    </>
  );
}

const styles = StyleSheet.create({
  // Chat icon now uses the same style as other tabs
  tabBarCustom: {
    flexDirection: 'row',
    backgroundColor: '#0A0A0A',
    borderTopWidth: 2,
    borderTopColor: '#D4AF37',
    height: 50,
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10000,
    paddingHorizontal: 8,
  },
});
