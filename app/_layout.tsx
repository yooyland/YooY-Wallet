import { AuthProvider } from '@/contexts/AuthContext';
import { MarketProvider } from '@/contexts/MarketContext';
import { QuickActionsProvider } from '@/contexts/QuickActionsContext';
import { WalletConnectProvider } from '@/contexts/WalletConnectContext';
import { TransactionProvider } from '@/contexts/TransactionContext';
import { WalletProvider } from '@/contexts/WalletContext';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, usePathname, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import 'react-native-reanimated';
import '../app/global.css';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView, Platform } from 'react-native';
import * as ReactNative from 'react-native';

import { LoadingOverlay } from '@/components/loading-overlay';
import { REMOTE_EXPLORERS_URL } from '@/config/app';
import { loadExplorersFromRemote } from '@/config/explorers';
import { PreferencesProvider, usePreferences } from '@/contexts/PreferencesContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useFonts } from 'expo-font';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { ensureAuthedUid } from '@/lib/firebase';
import * as SecureStore from 'expo-secure-store';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded] = useFonts({});
  const isReady = fontsLoaded;
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const needSafePadding = !/\/\(tabs\)\/dashboard(?:\/|$)/i.test(String(pathname || ''));
  useEffect(() => {
    // 초기 구동 속도 개선: 원격 탐색기 로드는 유휴 시간에 지연 실행
    const idle = (cb: () => void) => {
      try { (window as any).requestIdleCallback ? (window as any).requestIdleCallback(cb, { timeout: 2000 }) : setTimeout(cb, 0); } catch { setTimeout(cb, 0); }
    };
    idle(() => { void loadExplorersFromRemote(REMOTE_EXPLORERS_URL); });
    // 웹에서 Firestore/Storage 권한 에러 방지: 자동 익명 로그인 보장
    idle(() => { void ensureAuthedUid().catch(()=>{}); });
    // Android 시스템 내비게이션 바/버튼 색상 설정 (블랙 배경 + 라이트 아이콘)
    (async () => {
      try {
        // 동적 로딩: 패키지가 없으면 무시 (웹/개발 환경 호환)
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const NavigationBar = require('expo-navigation-bar');
        await NavigationBar.setBackgroundColorAsync('#000000');
        await NavigationBar.setButtonStyleAsync('light');
      } catch {}
    })();
    // 최초 실행 시 주요 권한을 일괄 요청(안드로이드): 카메라/미디어/사진/연락처/위치
    (async () => {
      try {
        const asked = await AsyncStorage.getItem('perm.asked.v1');
        if (asked) return;
        // 카메라
        try { const m = require('expo-camera'); await m.Camera.requestCameraPermissionsAsync?.(); } catch {}
        // 미디어 라이브러리(저장)
        try { const ml = require('expo-media-library'); await ml.requestPermissionsAsync?.(); } catch {}
        // 이미지 피커(READ_MEDIA_IMAGES/PHOTOS)
        try { const ip = require('expo-image-picker'); await ip.requestMediaLibraryPermissionsAsync?.(); } catch {}
        // 연락처
        try { const c = require('expo-contacts'); await c.requestPermissionsAsync?.(); } catch {}
        // 위치
        try { const loc = require('expo-location'); await loc.requestForegroundPermissionsAsync?.(); } catch {}
        await AsyncStorage.setItem('perm.asked.v1','1');
      } catch {}
    })();
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <PreferencesProvider>
        <AuthProvider>
          <MarketProvider>
            <TransactionProvider>
              <WalletProvider>
                <QuickActionsProvider>
                  <WalletConnectProvider>
                  <LoadingOverlay visible={!isReady} message="Preparing a golden experience..." />
                  {/* 전역 키보드 회피: 안드로이드 height, iOS padding */}
                  <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    // Android는 windowSoftInputMode=resize 사용, iOS만 padding 적용
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    // iOS에서만 상단바 높이만큼 오프셋
                    keyboardVerticalOffset={Platform.OS === 'ios' ? ( (needSafePadding ? insets.top : 0) + 56 ) : 0}
                  >
                    {/* 대시보드 이외 모든 페이지에 안전영역 패딩 적용 */}
                    <View style={{ flex: 1, paddingTop: needSafePadding ? insets.top : 0, paddingBottom: needSafePadding ? insets.bottom : 0, backgroundColor: '#0C0C0C' }}>
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="(auth)" />
                    <Stack.Screen name="(onboarding)" />
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal', headerShown: true }} />
                  </Stack>
                  <WalletGate />
                  <LanguageCurrencyGate />
                    </View>
                  </KeyboardAvoidingView>
                  {/* 블랙 배경에 가독성 확보를 위해 상태바 아이콘/텍스트를 화이트로 */}
                  <StatusBar style="light" backgroundColor="#000000" />
                  </WalletConnectProvider>
                </QuickActionsProvider>
              </WalletProvider>
            </TransactionProvider>
          </MarketProvider>
        </AuthProvider>
      </PreferencesProvider>
    </ThemeProvider>
  );
}

function WalletGate() {
  const pathname = usePathname();
  const [checked, setChecked] = React.useState(false);
  useEffect(() => {
    (async () => {
      if (checked) return;
      try {
        const mn = await SecureStore.getItemAsync('WALLET_MNEMONIC');
        const addr = await SecureStore.getItemAsync('WALLET_ADDRESS');
        const isSetup = !!(mn && addr);
        const p = String(pathname || '');
        const inSetup = p.includes('/(onboarding)/wallet-setup');
        // 지갑 미설정 시에도 채팅/투두는 접근 허용
        const isSoftAllowed = /\/chat(\/|$)|\/\(tabs\)\/todo/i.test(p);
        // 초기 진입 또는 지갑 관련 탭에서만 온보딩으로 유도
        const requiresWallet = /\/\(tabs\)\/(wallet|dashboard|payments|market|exchange)/i.test(p) || p === '/' || p === '';
        if (!isSetup && !inSetup && requiresWallet && !isSoftAllowed) {
          router.replace('/(onboarding)/wallet-setup');
        }
      } catch {}
      setChecked(true);
    })();
  }, [pathname, checked]);
  return null as any;
}

function LanguageCurrencyGate() {
  const { language, currency, setLanguage, setCurrency, isLoading } = usePreferences();
  const [visible, setVisible] = useState(false);
  const [langSel, setLangSel] = useState<'en'|'ko'|'ja'|'zh'>(language);
  const [curSel, setCurSel] = useState<'USD'|'KRW'|'JPY'|'CNY'|'EUR'>(currency);

  useEffect(() => {
    (async () => {
      if (isLoading) return;
      const inited = await AsyncStorage.getItem('prefs.initialized');
      if (!inited) setVisible(true);
    })();
  }, [isLoading]);

  const save = async () => {
    await setLanguage(langSel);
    await setCurrency(curSel);
    await AsyncStorage.setItem('prefs.initialized', 'true');
    setVisible(false);
  };

  if (!visible) return null as any;
  return (
    <Modal visible transparent animationType="fade">
      <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.6)', alignItems:'center', justifyContent:'center', padding: 16 }}>
        <View style={{ backgroundColor:'#0D0D0D', borderRadius: 16, padding: 16, width: 360, maxWidth: '100%', borderWidth:1, borderColor:'#1A1A1A' }}>
          <Text style={{ color:'#FFFFFF', fontSize: 18, fontWeight:'700', marginBottom: 12 }}>Welcome</Text>
          <Text style={{ color:'#9CA3AF', marginBottom: 8 }}>Choose your language</Text>
          <View style={{ flexDirection:'row', flexWrap:'wrap', gap: 8, marginBottom: 12 }}>
            {(['en','ko','ja','zh'] as const).map(l => (
              <TouchableOpacity key={l} onPress={()=>setLangSel(l)} style={{ paddingHorizontal: 10, paddingVertical:6, borderRadius:999, borderWidth:1, borderColor: langSel===l? '#FFD700':'#2A2A2A', backgroundColor: langSel===l? '#2A2A2A':'#1A1A1A' }}>
                <Text style={{ color: langSel===l? '#FFD700':'#CFCFCF', fontWeight:'600' }}>{l.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={{ color:'#9CA3AF', marginBottom: 8 }}>Choose your currency</Text>
          <View style={{ flexDirection:'row', flexWrap:'wrap', gap: 8, marginBottom: 16 }}>
            {(['USD','KRW','JPY','CNY','EUR'] as const).map(c => (
              <TouchableOpacity key={c} onPress={()=>setCurSel(c)} style={{ paddingHorizontal: 10, paddingVertical:6, borderRadius:999, borderWidth:1, borderColor: curSel===c? '#FFD700':'#2A2A2A', backgroundColor: curSel===c? '#2A2A2A':'#1A1A1A' }}>
                <Text style={{ color: curSel===c? '#FFD700':'#CFCFCF', fontWeight:'600' }}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ flexDirection:'row', justifyContent:'flex-end', gap: 10 }}>
            <TouchableOpacity onPress={()=>setVisible(false)} style={{ paddingHorizontal: 14, paddingVertical:10, borderRadius: 8, backgroundColor:'#1A1A1A', borderWidth:1, borderColor:'#2A2A2A' }}>
              <Text style={{ color:'#6B7280' }}>Later</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={save} style={{ paddingHorizontal: 14, paddingVertical:10, borderRadius: 8, backgroundColor:'#FFD700' }}>
              <Text style={{ color:'#0D0D0D', fontWeight:'800' }}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
