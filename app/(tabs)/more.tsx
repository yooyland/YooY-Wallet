import HamburgerMenu from '@/components/hamburger-menu';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import TopBar from '@/components/top-bar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Link } from 'expo-router';
import { useState } from 'react';
import {
    Dimensions,
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

  const moreMenuItems = [
    {
      title: 'Explore',
      icon: 'paperplane.fill',
      href: '/explore',
      description: 'Discover new features and content'
    },
    {
      title: 'Shop / NFT',
      icon: 'bag.fill',
      href: '/shop',
      description: 'NFT marketplace and shopping'
    },
    {
      title: 'Profile',
      icon: 'person.circle.fill',
      href: '/profile',
      description: 'Manage your profile settings'
    },
    {
      title: 'Settings',
      icon: 'gearshape.fill',
      href: '/settings',
      description: 'App preferences and configuration'
    },
    {
      title: 'Help & Support',
      icon: 'questionmark.circle.fill',
      href: '/help',
      description: 'Get help and contact support'
    },
    {
      title: 'About',
      icon: 'info.circle.fill',
      href: '/about',
      description: 'App information and version'
    }
  ];

  return (
    <ThemedView style={{ flex: 1 }}>
      <TopBar 
        title="More" 
        onProfilePress={() => setMenuOpen(true)}
        avatarUri={null}
      />
      
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <ThemedText style={styles.headerTitle}>More Options</ThemedText>
          <ThemedText style={styles.headerSubtitle}>
            Access additional features and settings
          </ThemedText>
        </View>

        <View style={styles.menuGrid}>
          {moreMenuItems.map((item, index) => (
            <Link key={index} href={item.href} asChild>
              <TouchableOpacity style={styles.menuItem}>
                <View style={styles.menuIcon}>
                  <IconSymbol size={32} name={item.icon} color="#FFD700" />
                </View>
                <View style={styles.menuContent}>
                  <ThemedText style={styles.menuTitle}>{item.title}</ThemedText>
                  <ThemedText style={styles.menuDescription}>
                    {item.description}
                  </ThemedText>
                </View>
                <IconSymbol size={20} name="chevron.right" color="#666" />
              </TouchableOpacity>
            </Link>
          ))}
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
        avatarUri={null}
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
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  menuIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  menuDescription: {
    fontSize: 14,
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
