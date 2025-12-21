import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    Animated,
    Dimensions,
    Image,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

type Props = {
  currentScreen?: string;
};

const Footer: React.FC<Props> = ({ currentScreen }) => {
  const [fadeAnim] = useState(new Animated.Value(0));
  const [selectedLanguage, setSelectedLanguage] = useState('EN');
  
  const { width } = Dimensions.get('window');
  const isTablet = width > 768;
  const isMobile = width <= 480;

  useEffect(() => {
    // Fade-in animation on load
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, []);

  const navigationLinks = [
    { name: 'Home', route: '/(tabs)/dashboard' },
    { name: 'Wallet', route: '/(tabs)/wallet' },
    { name: 'Exchange', route: '/(tabs)/exchange' },
    { name: 'Chat', route: '/(tabs)/chat' },
    { name: 'Shop', route: '/(tabs)/shop' },
  ];

  const languages = ['EN', 'KR', 'JP', 'CN'];

  const handleNavigation = (route: string) => {
    if (route !== currentScreen) {
      router.push(route as any);
    }
  };

  const handleLanguageChange = (lang: string) => {
    setSelectedLanguage(lang);
    // Language change logic can be implemented here
  };

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <View style={[styles.content, isTablet && styles.tabletContent, isMobile && styles.mobileContent]}>
        {/* Brand Line */}
        <Text style={[styles.brandLine, isTablet && styles.tabletBrandLine, isMobile && styles.mobileBrandLine]}>
          The Golden Age Begins With You
        </Text>

        {/* App Summary Line */}
        <View style={[styles.appSummaryContainer, isTablet && styles.tabletAppSummaryContainer, isMobile && styles.mobileAppSummaryContainer]}>
          <View style={[styles.appSummaryTextContainer, isTablet && styles.tabletAppSummaryTextContainer, isMobile && styles.mobileAppSummaryTextContainer]}>
            <Text style={[styles.appSummaryItem, isTablet && styles.tabletAppSummaryItem, isMobile && styles.mobileAppSummaryItem]}>
              · Wallet
            </Text>
            <Text style={[styles.appSummaryItem, isTablet && styles.tabletAppSummaryItem, isMobile && styles.mobileAppSummaryItem]}>
              · Exchange
            </Text>
            <Text style={[styles.appSummaryItem, isTablet && styles.tabletAppSummaryItem, isMobile && styles.mobileAppSummaryItem]}>
              · Chat
            </Text>
            <Text style={[styles.appSummaryItem, isTablet && styles.tabletAppSummaryItem, isMobile && styles.mobileAppSummaryItem]}>
              · NFT
            </Text>
            <Text style={[styles.appSummaryItem, isTablet && styles.tabletAppSummaryItem, isMobile && styles.mobileAppSummaryItem]}>
              · Shop
            </Text>
            <Text style={[styles.appSummaryTagline, isTablet && styles.tabletAppSummaryTagline, isMobile && styles.mobileAppSummaryTagline]}>
              — All in one Web3 Super App
            </Text>
          </View>
          <View style={[styles.appSummaryImageContainer, isTablet && styles.tabletAppSummaryImageContainer, isMobile && styles.mobileAppSummaryImageContainer]}>
            <Image 
              source={require('@/assets/images/yooy-w.png')} 
              style={[styles.yooyImage, isTablet && styles.tabletYooyImage, isMobile && styles.mobileYooyImage]}
              resizeMode="contain"
            />
          </View>
        </View>

        {/* Navigation Links */}
        <View style={[styles.navigationContainer, isTablet && styles.tabletNavigation, isMobile && styles.mobileNavigation]}>
          {navigationLinks.map((link, index) => (
            <React.Fragment key={link.name}>
              <TouchableOpacity
                style={styles.navLink}
                onPress={() => handleNavigation(link.route)}
                activeOpacity={0.7}
              >
                <Text style={[styles.navText, isMobile && styles.mobileNavText]}>
                  {link.name}
                </Text>
              </TouchableOpacity>
              {index < navigationLinks.length - 1 && (
                <Text style={[styles.separator, isMobile && styles.mobileSeparator]}>|</Text>
              )}
            </React.Fragment>
          ))}
        </View>

        {/* Language Selector */}
        <View style={[styles.languageContainer, isTablet && styles.tabletLanguage, isMobile && styles.mobileLanguage]}>
          {languages.map((lang, index) => (
            <React.Fragment key={lang}>
              <TouchableOpacity
                style={styles.languageButton}
                onPress={() => handleLanguageChange(lang)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.languageText,
                  selectedLanguage === lang && styles.selectedLanguage,
                  isMobile && styles.mobileLanguageText
                ]}>
                  {lang}
                </Text>
              </TouchableOpacity>
              {index < languages.length - 1 && (
                <Text style={[styles.separator, isMobile && styles.mobileSeparator]}>|</Text>
              )}
            </React.Fragment>
          ))}
        </View>

        {/* Admin Email and Copyright */}
        <View style={[styles.bottomContainer, isTablet && styles.tabletBottom, isMobile && styles.mobileBottom]}>
          <TouchableOpacity 
            style={styles.emailContainer}
            onPress={() => {
              // Handle email contact
              console.log('Contact admin@yooyland.com');
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.email, isMobile && styles.mobileEmail]}>
              admin@yooyland.com
            </Text>
          </TouchableOpacity>
          <Text style={[styles.copyright, isMobile && styles.mobileCopyright]}>
            © 2025 YooY Land · All Rights Reserved
          </Text>
        </View>

      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0C0C0C',
    borderTopWidth: 1,
    borderTopColor: '#FFD700',
    paddingTop: 20,
    paddingBottom: 100, // Increased bottom padding to 100px
    paddingHorizontal: 20,
    minHeight: 200,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandLine: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFD700',
    textAlign: 'center',
    marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  appSummaryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    width: '100%',
    position: 'relative',
  },
  appSummaryTextContainer: {
    flex: 1,
    alignItems: 'flex-start',
    zIndex: 2,
  },
  appSummaryImageContainer: {
    position: 'absolute',
    top: 10,
    right: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  yooyImage: {
    width: 180,
    height: undefined, // Let height be calculated automatically to maintain aspect ratio
  },
  appSummaryItem: {
    fontSize: 14,
    color: '#FFFFFF',
    textAlign: 'left',
    marginBottom: 2,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  appSummaryTagline: {
    fontSize: 14,
    color: '#FFFFFF',
    textAlign: 'left',
    marginTop: 4,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  navigationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  navLink: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  navText: {
    fontSize: 12,
    color: '#FFD700',
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  separator: {
    fontSize: 12,
    color: '#FFD700',
    opacity: 0.6,
    marginHorizontal: 4,
  },
  languageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  languageButton: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  languageText: {
    fontSize: 11,
    color: '#FFD700',
    opacity: 0.7,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  selectedLanguage: {
    opacity: 1,
    fontWeight: 'bold',
  },
  bottomContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyright: {
    fontSize: 10,
    color: '#FFD700',
    opacity: 0.6,
    textAlign: 'center',
    marginBottom: 4,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  emailContainer: {
    paddingVertical: 2,
  },
  email: {
    fontSize: 10,
    color: '#FFD700',
    opacity: 0.8,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  
  // Tablet styles
  tabletContent: {
    maxWidth: 1200,
    alignSelf: 'center',
  },
  tabletBrandLine: {
    fontSize: 20,
  },
  tabletAppSummaryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tabletAppSummaryTextContainer: {
    flex: 1,
    alignItems: 'center',
    zIndex: 2,
  },
  tabletAppSummaryImageContainer: {
    position: 'absolute',
    top: 10,
    right: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  tabletYooyImage: {
    width: 180,
    height: undefined, // Let height be calculated automatically to maintain aspect ratio
  },
  tabletAppSummaryItem: {
    fontSize: 16,
    textAlign: 'center',
  },
  tabletAppSummaryTagline: {
    fontSize: 16,
    textAlign: 'center',
  },
  tabletNavigation: {
    marginBottom: 16,
  },
  tabletLanguage: {
    marginBottom: 16,
  },
  tabletBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  
  // Mobile styles
  mobileContent: {
    paddingHorizontal: 10,
  },
  mobileBrandLine: {
    fontSize: 16,
    lineHeight: 22,
  },
  mobileAppSummaryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    position: 'relative',
  },
  mobileAppSummaryTextContainer: {
    flex: 1,
    alignItems: 'flex-start',
    zIndex: 2,
  },
  mobileAppSummaryImageContainer: {
    position: 'absolute',
    top: 10,
    right: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  mobileYooyImage: {
    width: 180,
    height: undefined, // Let height be calculated automatically to maintain aspect ratio
  },
  mobileAppSummaryItem: {
    fontSize: 12,
    lineHeight: 18,
  },
  mobileAppSummaryTagline: {
    fontSize: 12,
    lineHeight: 18,
  },
  mobileNavigation: {
    marginBottom: 10,
  },
  mobileNavText: {
    fontSize: 11,
  },
  mobileSeparator: {
    fontSize: 10,
    marginHorizontal: 3,
  },
  mobileLanguage: {
    marginBottom: 10,
  },
  mobileLanguageText: {
    fontSize: 10,
  },
  mobileBottom: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  mobileCopyright: {
    fontSize: 9,
    marginBottom: 2,
  },
  mobileEmail: {
    fontSize: 9,
  },
});

export default Footer;
