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
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { KeyboardAvoidingView, Platform, Keyboard, useWindowDimensions } from 'react-native';
import { setAppStartTime, logAppStartupTime } from '@/lib/perfTimer';

// Mark app start time immediately
setAppStartTime();

import { LoadingOverlay } from '@/components/loading-overlay';
import AppUpdateGate from '@/src/components/AppUpdateGate';
import { REMOTE_EXPLORERS_URL } from '@/config/app';
import { loadExplorersFromRemote } from '@/config/explorers';
import { PreferencesProvider, usePreferences } from '@/contexts/PreferencesContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useFonts } from 'expo-font';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { ensureAuthedUid, firebaseAuth, firestore } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { openInternalAppLink, PENDING_DEEPLINK_KEY } from '@/src/features/chatv2/core/openInternalAppLink';
import { ASYNC_INSTALL_REFERRER_UID_KEY } from '@/lib/internalYoyLedger';
import { useNotificationStore } from '@/src/features/chat/store/notification.store';
import * as SecureStore from 'expo-secure-store';
import * as ExpoLinking from 'expo-linking';
import * as FileSystem from 'expo-file-system/legacy';
import * as ScreenCapture from 'expo-screen-capture';
import { usePlayInAppUpdates } from '@/src/hooks/usePlayInAppUpdates';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded] = useFonts({});
  // 웹 정적 빌드에서 useFonts가 완료되지 않으면 LoadingOverlay가 스택을 가리며 첫 화면이 멈춘 것처럼 보임
  const isReady = fontsLoaded || Platform.OS === 'web';
  /** Android: Play 스토어 인앱 업데이트 자동 확인(릴리스 빌드만) */
  usePlayInAppUpdates();
  const insetsFromCtx = React.useContext(SafeAreaInsetsContext as any) as { top: number; bottom: number; left: number; right: number } | null;
  const insets = insetsFromCtx || { top: 0, bottom: 0, left: 0, right: 0 };
  const pathname = usePathname();
  const needSafePadding = !/\/\(tabs\)\/dashboard(?:\/|$)/i.test(String(pathname || ''));
  const win = useWindowDimensions();
  const webIsDesktop = Platform.OS === 'web' && Number(win?.width || 0) >= 720;

  // Hard-block legacy chat tree (/chat/*): always keep user on v2.
  useEffect(() => {
    try {
      const p = String(pathname || '');
      if (/^\/chat(\/|$)/i.test(p)) {
        router.replace('/chatv2/rooms');
      }
    } catch {}
  }, [pathname]);
  
  // 앱 시작 시 스크린 캡처 허용 (이전에 막힌 상태가 남아있을 수 있음)
  useEffect(() => {
    (async () => {
      try {
        await ScreenCapture.allowScreenCaptureAsync();
      } catch {}
    })();
  }, []);

  // 앱 시작 시 채팅 클라이언트 캐시 정리 (고스트 방 방지, DB와 동기화)
  useEffect(() => {
    (async () => {
      try {
        await AsyncStorage.multiRemove(['chatCache', 'roomCache', 'messageCache']);
      } catch {}
    })();
  }, []);

  // Force chat engine version to v2 globally.
  useEffect(() => {
    (async () => {
      try {
        await AsyncStorage.setItem('chatVersion', 'v2');
        await AsyncStorage.setItem('chatEngine', 'v2');
      } catch {}
      try {
        (globalThis as any).__YY_CHAT_VERSION__ = 'v2';
      } catch {}
    })();
  }, []);
  
  useEffect(() => {
    // 전역 예외 핸들러: 릴리즈에서 앱이 즉시 종료되는 것을 방지
    try {
      const g: any = globalThis as any;
      // 일부 서드파티가 global.React를 참조하는 경우가 있어 보호용으로 주입
      try {
        if (!g.React) {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          g.React = require('react');
        }
      } catch {}
      const handler = (e: any, isFatal?: boolean) => {
        try {
          const msg = String(e?.message || e);
          console.log('GlobalError', msg, { isFatal });
          // 파일로도 기록해 디바이스에서 수집 가능하게
          const line = `[${new Date().toISOString()}] ${isFatal ? 'FATAL' : 'ERROR'} ${msg}\n${String(e?.stack || '')}\n\n`;
          (async () => {
            try {
              const base = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || null;
              if (base) {
                const p = base + 'rn-error.txt';
                // append:true 는 최신 SDK에서 options 대신 두 번째 매개변수에 지원되지 않을 수 있어 try-catch로 처리
                try {
                  await (FileSystem as any).writeAsStringAsync(p, line, { encoding: (FileSystem as any).EncodingType?.UTF8, append: true });
                } catch {
                  // 구버전 호환: append 미지원 시 기존 읽기 후 덮어쓰기
                  let prev = '';
                  try { prev = await (FileSystem as any).readAsStringAsync(p); } catch {}
                  await (FileSystem as any).writeAsStringAsync(p, prev + line);
                }
              }
            } catch {}
          })();
        } catch {}
      };
      if (g?.ErrorUtils?.setGlobalHandler) g.ErrorUtils.setGlobalHandler(handler);
      // 웹 환경/unhandled promise
      try { (window as any).addEventListener?.('unhandledrejection', (ev: any) => { try { console.log('UnhandledRejection', ev?.reason); } catch {} }); } catch {}
    } catch {}
    // 초기 구동 속도 개선: 원격 탐색기 로드는 유휴 시간에 지연 실행
    const idle = (cb: () => void) => {
      try { (window as any).requestIdleCallback ? (window as any).requestIdleCallback(cb, { timeout: 2000 }) : setTimeout(cb, 0); } catch { setTimeout(cb, 0); }
    };
    idle(() => { void loadExplorersFromRemote(REMOTE_EXPLORERS_URL); });
    // 웹에서 Firestore/Storage 권한 에러 방지: 자동 익명 로그인 보장
    // 웹 전용: Storage 권한을 위해 자동 익명 로그인 허용.
    // 네이티브(안드로이드/iOS)에서는 사용자 로그인 플로우를 방해하므로 호출하지 않음.
    if (typeof window !== 'undefined') {
      idle(() => { void ensureAuthedUid().catch(()=>{}); });
    }
    // Android 시스템 내비게이션 바/버튼 색상 설정 (블랙 배경 + 라이트 아이콘) — 웹에서는 API 없음
    if (Platform.OS === 'android') {
      (async () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const NavigationBar = require('expo-navigation-bar');
          await NavigationBar.setBackgroundColorAsync('#000000');
          await NavigationBar.setButtonStyleAsync('light');
        } catch {}
      })();
    }
    // 성능 문제 완화: 초기 구동 시 대량 권한 요청을 수행하지 않음(각 기능 진입 시 개별 요청)
    // (기존 코드 비활성화; 필요 시 기능 화면에서 onPress 시점에 요청)
    
    // Performance timing: initial layout effect complete
    logAppStartupTime('_layout useEffect complete');
  }, []);

  // 딥링크: 채팅 초대(https/yooy/yooyland) + 기프트 claim + 기존 pay/gift/card/invite
  useEffect(() => {
    const handle = async (url: string | null | undefined) => {
      try {
        if (!url) return;
        const internal = await openInternalAppLink(String(url));
        if (internal) return;

        const parsed = ExpoLinking.parse(url);
        const path = String((parsed as any)?.path || (parsed as any)?.hostname || '').toLowerCase();
        const qp: any = (parsed as any)?.queryParams || {};
        console.log('[DeepLink] handle:', url, 'path:', path, 'qp:', qp);

        const refRaw = qp?.ref ?? qp?.referrer ?? qp?.inviter;
        const refStr = String(Array.isArray(refRaw) ? refRaw[0] ?? '' : refRaw ?? '')
          .trim();
        if (refStr.length >= 8) {
          try {
            await AsyncStorage.setItem(ASYNC_INSTALL_REFERRER_UID_KEY, refStr);
          } catch {}
        }

        // 1) yooy://pay?addr=...&sym=...&amt=... → 지갑 보내기 화면
        if (path.includes('pay') && qp?.addr) {
          const payData = JSON.stringify({ addr: qp.addr, sym: qp.sym || '', amt: qp.amt || '' });
          await AsyncStorage.setItem('@deeplink_pay', payData);
          router.push({ pathname: '/(tabs)/wallet', params: { tab: 'send', deeplink: 'pay' } });
          return;
        }

        // 2) yooy://gift?code=... → 기프트 수령 화면
        if (path.includes('gift') && (qp?.code || qp?.id)) {
          const giftData = JSON.stringify({ code: qp.code || qp.id || '' });
          await AsyncStorage.setItem('@deeplink_gift', giftData);
          router.push({ pathname: '/wallet/gifts', params: { deeplink: 'gift' } });
          return;
        }

        // 3) yooy://card?... → 명함(친구 추가) 화면
        if (path.includes('card')) {
          const raw = url;
          await AsyncStorage.setItem('@deeplink_card_raw', String(raw));
          router.push({ pathname: '/chatv2/qr', params: { deeplink: 'card' } });
          return;
        }

        // 4) yooy://invite?room=ROOM_ID&code=XXXX → 채팅방 이동
        if (path.includes('invite') && qp?.room) {
          const roomId = String(qp.room);
          router.push({ pathname: '/chatv2/room', params: { id: roomId } } as any);
          return;
        }
      } catch (e) { console.warn('[DeepLink] error:', e); }
    };
    (async () => {
      try { await handle(await ExpoLinking.getInitialURL()); } catch {}
    })();
    const sub = ExpoLinking.addEventListener('url', (e: any) => {
      void handle(e?.url);
    });
    const unsubAuth = onAuthStateChanged(firebaseAuth, async (user) => {
      try {
        if (!user || (user as any).isAnonymous) return;
        const pending = await AsyncStorage.getItem(PENDING_DEEPLINK_KEY);
        if (!pending) return;
        await AsyncStorage.removeItem(PENDING_DEEPLINK_KEY);
        await handle(pending);
      } catch {}
    });
    return () => {
      try { sub.remove(); } catch {}
      try { unsubAuth(); } catch {}
    };
  }, []);

  // 전역 키보드 높이 감지 제거: Android는 windowSoftInputMode=adjustResize에 맡기고,
  // iOS는 KeyboardAvoidingView(padding)만 사용한다. 잔여 bottom padding으로 인한 검은 영역 방지.

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <PreferencesProvider>
        <AppShell
          isReady={isReady}
          needSafePadding={needSafePadding}
          insetsTop={insets.top}
          insetsBottom={insets.bottom}
          webIsDesktop={webIsDesktop}
        />
      </PreferencesProvider>
    </ThemeProvider>
  );
}

function AppShell({
  isReady,
  needSafePadding,
  insetsTop,
  insetsBottom,
  webIsDesktop,
}: {
  isReady: boolean;
  needSafePadding: boolean;
  insetsTop: number;
  insetsBottom: number;
  webIsDesktop: boolean;
}) {
  const { webLayoutMode, webLayoutPercent } = usePreferences();
  const pathname = usePathname();

  const usePhoneFrame = Platform.OS === 'web' && webIsDesktop && webLayoutMode === 'phone';
  const useCustomFrame = Platform.OS === 'web' && webIsDesktop && webLayoutMode === 'custom' && Number(webLayoutPercent) >= 30 && Number(webLayoutPercent) < 100;
  const frameWidth = usePhoneFrame ? 480 : (useCustomFrame ? (`${Math.floor(Number(webLayoutPercent))}vw` as any) : ('100%' as any));
  // iOS 채팅방 화면은 내부에서 KeyboardAvoidingView를 별도로 사용함 → 전역 KAV까지 켜면 이중 패딩으로 "하얀 공간"이 생김
  const disableGlobalKavForRoute = Platform.OS === 'ios' && /^\/chatv2\/room(?:\/|$)/i.test(String(pathname || ''));

  return (
    <AuthProvider>
      <MarketProvider>
        <TransactionProvider>
          <WalletProvider>
            <QuickActionsProvider>
              <WalletConnectProvider>
                <AppErrorBoundary>
                  <NotificationSync />
                  <AppUpdateGate />
                  <LoadingOverlay visible={!isReady} message="Preparing a golden experience..." />
                  {/* 전역 키보드 회피: Android는 adjustResize, iOS만 padding 사용 */}
                  <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    behavior={Platform.OS === 'ios' && !disableGlobalKavForRoute ? 'padding' : undefined}
                    // iOS에서만 상단바 높이만큼 오프셋
                    keyboardVerticalOffset={Platform.OS === 'ios' && !disableGlobalKavForRoute ? ((needSafePadding ? insetsTop : 0) + 56) : 0}
                  >
                    <View style={{ flex: 1, backgroundColor: '#000000' }}>
                      <View
                        style={{
                          flex: 1,
                          alignSelf: 'stretch',
                          alignItems: (usePhoneFrame || useCustomFrame) ? 'center' : 'stretch',
                          justifyContent: 'flex-start',
                        }}
                      >
                        <View
                          style={{
                            flex: 1,
                            width: frameWidth,
                            maxWidth: frameWidth,
                            borderLeftWidth: (usePhoneFrame || useCustomFrame) ? 1 : 0,
                            borderRightWidth: (usePhoneFrame || useCustomFrame) ? 1 : 0,
                            borderColor: (usePhoneFrame || useCustomFrame) ? '#2a2418' : 'transparent',
                            backgroundColor: '#0C0C0C',
                            paddingTop: needSafePadding ? insetsTop : 0,
                            paddingBottom: needSafePadding ? insetsBottom : 0,
                          }}
                        >
                          <Stack screenOptions={{ headerShown: false }}>
                            <Stack.Screen name="(auth)" />
                            <Stack.Screen name="(onboarding)" />
                            <Stack.Screen name="(tabs)" />
                            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal', headerShown: true }} />
                          </Stack>
                          <RequireAuthGate />
                          <WalletGate />
                          <LanguageCurrencyGate />
                        </View>
                      </View>
                    </View>
                  </KeyboardAvoidingView>
                  <StatusBar style="light" backgroundColor="#000000" />
                </AppErrorBoundary>
              </WalletConnectProvider>
            </QuickActionsProvider>
          </WalletProvider>
        </TransactionProvider>
      </MarketProvider>
    </AuthProvider>
  );
}

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; err?: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, err: null };
  }
  static getDerivedStateFromError(_: any) {
    return { hasError: true };
  }
  componentDidCatch(error: any, info: any) {
    try {
      console.log('ErrorBoundary', String(error?.message||error), info);
      (globalThis as any).__lastRootError = {
        message: String(error?.message || error),
        stack: String(error?.stack || ''),
        info: String(info?.componentStack || '')
      };
    } catch {}
    try {
      this.setState({ err: error });
    } catch {}
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex:1, backgroundColor:'#000', alignItems:'center', justifyContent:'center', padding:16 }}>
          <Text style={{ color:'#FFF', fontWeight:'800', fontSize:16, marginBottom:10 }}>예상치 못한 오류가 발생했습니다</Text>
          {!!(this.state as any)?.err?.message && (
            <Text style={{ color:'#AAA', fontSize:12, textAlign:'center', marginBottom:12 }} numberOfLines={5}>
              {String((this.state as any)?.err?.message || '')}
            </Text>
          )}
          <View style={{ flexDirection:'row', gap:10 }}>
            <TouchableOpacity onPress={()=> { try { this.setState({ hasError: false, err: null }); } catch {} }} style={{ paddingHorizontal:14, paddingVertical:10, borderRadius:8, backgroundColor:'#FFD700' }}>
              <Text style={{ color:'#111', fontWeight:'900' }}>계속</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={()=> { try { router.replace('/(tabs)/dashboard'); this.setState({ hasError:false, err:null }); } catch {} }} style={{ paddingHorizontal:14, paddingVertical:10, borderRadius:8, backgroundColor:'#1F1F1F', borderWidth:1, borderColor:'#333' }}>
              <Text style={{ color:'#FFD700', fontWeight:'900' }}>대시보드</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }
    return this.props.children as any;
  }
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
        const inSetup = p.includes('/(onboarding)/wallet-setup') || p.includes('/wallet-setup');
        const inAuth =
          p.startsWith('/(auth)') ||
          p === '/login' || p.startsWith('/login/') ||
          p === '/register' || p.startsWith('/register/') ||
          p === '/forgot' || p.startsWith('/forgot/');
        // 지갑 미설정: 인증 화면과 온보딩 제외한 모든 화면에서 강제 온보딩
        if (!isSetup && !inSetup && !inAuth) {
          router.replace('/(onboarding)/wallet-setup');
        }
      } catch {}
      setChecked(true);
    })();
  }, [pathname, checked]);
  return null as any;
}

// Firestore users/{uid}/notifications 구독 → 로컬 알림 스토어에 병합 (방 초대 등). 로그인 후 uid가 바뀔 때마다 재구독.
function NotificationSync() {
  const [uid, setUid] = React.useState<string | null>(() => firebaseAuth.currentUser?.uid || null);
  React.useEffect(() => {
    const { onAuthStateChanged } = require('firebase/auth');
    const unsubAuth = onAuthStateChanged(firebaseAuth, (user: any) => {
      setUid(user?.uid || null);
    });
    return () => { try { unsubAuth(); } catch {} };
  }, []);
  const unsubRef = React.useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!uid) {
      try { unsubRef.current?.(); unsubRef.current = null; } catch {};
      return;
    }
    (async () => {
      try {
        const { collection, onSnapshot } = await import('firebase/firestore');
        unsubRef.current = onSnapshot(collection(firestore, 'users', uid, 'notifications'), (snap) => {
          snap.docChanges().forEach((change) => {
            if (change.type !== 'added') return;
            const doc = change.doc;
            const d = doc.data() || {};
            const ts = d.timestamp;
            const timestamp = typeof ts?.toMillis === 'function' ? ts.toMillis() : (typeof ts === 'number' ? ts : Date.now());
            useNotificationStore.getState().addNotification({
              type: (d.type === 'room_invite' ? 'room_invite' : 'system') as any,
              title: String(d.title || ''),
              content: String(d.content || ''),
              senderId: d.senderId,
              senderName: d.senderName,
              serverId: doc.id,
              roomId: d.roomId,
              timestamp,
            } as any);
          });
        });
      } catch {}
    })();
    return () => { try { unsubRef.current?.(); unsubRef.current = null; } catch {} };
  }, [uid]);
  return null;
}

// 인증 게이트: 정상 로그인(accessToken) 없으면 로그인 화면으로 유도
function RequireAuthGate() {
  const { isAuthenticated: authed, isLoading: authLoading } = require('@/contexts/AuthContext').useAuth();
  const p = usePathname();
  useEffect(() => {
    try {
      if (authLoading) return;
      const path = String(p || '');
      // expo-router의 usePathname()은 그룹명 (auth)을 포함하지 않는 경우가 있어,
      // 로그인/회원가입/비번찾기 화면은 모두 auth로 간주해 게이트 리다이렉트를 막는다.
      const inAuth =
        path.startsWith('/(auth)') ||
        path === '/login' || path.startsWith('/login/') ||
        path === '/register' || path.startsWith('/register/') ||
        path === '/forgot' || path.startsWith('/forgot/') ||
        path.includes('/(auth)/');
      if (!authed && !inAuth) {
        console.log('[YY_LOGIN_FLOW] RequireAuthGate -> not authed, redirect to /(auth)/login from', path);
        router.replace('/(auth)/login');
      } else {
        console.log('[YY_LOGIN_FLOW] RequireAuthGate -> pass', { authed, path });
      }
    } catch {}
  }, [p, authed, authLoading]);
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
