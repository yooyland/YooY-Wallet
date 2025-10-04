import { Redirect, Tabs } from 'expo-router';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { isAuthenticated, isLoading } = useAuth();

  if (!isLoading && !isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="paperplane.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="exchange"
        options={{
          title: 'Exchange',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="chart.bar.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: 'Wallet',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="wallet.pass.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="payments"
        options={{
          title: 'Payments',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="creditcard.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="bubble.left.and.bubble.right.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="todo"
        options={{
          title: 'To-Do',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="checklist" color={color} />,
        }}
      />
      <Tabs.Screen
        name="shop"
        options={{
          title: 'Shop / NFT',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="bag.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
