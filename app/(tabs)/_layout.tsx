import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Redirect, Tabs, usePathname, router } from 'expo-router';
import { Image, Keyboard, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
// IconSymbol 제거: 탭 아이콘은 @expo/vector-icons 사용
import { useAuth } from '@/contexts/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { EXCHANGE_UI_ENABLED, IOS_APP_STORE_SHELF, ORDER_ENABLED, STAKING_ENABLED, SWAP_ENABLED, WEB_TRADE_BLOCKED } from '@/lib/featureFlags';
import { MergedWalletAssetsProvider } from '@/contexts/MergedWalletAssetsContext';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { isAuthenticated, isLoading } = useAuth();
  const showExchange = EXCHANGE_UI_ENABLED;
  const showPayments = ORDER_ENABLED && STAKING_ENABLED && SWAP_ENABLED;
  const webShelf = WEB_TRADE_BLOCKED;
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
    const isActive = (key: 'wallet'|'payments'|'market'|'dashboard'|'exchange'|'todo'|'chat'|'more') => {
      const p = String(pathname || '');
      if (key === 'dashboard') return /\/\(tabs\)\/dashboard/i.test(p);
      if (key === 'wallet') return /\/\(tabs\)\/wallet/i.test(p);
      if (key === 'payments') return /\/\(tabs\)\/payments/i.test(p);
      if (key === 'market') return /\/\(tabs\)\/market/i.test(p);
      if (key === 'exchange') return /\/\(tabs\)\/exchange/i.test(p);
      if (key === 'todo') return /\/\(tabs\)\/todo/i.test(p);
      if (key === 'more') return /\/\(tabs\)\/more/i.test(p);
      // v2 is default; old chat remains as fallback only
      if (key === 'chat') return /\/chatv2(\/|$)/i.test(p);
      return false;
    };
    // Web(브라우저): 모바일앱 동일 5탭(Home/Wallet/ToDo/Chat/Profile)만 노출
    if (webShelf || IOS_APP_STORE_SHELF) {
      return (
        <View style={[styles.tabBarCustom, { bottom: 0, paddingBottom: 0, display: keyboardVisible ? 'none' : 'flex' }]}>
          <Item active={isActive('dashboard')} onPress={() => router.navigate('/(tabs)/dashboard')}>
            <Ionicons name="home" size={22.4} color={isActive('dashboard') ? activeColor : inactiveColor} />
          </Item>
          <Item active={isActive('wallet')} onPress={() => router.navigate('/(tabs)/wallet')}>
            <Ionicons name="wallet" size={22.4} color={isActive('wallet') ? activeColor : inactiveColor} />
          </Item>
          <Item active={isActive('market')} onPress={() => router.navigate('/(tabs)/market')}>
            <Ionicons name="trending-up" size={22.4} color={isActive('market') ? activeColor : inactiveColor} />
          </Item>
          <Item active={isActive('todo')} onPress={() => router.navigate('/(tabs)/todo')}>
            <MaterialIcons name="checklist" size={22.4} color={isActive('todo') ? activeColor : inactiveColor} />
          </Item>
          <Item active={isActive('chat')} onPress={() => router.navigate('/chatv2/rooms')}>
            <Ionicons name="chatbubble-ellipses" size={22.4} color={isActive('chat') ? activeColor : inactiveColor} />
          </Item>
          <Item active={isActive('more')} onPress={() => router.navigate('/(tabs)/more')}>
            <Ionicons name="person-circle-outline" size={22.4} color={isActive('more') ? activeColor : inactiveColor} />
          </Item>
        </View>
      );
    }
    return (
      <View style={[styles.tabBarCustom, { bottom: 0, paddingBottom: 0, display: keyboardVisible ? 'none' : 'flex' }]}>
        <Item active={isActive('wallet')} onPress={() => router.navigate('/(tabs)/wallet')}>
          <Ionicons name="wallet" size={22.4} color={isActive('wallet') ? activeColor : inactiveColor} />
        </Item>
        {showPayments ? (
          <Item active={isActive('payments')} onPress={() => router.navigate('/(tabs)/payments')}>
            <MaterialIcons name="swap-horiz" size={22.4} color={isActive('payments') ? activeColor : inactiveColor} />
          </Item>
        ) : null}
        <Item active={isActive('market')} onPress={() => router.navigate('/(tabs)/market')}>
          <Ionicons name="trending-up" size={22.4} color={isActive('market') ? activeColor : inactiveColor} />
        </Item>

        {/* Center (Home) */}
        <TouchableOpacity style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} onPress={() => router.navigate('/(tabs)/dashboard')}>
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: '#0A0A0A',
              borderWidth: 2,
              borderColor: '#D4AF37',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Image source={require('@/assets/images/YooY_simbol_1.png')} style={{ width: 26, height: 26 }} resizeMode="contain" />
          </View>
        </TouchableOpacity>

        {showExchange ? (
          <Item active={isActive('exchange')} onPress={() => router.navigate('/(tabs)/exchange')}>
            <MaterialIcons name="bar-chart" size={22.4} color={isActive('exchange') ? activeColor : inactiveColor} />
          </Item>
        ) : null}
        <Item active={isActive('todo')} onPress={() => router.navigate('/(tabs)/todo')}>
          <MaterialIcons name="checklist" size={22.4} color={isActive('todo') ? activeColor : inactiveColor} />
        </Item>
        <Item active={isActive('chat')} onPress={() => router.navigate('/chatv2/rooms')}>
          <Ionicons name="chatbubble-ellipses" size={22.4} color={isActive('chat') ? activeColor : inactiveColor} />
        </Item>
      </View>
    );
  };

  if (!isLoading && !isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <MergedWalletAssetsProvider>
    <>
      <Tabs
        initialRouteName={(webShelf || IOS_APP_STORE_SHELF) ? 'dashboard' : 'wallet'}
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
      {/* 2) payments — iOS 심사용 href 숨김, 라우트는 payments.tsx에서 Redirect */}
      <Tabs.Screen
        name="payments"
        options={{
          title: '',
          href: webShelf || !showPayments || IOS_APP_STORE_SHELF ? null : undefined,
          tabBarIcon: ({ color, focused }) => (
            <View style={{ width: 34, height: 34, justifyContent: 'center', alignItems: 'center', borderWidth: focused ? 0.5 : 0, borderColor: '#D4AF37', borderRadius: 5 }}>
              <MaterialIcons name="swap-horiz" size={22.4} color={color} />
            </View>
          ),
        }}
      />
      {/* 3) market */}
      <Tabs.Screen
        name="market"
        options={{
          title: '',
          href: webShelf || IOS_APP_STORE_SHELF ? null : undefined,
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
      {/* 5) exchange — iOS·비활성 시 href 숨김 */}
      <Tabs.Screen
        name="exchange"
        options={{
          title: '',
          href: webShelf || !showExchange || IOS_APP_STORE_SHELF ? null : undefined,
          tabBarIcon: ({ color, focused }) => (
            <View style={{ width: 34, height: 34, justifyContent: 'center', alignItems: 'center', borderWidth: focused ? 0.5 : 0, borderColor: '#D4AF37', borderRadius: 5 }}>
              <MaterialIcons name="bar-chart" size={22.4} color={color} />
            </View>
          ),
        }}
      />
      {/* 6) todo */}
      <Tabs.Screen name="todo" options={{ title: '', tabBarIcon: ({ color, focused }) => (
        <View style={{ width: 34, height: 34, justifyContent: 'center', alignItems: 'center', borderWidth: focused ? 0.5 : 0, borderColor: '#D4AF37', borderRadius: 5 }}>
          <MaterialIcons name="checklist" size={22.4} color={color} />
        </View>
      ) }} />

      {/* More / Profile (iOS 하단바 Profile 진입점) */}
      <Tabs.Screen name="more" options={{ title: '', tabBarIcon: ({ color, focused }) => (
        <View style={{ width: 34, height: 34, justifyContent: 'center', alignItems: 'center', borderWidth: focused ? 0.5 : 0, borderColor: '#D4AF37', borderRadius: 5 }}>
          <Ionicons name="person-circle-outline" size={22.4} color={color} />
        </View>
      ) }} />
      
      {/* 7) chat */}
      <Tabs.Screen name="chat" options={{ title: '', href: (webShelf || IOS_APP_STORE_SHELF) ? null : undefined, tabBarIcon: ({ color, focused }) => (
        <View style={{ width: 34, height: 34, justifyContent: 'center', alignItems: 'center', borderWidth: focused ? 0.5 : 0, borderColor: '#D4AF37', borderRadius: 5 }}>
          <Ionicons name="chatbubble-ellipses" size={22.4} color={color} />
        </View>
      ) }} />
      
      </Tabs>
      <GlobalBottomBar />
    </>
    </MergedWalletAssetsProvider>
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
