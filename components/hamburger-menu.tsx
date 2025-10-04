import { ThemedText } from '@/components/themed-text';
import { getAdminRoleByEmail, isAdmin } from '@/constants/admins';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { mockBalances } from '@/data/balances';
import { formatCurrency, getExchangeRates } from '@/lib/currency';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    Alert,
    Animated,
    Dimensions,
    Image,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View
} from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface HamburgerMenuProps {
  visible: boolean;
  onClose: () => void;
  avatarUri?: string | null;
}

export default function HamburgerMenu({ visible, onClose, avatarUri }: HamburgerMenuProps) {
  const { currentUser, signOut } = useAuth();
  const { language, currency, setLanguage, setCurrency } = usePreferences();
  const [rates, setRates] = useState<any>(null);
  const [slideAnim] = useState(new Animated.Value(screenWidth));

  const total = mockBalances.reduce((s, b) => s + b.valueUSD, 0);
  const isUserAdmin = currentUser?.email ? isAdmin(currentUser.email) : false;
  const adminRole = currentUser?.email ? getAdminRoleByEmail(currentUser.email) : null;

  useEffect(() => {
    (async () => {
      const exchangeRates = await getExchangeRates();
      setRates(exchangeRates);
    })();
  }, [currency]);

  useEffect(() => {
    if (visible) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: screenWidth,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const handleSignOut = async () => {
    console.log('Sign out button pressed');
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Sign Out', 
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('Starting sign out process');
              await signOut();
              console.log('Sign out successful');
              onClose();
            } catch (error) {
              console.error('Sign out error:', error);
              Alert.alert('Error', 'Failed to sign out. Please try again.');
            }
          }
        }
      ]
    );
  };

  const menuSections = [
    {
      title: 'Account',
      items: [
        { 
          title: 'Profile', 
          icon: '👤', 
          onPress: () => { onClose(); /* Profile sheet will be handled by parent */ }
        },
        { 
          title: 'Security', 
          icon: '🔒', 
          onPress: () => { onClose(); router.push('/(tabs)/security'); }
        },
        { 
          title: 'Notifications', 
          icon: '🔔', 
          onPress: () => { onClose(); router.push('/(tabs)/notifications'); }
        },
      ]
    },
    {
      title: 'Trading',
      items: [
        { 
          title: 'Exchange', 
          icon: '📈', 
          onPress: () => { onClose(); router.push('/(tabs)/exchange'); }
        },
        { 
          title: 'Wallet', 
          icon: '💼', 
          onPress: () => { onClose(); router.push('/(tabs)/wallet'); }
        },
        { 
          title: 'Payments', 
          icon: '💳', 
          onPress: () => { onClose(); router.push('/(tabs)/payments'); }
        },
        { 
          title: 'Portfolio', 
          icon: '📊', 
          onPress: () => { onClose(); router.push('/(tabs)/portfolio'); }
        },
      ]
    },
    {
      title: 'Social',
      items: [
        { 
          title: 'Chat', 
          icon: '💬', 
          onPress: () => { onClose(); router.push('/(tabs)/chat'); }
        },
        { 
          title: 'Friends', 
          icon: '👥', 
          onPress: () => { onClose(); router.push('/(tabs)/friends'); }
        },
        { 
          title: 'Groups', 
          icon: '🏘️', 
          onPress: () => { onClose(); router.push('/(tabs)/groups'); }
        },
      ]
    },
    {
      title: 'Tools',
      items: [
        { 
          title: 'To-Do', 
          icon: '✅', 
          onPress: () => { onClose(); router.push('/(tabs)/todo'); }
        },
        { 
          title: 'Calendar', 
          icon: '📅', 
          onPress: () => { onClose(); router.push('/(tabs)/calendar'); }
        },
        { 
          title: 'Diary', 
          icon: '📝', 
          onPress: () => { onClose(); router.push('/(tabs)/diary'); }
        },
        { 
          title: 'Ledger', 
          icon: '📋', 
          onPress: () => { onClose(); router.push('/(tabs)/ledger'); }
        },
      ]
    },
    {
      title: 'Shopping',
      items: [
        { 
          title: 'Shop', 
          icon: '🛍️', 
          onPress: () => { onClose(); router.push('/(tabs)/shop'); }
        },
        { 
          title: 'NFT', 
          icon: '🎨', 
          onPress: () => { onClose(); router.push('/(tabs)/nft'); }
        },
        { 
          title: 'Orders', 
          icon: '📦', 
          onPress: () => { onClose(); router.push('/(tabs)/orders'); }
        },
      ]
    },
    {
      title: 'Settings',
      items: [
        { 
          title: 'Language', 
          icon: '🌐', 
          onPress: () => { onClose(); router.push('/(tabs)/language'); }
        },
        { 
          title: 'Currency', 
          icon: '💰', 
          onPress: () => { onClose(); router.push('/(tabs)/currency'); }
        },
        { 
          title: 'Theme', 
          icon: '🎨', 
          onPress: () => { onClose(); router.push('/(tabs)/theme'); }
        },
        { 
          title: 'About', 
          icon: 'ℹ️', 
          onPress: () => { onClose(); router.push('/(tabs)/about'); }
        },
      ]
    }
  ];

  // Add admin section if user is admin
  if (isUserAdmin) {
    menuSections.push({
      title: 'Admin',
      items: [
        { 
          title: 'Dashboard', 
          icon: '📊', 
          onPress: () => { onClose(); router.push('/(admin)/dashboard'); }
        },
        { 
          title: 'Users', 
          icon: '👥', 
          onPress: () => { onClose(); router.push('/(admin)/users'); }
        },
        { 
          title: 'Transactions', 
          icon: '💸', 
          onPress: () => { onClose(); router.push('/(admin)/transactions'); }
        },
        { 
          title: 'Reports', 
          icon: '📈', 
          onPress: () => { onClose(); router.push('/(admin)/reports'); }
        },
        ...(adminRole === 'super_admin' ? [
          { 
            title: 'System', 
            icon: '⚙️', 
            onPress: () => { onClose(); router.push('/(admin)/system'); }
          }
        ] : []),
      ]
    });
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View 
          style={[
            styles.menu, 
            { transform: [{ translateX: slideAnim }] }
          ]}
        >
          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.userInfo}>
                 <View style={styles.avatar}>
                   {avatarUri ? (
                     <Image source={{ uri: avatarUri }} style={styles.avatarImage} contentFit="cover" />
                   ) : (
                     <ThemedText style={styles.avatarText}>
                       {currentUser?.email?.charAt(0).toUpperCase() || 'A'}
                     </ThemedText>
                   )}
                 </View>
                 <View style={styles.userDetails}>
                   <ThemedText type="defaultSemiBold">{currentUser?.email || 'admin@yooyland.com'}</ThemedText>
                   <ThemedText style={styles.balance}>
                     {formatCurrency(total, currency, rates)}
                   </ThemedText>
                   {isUserAdmin && (
                     <ThemedText style={styles.adminBadge}>
                       {adminRole?.replace('_', ' ').toUpperCase()}
                     </ThemedText>
                   )}
                 </View>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <ThemedText style={styles.closeIcon}>✕</ThemedText>
              </TouchableOpacity>
            </View>

            {/* Menu Sections */}
            {menuSections.map((section, sectionIndex) => (
              <View key={sectionIndex} style={styles.section}>
                <ThemedText style={styles.sectionTitle}>{section.title}</ThemedText>
                {section.items.map((item, itemIndex) => (
                  <TouchableOpacity
                    key={itemIndex}
                    style={styles.menuItem}
                    onPress={item.onPress}
                  >
                    <ThemedText style={styles.menuIcon}>{item.icon}</ThemedText>
                    <ThemedText style={styles.menuText}>{item.title}</ThemedText>
                    <ThemedText style={styles.arrow}>›</ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            ))}

            {/* Sign Out Button */}
            <View style={styles.signOutSection}>
              <TouchableOpacity 
                style={styles.signOutButton} 
                onPress={() => {
                  console.log('Sign out TouchableOpacity pressed');
                  handleSignOut();
                }}
              >
                <ThemedText style={styles.signOutText}>Sign Out</ThemedText>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  menu: {
    width: screenWidth * 0.85,
    height: screenHeight,
    backgroundColor: Colors.dark.background,
    borderRightWidth: 1,
    borderRightColor: '#FFD700',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#FFD700',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarText: {
    color: Colors.dark.background,
    fontSize: 20,
    fontWeight: 'bold',
  },
  userDetails: {
    flex: 1,
  },
  balance: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFD700',
    marginTop: 2,
  },
  adminBadge: {
    fontSize: 12,
    color: '#FFD700',
    fontWeight: 'bold',
    marginTop: 2,
  },
  closeButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    fontSize: 18,
    color: Colors.dark.text,
  },
  section: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFD700',
    marginBottom: 8,
    marginHorizontal: 20,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingLeft: 40,
    paddingRight: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.dark.icon,
    marginLeft: 0,
    marginRight: 0,
  },
  menuIcon: {
    fontSize: 20,
    marginRight: 15,
    width: 25,
  },
  menuText: {
    flex: 1,
    fontSize: 16,
  },
  arrow: {
    fontSize: 18,
    color: Colors.dark.icon,
  },
  signOutSection: {
    marginTop: 30,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  signOutButton: {
    backgroundColor: '#e74c3c',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  signOutText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
