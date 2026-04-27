import { ThemedText } from '@/components/themed-text';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAdminRoleByEmail, isAdmin } from '@/constants/admins';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useMarket } from '@/contexts/MarketContext';
import { useWallet } from '@/contexts/WalletContext';
import { useMergedWalletAssets } from '@/contexts/MergedWalletAssetsContext';
import { useMonitorStore } from '@/lib/monitorStore';
import priceManager from '@/lib/priceManager';
import { usePreferences } from '@/contexts/PreferencesContext';
import { formatCurrency, getExchangeRates } from '@/lib/currency';
import { getMockBalancesForUser } from '@/lib/userBalances';
import { BlurView } from 'expo-blur';
import QuickActionsSettings from '@/components/QuickActionsSettings';
import { EXCHANGE_UI_ENABLED } from '@/lib/featureFlags';
import { t } from '@/i18n';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useWalletConnect } from '@/contexts/WalletConnectContext';
import { useTodoStore } from '@/src/features/todo/todo.store';
import * as ScreenCapture from 'expo-screen-capture';
import * as Clipboard from 'expo-clipboard';
import { loadMnemonic } from '@/src/wallet/secure';
import * as FileSystem from 'expo-file-system/legacy';
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
const BOTTOM_BAR_HEIGHT = 50; // matches tab bar height

interface HamburgerMenuProps {
  visible: boolean;
  onClose: () => void;
  avatarUri?: string | null;
}

export default function HamburgerMenu({ visible, onClose, avatarUri }: HamburgerMenuProps) {
  const { currentUser, signOut } = useAuth();
  const { yoyPriceKRW, yoyPriceUSD } = useMarket();
  const { deleteAllWallets } = useWallet();
  const { language, currency, webLayoutMode, webLayoutPercent } = usePreferences();
  const tr = (ko: string, en: string, ja?: string, zh?: string) => {
    if (language === 'ko') return ko;
    if (language === 'ja') return ja || en;
    if (language === 'zh') return zh || en;
    return en;
  };
  const ti = (key: string, fallback: string) => {
    const v = t(key, language as any);
    return v === key ? fallback : v;
  };
  const wc = (() => { try { return useWalletConnect(); } catch { return null as any; } })();
  const [rates, setRates] = useState<any>(null);
  const [slideAnim] = useState(new Animated.Value(screenWidth));
  const [selectedTab, setSelectedTab] = useState('APP');
  const [signingOut, setSigningOut] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [quickActionsVisible, setQuickActionsVisible] = useState(false);
  const [mnemonicVisible, setMnemonicVisible] = useState(false);
  const [mnemonicText, setMnemonicText] = useState<string>('');
  // 실시간 To-Do 미완료 개수
  const { items: todoItems } = useTodoStore();
  const todoPendingCount = (todoItems || []).filter((i:any) => !i.completed).length;

  // 총자산: 온체인+내부 병합(mergedAssets) — 대시보드/지갑 탭과 동일 소스
  const { mergedAssets } = useMergedWalletAssets();
  const totalUsd = (() => {
    try {
      const arr = Array.isArray(mergedAssets) ? mergedAssets : [];
      return arr.reduce((sum, b: any) => {
        const v = Number(b?.valueUSD || 0);
        return sum + (Number.isFinite(v) ? v : 0);
      }, 0);
    } catch { return 0; }
  })();
  const isUserAdmin = currentUser?.email ? isAdmin(currentUser.email) : false;
  const adminRole = currentUser?.email ? getAdminRoleByEmail(currentUser.email) : null;

  const tabs = [
    { id: 'APP', label: tr('설정', 'Settings', '設定', '设置') },
  ];

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

  const handleSignOut = () => {
    if (signingOut || confirming) return;
    setConfirming(true);
    Alert.alert(
      t('logout', language),
      t('confirmLogout', language) || 'Are you sure you want to log out?',
      [
        { text: t('cancel', language), style: 'cancel', onPress: () => setConfirming(false) },
        { 
          text: t('logout', language), 
          style: 'destructive',
          onPress: async () => {
            try {
              setSigningOut(true);
              await signOut();
              // 채팅 로컬 스토어/프로필 캐시 강제 정리
              try { await AsyncStorage.removeItem('yoo-kakao-rooms-store'); } catch {}
              try { await AsyncStorage.removeItem('yoo-chat-profile-store'); } catch {}
              try { await AsyncStorage.removeItem('yoo-chat-settings-store'); } catch {}
              onClose();
              try { router.replace('/(auth)/login'); } catch {}
            } catch (error) {
              console.error('Sign out error:', error);
              Alert.alert(t('error', language), t('signoutFailed', language) || 'Failed to sign out. Please try again.');
            } finally {
              setSigningOut(false);
              setConfirming(false);
            }
          }
        }
      ]
    );
  };

  type MenuItem = { title: string; icon: string; onPress: () => void; adminOnly?: boolean };
  type MenuSection = { title: string; items: MenuItem[] };

  const getMenuSections = (tab: string): MenuSection[] => {
    const filterAdmin = (items: MenuItem[]) => items.filter(i => !i.adminOnly || isUserAdmin);

    if (tab === 'APP') {
      return [
        { title: t('account', language), items: [
          { title: t('profile', language), icon: '👤', onPress: () => { onClose(); try { router.push('/settings/profile' as any); } catch {} } },
          { title: ti('security', tr('보안', 'Security', 'セキュリティ', '安全')), icon: '🔒', onPress: () => { onClose(); try { router.push('/settings/security' as any); } catch {} } },
          { title: t('notifications', language), icon: '🔔', onPress: () => { onClose(); try { router.push('/settings/notifications' as any); } catch {} } },
        ]},
        { title: ti('wallet', tr('지갑', 'Wallet', 'ウォレット', '钱包')), items: [
          { title: wc?.state?.connected
              ? tr('외부 지갑 ', 'External wallet ', '外部ウォレット ', '外部钱包 ') + `${String(wc?.state?.address||'').slice(0,6)}…${String(wc?.state?.address||'').slice(-4)}`
              : tr('외부 지갑 미연결', 'External wallet disconnected', '外部ウォレット 未接続', '外部钱包 未连接'),
            icon: wc?.state?.connected ? '🟢' : '⚪',
            onPress: () => { onClose(); try { router.push('/settings/walletconnect' as any); } catch {} }
          },
          { title: wc?.state?.connected ? tr('연결 해제', 'Disconnect', '解除', '断开') : tr('연결', 'Connect', '接続', '连接'), icon: '🔗', onPress: async () => { try { if (wc) { if (wc.state.connected) { await wc.disconnect(); } else { await wc.connect(); } } } catch {} } },
          { title: ti('wallet', tr('지갑', 'Wallet', 'ウォレット', '钱包')), icon: '💼', onPress: () => { onClose(); router.push('/(tabs)/wallet'); } },
          { title: ti('orderHistory', tr('주문내역', 'Order history', '注文履歴', '订单记录')), icon: '🧾', onPress: () => { onClose(); try { router.push('/(tabs)/wallet?tab=orders' as any); } catch {} } },
          { title: tr('니모닉 보기', 'View mnemonic', 'ニーモニック表示', '查看助记词'), icon: '🧩', onPress: async () => {
              try {
                Alert.alert(
                  tr('보안 경고', 'Security warning', 'セキュリティ警告', '安全警告'),
                  tr(
                    '니모닉은 지갑의 모든 권한입니다. 주변에 다른 사람이 없고 화면 캡처가 차단된 상태에서만 확인하세요.',
                    'Your mnemonic grants full wallet access. View it privately with screen capture blocked.',
                    'ニーモニックはウォレットの全権限です。周囲に人がいない状態で、画面キャプチャを無効にして確認してください。',
                    '助记词拥有钱包全部权限。请在私密环境并关闭截屏时查看。'
                  ),
                  [
                    { text: ti('cancel', tr('취소', 'Cancel', 'キャンセル', '取消')), style: 'cancel' },
                    { text: tr('표시', 'Show', '表示', '显示'), style: 'destructive', onPress: async () => {
                        try {
                          await ScreenCapture.preventScreenCaptureAsync();
                        } catch {}
                        const m = await loadMnemonic();
                        if (!m) {
                          Alert.alert(tr('안내', 'Info', '案内', '提示'), tr('로컬에 저장된 니모닉이 없습니다.', 'No mnemonic saved locally.', 'ローカルに保存されたニーモニックがありません。', '本地未保存助记词。'));
                          try { await ScreenCapture.allowScreenCaptureAsync(); } catch {}
                          return;
                        }
                        setMnemonicText(m);
                        setMnemonicVisible(true);
                      } 
                    },
                  ]
                );
              } catch {}
            } 
          },
        ]},
        { title: t('preferences', language), items: [
          { title: `${t('language', language)}: ${language?.toUpperCase?.() || ''}`, icon: '🌐', onPress: () => { onClose(); try { router.push('/settings/language' as any); } catch {} } },
          { title: `${t('currency', language)}: ${currency}`, icon: '💰', onPress: () => { onClose(); try { router.push('/settings/currency' as any); } catch {} } },
          { title: ti('theme', tr('테마', 'Theme', 'テーマ', '主题')), icon: '🎨', onPress: () => { onClose(); try { router.push('/settings/theme' as any); } catch {} } },
          { title: (language === 'ko'
              ? `화면 너비(PC): ${webLayoutMode === 'fluid' ? '브라우저 100%' : (webLayoutMode === 'custom' ? `${webLayoutPercent}%` : '모바일 폭')}`
              : `Layout width: ${webLayoutMode === 'fluid' ? 'Browser 100%' : (webLayoutMode === 'custom' ? `${webLayoutPercent}%` : 'Phone')}`),
            icon: '🖥️',
            onPress: () => { onClose(); try { router.push('/settings/layout' as any); } catch {} }
          },
          { title: t('quickActionsSettings', language), icon: '⚡', onPress: () => { onClose(); try { router.push('/settings/quick-actions' as any); } catch {} } },
          { title: 'WalletConnect', icon: '🔗', onPress: () => { onClose(); try { router.push('/settings/walletconnect' as any); } catch {} } },
          { title: 'Sync Debug', icon: '🛠️', onPress: () => { onClose(); try { router.push('/settings/sync-debug' as any); } catch {} } },
          { title: tr('주소 연결', 'Link Address', 'アドレス連携', '绑定地址'), icon: '🔗', onPress: () => { onClose(); try { router.push('/settings/link-address' as any); } catch {} } },
        ]},
        { title: tr('고객지원', 'Support', 'サポート', '支持'), items: [
          { title: tr('버그 신고', 'Bug report', 'バグ報告', '错误反馈'), icon: '🐞', onPress: () => { onClose(); try { router.push('/support/bug' as any); } catch {} } },
          { title: tr('문의하기', 'Inquiry', 'お問い合わせ', '咨询'), icon: '✉️', onPress: () => { onClose(); try { router.push('/support/inquiry' as any); } catch {} } },
          { title: tr('신고하기', 'Report', '通報', '举报'), icon: '🚨', onPress: () => { onClose(); try { router.push('/support/report' as any); } catch {} } },
          { title: tr('앱 캐시 초기화', 'Clear app cache', 'アプリキャッシュ初期化', '清除应用缓存'), icon: '🧹', onPress: async () => {
              try {
                Alert.alert(
                  tr('확인', 'Confirm', '確認', '确认'),
                  tr('앱 캐시(프로필/잔액 캐시/친구목록 등)를 삭제합니다. 지갑 니모닉/주소는 유지됩니다.', 'This clears app cache (profile/balances/friends). Wallet mnemonic/address will be kept.', 'アプリキャッシュ(プロフィール/残高/友達など)を削除します。ニーモニック/アドレスは保持されます。', '将清除应用缓存(资料/余额/好友等)。助记词/地址会保留。'),
                  [
                  { text: ti('cancel', tr('취소', 'Cancel', 'キャンセル', '取消')), style: 'cancel' },
                  { text: ti('delete', tr('삭제', 'Delete', '削除', '删除')), style: 'destructive', onPress: async () => {
                      try {
                        const keys: string[] = await AsyncStorage.getAllKeys();
                        const uid = (currentUser as any)?.uid || '';
                        const toRemove = keys.filter(k => 
                          k.startsWith('monitor.') ||
                          k.startsWith('user_balances_') ||
                          k.startsWith('yoo-') ||
                          (uid ? k.startsWith(`u:${uid}:`) : false)
                        );
                        if (toRemove.length > 0) {
                          await AsyncStorage.multiRemove(toRemove);
                        }
                        Alert.alert(tr('완료', 'Done', '完了', '完成'), tr('캐시를 삭제했습니다. 앱을 재시작해 주세요.', 'Cache cleared. Please restart the app.', 'キャッシュを削除しました。アプリを再起動してください。', '缓存已清除，请重启应用。'));
                      } catch {
                        Alert.alert(ti('error', tr('오류', 'Error', 'エラー', '错误')), tr('캐시 삭제에 실패했습니다.', 'Failed to clear cache.', 'キャッシュ削除に失敗しました。', '清除缓存失败。'));
                      }
                    } 
                  }
                ]);
              } catch {}
            } 
          },
          { title: tr('오류 로그 내보내기', 'Export error logs', 'エラーログを書き出す', '导出错误日志'), icon: '📤', onPress: async () => {
              try {
                const base = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || null;
                if (!base) {
                  // 디렉터리를 알 수 없는 환경: 최근 전역 오류 객체를 텍스트로 복사 시도
                  try {
                    const last = (globalThis as any).__lastRootError;
                    const txt = last ? (`${String(last?.message||'')}\n${String(last?.stack||'')}\n${String(last?.info||'')}`) : '';
                    if (txt) {
                      await Clipboard.setStringAsync(txt);
                      Alert.alert(tr('복사됨', 'Copied', 'コピーしました', '已复制'), tr('최근 오류 내용을 클립보드에 복사했습니다.', 'Copied recent error to clipboard.', '最近のエラーをクリップボードにコピーしました。', '已复制最近的错误到剪贴板。'));
                      return;
                    }
                  } catch {}
                  Alert.alert(tr('안내', 'Info', '案内', '提示'), tr('로그 파일 경로를 확인할 수 없습니다.\n먼저 오류를 재현한 뒤 다시 시도하세요.', 'Cannot locate log file path.\nReproduce the issue and try again.', 'ログファイルのパスを確認できません。\n一度エラーを再現してから再試行してください。', '无法找到日志文件路径。\n请先复现错误后再试。'));
                  return;
                }
                const p = base + 'rn-error.txt';
                const info = await (FileSystem as any).getInfoAsync(p);
                if (!info.exists || (info.size ?? 0) === 0) { 
                  // 파일이 없으면, 최근 전역 오류 복사 시도
                  try {
                    const last = (globalThis as any).__lastRootError;
                    const txt = last ? (`${String(last?.message||'')}\n${String(last?.stack||'')}\n${String(last?.info||'')}`) : '';
                    if (txt) {
                      await Clipboard.setStringAsync(txt);
                      Alert.alert(tr('복사됨', 'Copied', 'コピーしました', '已复制'), tr('최근 오류 내용을 클립보드에 복사했습니다.', 'Copied recent error to clipboard.', '最近のエラーをクリップボードにコピーしました。', '已复制最近的错误到剪贴板。'));
                      return;
                    }
                  } catch {}
                  Alert.alert(tr('안내', 'Info', '案内', '提示'), tr('오류 로그가 아직 없습니다. 문제가 발생한 후 다시 시도하세요.', 'No error logs yet. Please try again after an error occurs.', 'まだエラーログがありません。問題発生後に再試行してください。', '暂无错误日志，请在发生错误后重试。')); 
                  return; 
                }
                // 동적 로드: expo-sharing 미설치 환경에서도 빌드 실패 방지
                let shared = false;
                try {
                  // eslint-disable-next-line @typescript-eslint/no-var-requires
                  const Sharing = require('expo-sharing');
                  if (await Sharing.isAvailableAsync?.()) {
                    await Sharing.shareAsync?.(p, { mimeType: 'text/plain', dialogTitle: 'rn-error.txt' } as any);
                    shared = true;
                  }
                } catch {}
                if (!shared) {
                  const txt = await (FileSystem as any).readAsStringAsync(p);
                  await Clipboard.setStringAsync(txt);
                  Alert.alert(tr('복사됨', 'Copied', 'コピーしました', '已复制'), tr('오류 로그를 클립보드에 복사했습니다.', 'Copied error log to clipboard.', 'エラーログをクリップボードにコピーしました。', '已复制错误日志到剪贴板。'));
                }
              } catch {
                Alert.alert(ti('error', tr('오류', 'Error', 'エラー', '错误')), tr('로그 내보내기에 실패했습니다.', 'Failed to export logs.', 'ログの書き出しに失敗しました。', '导出日志失败。'));
              }
            } 
          },
          { title: tr('지갑 초기화', 'Reset wallet', 'ウォレット初期化', '重置钱包'), icon: '🗑️', onPress: async () => {
              try {
                Alert.alert(
                  tr('지갑 초기화', 'Reset wallet', 'ウォレット初期化', '重置钱包'),
                  tr('로컬 기기의 니모닉과 주소를 삭제합니다. 복구용 니모닉이 없다면 절대 진행하지 마세요.', 'This deletes the local mnemonic and address. Do not proceed without a recovery phrase.', 'ローカルのニーモニックとアドレスを削除します。復元用ニーモニックがない場合は絶対に進めないでください。', '将删除本地助记词和地址。没有恢复助记词请勿继续。'),
                  [
                  { text: ti('cancel', tr('취소', 'Cancel', 'キャンセル', '取消')), style:'cancel' },
                  { text: ti('delete', tr('삭제', 'Delete', '削除', '删除')), style:'destructive', onPress: async () => {
                      try {
                        const { clearWallet } = await import('@/src/wallet/secure');
                        await clearWallet();
                        const uid = currentUser?.uid;
                        if (uid) {
                          try {
                            await AsyncStorage.removeItem(`me.balances.${uid}`);
                            await AsyncStorage.removeItem(`me.txs.${uid}`);
                            await AsyncStorage.removeItem(`monitor.local.adjustments:${uid}`);
                            await AsyncStorage.removeItem('monitor.lastKnownUid');
                          } catch {}
                        }
                        useMonitorStore.setState({
                          uid: null,
                          addresses: [],
                          balancesMap: {},
                          balancesArray: [],
                          transactions: [],
                          buyPriceMap: {},
                          lastSuccessAt: null,
                          lastError: null,
                        });
                        await deleteAllWallets();
                        Alert.alert(tr('완료', 'Done', '完了', '完成'), tr('지갑을 초기화했습니다. 지갑 설정 화면으로 이동합니다.', 'Wallet reset. Redirecting to wallet setup.', 'ウォレットを初期化しました。ウォレット設定へ移動します。', '钱包已重置，将前往钱包设置。'));
                        onClose();
                        try { router.replace('/(onboarding)/wallet-setup'); } catch {}
                      } catch {
                        Alert.alert(ti('error', tr('오류', 'Error', 'エラー', '错误')), tr('지갑 초기화에 실패했습니다.', 'Failed to reset wallet.', 'ウォレット初期化に失敗しました。', '重置钱包失败。'));
                      }
                    } 
                  }
                ]);
              } catch {}
            } 
          },
          { title: tr('지갑 복원 (니모닉 입력)', 'Restore wallet (enter mnemonic)', 'ウォレット復元（ニーモニック入力）', '恢复钱包（输入助记词）'), icon: '♻️', onPress: () => { onClose(); try { router.replace('/(onboarding)/wallet-setup?tab=import' as any); } catch {} } },
        ]},
        { title: ti('admin', tr('관리자', 'Admin', '管理者', '管理员')), items: filterAdmin([
          { title: tr('관리자 대시보드', 'Admin Dashboard', '管理者ダッシュボード', '管理员仪表盘'), icon: '🛡️', adminOnly: true, onPress: () => { onClose(); try { router.push('/(admin)/dashboard' as any); } catch {} } },
          { title: tr('금고 / 잔고', 'Treasury / Balances', '金庫 / 残高', '金库 / 余额'), icon: '🏦', adminOnly: true, onPress: () => { onClose(); try { router.push('/(admin)/treasury' as any); } catch {} } },
          { title: ti('users', tr('사용자', 'Users', 'ユーザー', '用户')), icon: '👥', adminOnly: true, onPress: () => { onClose(); try { router.push('/(admin)/users' as any); } catch {} } },
          { title: ti('transactions', tr('거래내역', 'Transactions', '取引', '交易')), icon: '🧾', adminOnly: true, onPress: () => { onClose(); try { router.push('/(admin)/transactions' as any); } catch {} } },
          { title: ti('system', tr('시스템', 'System', 'システム', '系统')), icon: '⚙️', adminOnly: true, onPress: () => { onClose(); try { router.push('/(admin)/system' as any); } catch {} } },
        ])},
      ];
    }

    if (tab === 'DEX') {
      return [
        { title: t('trading', language) || 'Trading', items: [
          ...(EXCHANGE_UI_ENABLED
            ? [{ title: t('exchangeTab', language), icon: '📈', onPress: () => { onClose(); router.push('/(tabs)/exchange'); } } as MenuItem]
            : []),
          { title: t('wallet', language) || 'Wallet', icon: '💼', onPress: () => { onClose(); router.push('/(tabs)/wallet'); } },
        ]},
        { title: t('management', language) || 'Management', items: filterAdmin([
          { title: t('notices', language) + ' (' + (t('manage', language) || 'Manage') + ')', icon: '📰', onPress: () => { onClose(); router.push('/exchange/notices'); }, adminOnly: true },
          { title: t('favoritesBackup', language) || 'Favorites Backup', icon: '💾', onPress: () => { onClose(); try { router.push('/(tabs)/backup' as any); } catch {} }, adminOnly: true },
          { title: t('system', language) || 'System', icon: '⚙️', onPress: () => { onClose(); router.push('/(admin)/system'); }, adminOnly: true },
        ])},
      ];
    }

    if (tab === 'CHAT') {
      return [
        { title: t('chat', language), items: [
          { title: t('openChat', language) || 'Open Chat', icon: '💬', onPress: () => { onClose(); router.push('/(tabs)/chat'); } },
        ]},
        { title: t('settings', language) || 'Settings', items: [
          { title: t('presenceTyping', language) || 'Presence/Typing', icon: '👀', onPress: () => { onClose(); try { router.push('/settings/chat-settings' as any); } catch {} } },
        ]},
      ];
    }

    if (tab === 'TODO') {
      return [
        { title: t('tasks', language) || 'Tasks', items: [
          { title: `${t('todo', language) || 'To-Do'} (${todoPendingCount})`, icon: '✅', onPress: () => { onClose(); router.push('/(tabs)/todo'); } },
        ]},
        { title: t('settings', language) || 'Settings', items: [
          { title: t('preferences', language), icon: '⚙️', onPress: () => { onClose(); try { router.push('/settings/todo-settings' as any); } catch {} } },
        ]},
      ];
    }

    if (tab === 'SHOP') {
      return [
        { title: t('shop', language), items: [
          { title: t('comingSoon', language), icon: '🛍️', onPress: () => { onClose(); } },
        ]},
      ];
    }

    return [];
  };

  // Compute menu sections for current tab
  const sectionsForRender: MenuSection[] = (() => {
    const base = getMenuSections(selectedTab);
    if (!isUserAdmin) return base;
    return [
      ...base,
      {
        title: ti('admin', tr('관리자', 'Admin', '管理者', '管理员')),
        items: [
          { title: t('dashboard', language) || 'Dashboard', icon: '📊', onPress: () => { onClose(); try { router.push('/(admin)/dashboard' as any); } catch {} } },
          { title: tr('게시판', 'Boards', '掲示板', '公告板'), icon: '🗂️', onPress: () => { onClose(); try { router.push('/(admin)/boards' as any); } catch {} } },
          { title: t('users', language) || 'Users', icon: '👥', onPress: () => { onClose(); try { router.push('/(admin)/users' as any); } catch {} } },
          { title: t('transactions', language) || 'Transactions', icon: '💸', onPress: () => { onClose(); try { router.push('/(admin)/transactions' as any); } catch {} } },
          { title: t('reports', language) || 'Reports', icon: '📈', onPress: () => { onClose(); try { router.push('/(admin)/reports' as any); } catch {} } },
          ...(adminRole === 'super_admin' ? [
            { title: t('system', language) || 'System', icon: '⚙️', onPress: () => { onClose(); try { router.push('/system' as any); } catch {} } }
          ] : []),
        ]
      }
    ];
  })();

  // 아바타: 프로필 저장된 사진 로드(동일 계정으로 표시)
  const [savedAvatar, setSavedAvatar] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const uid = (currentUser as any)?.uid || null;
        if (!uid) return;
        const key = `u:${uid}:profile.photoUri`;
        const raw = await AsyncStorage.getItem(key);
        if (raw) setSavedAvatar(raw);
      } catch {}
    })();
  }, [currentUser?.email]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <BlurView style={styles.backdrop} intensity={20} tint="dark">
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </BlurView>
        <Animated.View 
          style={[
            styles.menu, 
            { transform: [{ translateX: slideAnim }] }
          ]}
        >
          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.userInfo}>
                 <View style={styles.avatar}>
                   {(avatarUri || savedAvatar) ? (
                    <Image source={{ uri: (avatarUri || savedAvatar) as string }} style={styles.avatarImage} />
                   ) : (
                    <ThemedText style={styles.avatarText}>
                      {currentUser?.email?.charAt(0).toUpperCase() || 'A'}
                    </ThemedText>
                  )}
                </View>
                 <View style={styles.userDetails}>
                   <ThemedText type="defaultSemiBold">{currentUser?.email ?? ''}</ThemedText>
                  <ThemedText style={styles.balance}>
                    {formatCurrency(totalUsd, currency, rates)}
                  </ThemedText>
                  {/* YOY 텍스트 노출 제거: 가격은 총자산 계산에만 사용 */}
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

            {/* Log Out button removed as per requirement */}

            {/* Tab Navigation */}
            <View style={styles.tabContainer}>
              {tabs.map((tab) => (
                <TouchableOpacity
                  key={tab.id}
                  style={[
                    styles.tab,
                    selectedTab === tab.id && styles.activeTab
                  ]}
                  onPress={() => setSelectedTab(tab.id)}
                >
                  <ThemedText style={[
                    styles.tabText,
                    selectedTab === tab.id && styles.activeTabText
                  ]}>
                    {tab.label}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>

            {/* Menu Sections (tab specific; admin-only 항목 포함) */}
            {sectionsForRender.map((section, sectionIndex) => (
              <View key={sectionIndex} style={styles.section}>
                <ThemedText style={styles.sectionTitle}>{section.title}</ThemedText>
                {section.items.map((item, itemIndex) => (
                  <View key={itemIndex}>
                    <TouchableOpacity
                      style={styles.menuItem}
                      onPress={item.onPress}
                    >
                      <ThemedText style={styles.menuIcon}>{item.icon}</ThemedText>
                      <ThemedText style={styles.menuText}>{item.title}</ThemedText>
                      <ThemedText style={styles.arrow}>›</ThemedText>
                    </TouchableOpacity>
                    {itemIndex < section.items.length - 1 && (
                      <View style={styles.separator} />
                    )}
                  </View>
                ))}
              </View>
            ))}

            {/* Save button (when settings changed) */}
            <View style={styles.saveSection}>
              <TouchableOpacity 
                style={[styles.saveButton, !isDirty && { opacity: 0.5 }]}
                disabled={!isDirty}
                onPress={() => {
                  // 향후 설정 페이지에서 변경사항이 컨텍스트에 반영되므로 여기서는 알림만
                  setIsDirty(false);
                  Alert.alert(t('saved', language) || 'Saved', t('preferencesSaved', language) || 'Preferences have been saved.');
                }}
              >
                <ThemedText style={styles.saveText}>{t('save', language)}</ThemedText>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
      {/* Mnemonic Modal */}
      {mnemonicVisible && (
        <View style={{ position:'absolute', left:0, right:0, top:0, bottom:0, backgroundColor:'rgba(0,0,0,0.8)', alignItems:'center', justifyContent:'center', padding:16 }}>
          <View style={{ width:'92%', maxWidth:520, borderWidth:1, borderColor:'#FFD700', borderRadius:12, backgroundColor:'#0F0F0F', padding:16 }}>
            <ThemedText style={{ color:'#FFD700', fontWeight:'800', fontSize:16, marginBottom:8 }}>니모닉(시드)</ThemedText>
            <ThemedText style={{ color:'#EDEDED', lineHeight:22, marginBottom:12 }}>
              {mnemonicText}
            </ThemedText>
            <View style={{ flexDirection:'row', justifyContent:'flex-end', gap:8 }}>
              <TouchableOpacity onPress={async()=>{ try { await Clipboard.setStringAsync(mnemonicText); Alert.alert(tr('복사됨', 'Copied', 'コピーしました', '已复制'), tr('니모닉을 클립보드에 복사했습니다.', 'Mnemonic copied to clipboard.', 'ニーモニックをクリップボードにコピーしました。', '已复制助记词到剪贴板。')); } catch {} }} style={{ paddingHorizontal:12, paddingVertical:8, borderWidth:1, borderColor:'#FFD700', borderRadius:8 }}>
                <ThemedText style={{ color:'#FFD700', fontWeight:'700' }}>{ti('copy', tr('복사', 'Copy', 'コピー', '复制'))}</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity onPress={async()=>{ setMnemonicVisible(false); setMnemonicText(''); try { await ScreenCapture.allowScreenCaptureAsync(); } catch {} }} style={{ paddingHorizontal:12, paddingVertical:8, borderWidth:1, borderColor:'#444', borderRadius:8 }}>
                <ThemedText style={{ color:'#DDD' }}>{ti('close', tr('닫기', 'Close', '閉じる', '关闭'))}</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      <QuickActionsSettings visible={quickActionsVisible} onClose={() => setQuickActionsVisible(false)} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
    paddingBottom: BOTTOM_BAR_HEIGHT,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  menu: {
    width: screenWidth * 0.85,
    height: screenHeight - BOTTOM_BAR_HEIGHT,
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
  yoyPrice: {
    fontSize: 12,
    color: '#FFD700',
    fontWeight: '700',
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
  // removed menu icon styles
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
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.dark.icon,
    marginLeft: 40,
    marginRight: 20,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.dark.icon,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    marginHorizontal: 2,
    borderRadius: 4,
  },
  activeTab: {
    backgroundColor: '#FFD700',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  activeTabText: {
    color: '#000000',
    fontWeight: 'bold',
  },
  signOutSection: {
    marginTop: 16,
    paddingHorizontal: 20,
  },
  signOutButton: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D4AF37',
    backgroundColor: '#2A2A2A',
  },
  signOutText: {
    color: '#FFD700',
    fontWeight: 'bold',
  },
  saveSection: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  saveButton: {
    paddingVertical: 14,
    backgroundColor: '#D4AF37',
    borderRadius: 10,
    alignItems: 'center',
  },
  saveText: {
    color: '#0C0C0C',
    fontWeight: 'bold',
  },
});
