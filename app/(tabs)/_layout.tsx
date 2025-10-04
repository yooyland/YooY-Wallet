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
        tabBarStyle: {
          borderTopWidth: 2,
          borderTopColor: '#FFD700',
          paddingBottom: 0,
          paddingTop: 5,
          height: 50,
        },
        tabBarLabelStyle: {
          display: 'none',
          height: 0,
        },
        tabBarItemStyle: {
          justifyContent: 'flex-end',
          alignItems: 'center',
          paddingBottom: 0,
          paddingTop: 0,
          marginBottom: 0,
        },
        tabBarActiveTintColor: '#FFD700',
        tabBarInactiveTintColor: '#666666',
      }}>
      <Tabs.Screen
        name="dashboard"
        options={{
          title: '',
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol 
              size={28} 
              name="house.fill" 
              color={color}
              style={{
                borderWidth: focused ? 0.5 : 0,
                borderColor: '#FFD700',
                borderRadius: 3,
                padding: 1,
              }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="exchange"
        options={{
          title: '',
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol 
              size={28} 
              name="chart.bar.fill" 
              color={color}
              style={{
                borderWidth: focused ? 0.5 : 0,
                borderColor: '#FFD700',
                borderRadius: 3,
                padding: 1,
              }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: '',
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol 
              size={28} 
              name="wallet.pass.fill" 
              color={color}
              style={{
                borderWidth: focused ? 0.5 : 0,
                borderColor: '#FFD700',
                borderRadius: 3,
                padding: 1,
              }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="payments"
        options={{
          title: '',
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol 
              size={28} 
              name="creditcard.fill" 
              color={color}
              style={{
                borderWidth: focused ? 0.5 : 0,
                borderColor: '#FFD700',
                borderRadius: 3,
                padding: 1,
              }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: '',
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol 
              size={28} 
              name="bubble.left.and.bubble.right.fill" 
              color={color}
              style={{
                borderWidth: focused ? 0.5 : 0,
                borderColor: '#FFD700',
                borderRadius: 3,
                padding: 1,
              }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="todo"
        options={{
          title: '',
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol 
              size={28} 
              name="checklist" 
              color={color}
              style={{
                borderWidth: focused ? 0.5 : 0,
                borderColor: '#FFD700',
                borderRadius: 3,
                padding: 1,
              }}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: '',
          tabBarIcon: ({ color, focused }) => (
            <IconSymbol 
              size={28} 
              name="ellipsis" 
              color={color}
              style={{
                borderWidth: focused ? 0.5 : 0,
                borderColor: '#FFD700',
                borderRadius: 3,
                padding: 1,
              }}
            />
          ),
        }}
      />
    </Tabs>
  );
}
