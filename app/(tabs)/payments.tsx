import HamburgerMenu from '@/components/hamburger-menu';
import ProfileSheet from '@/components/profile-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import TopBar from '@/components/top-bar';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { getCoinLogoPath } from '@/lib/managedCoins';
import { getCoinPriceByCurrency } from '@/lib/priceManager';
import { UpbitTicker } from '@/lib/upbit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { Redirect } from 'expo-router';
import { IOS_APP_STORE_SHELF, ORDER_ENABLED, STAKING_ENABLED, SWAP_ENABLED, WEB_TRADE_BLOCKED } from '@/lib/featureFlags';
import { t } from '@/i18n';
import { Alert, RefreshControl, ScrollView, StyleSheet, TextInput, TouchableOpacity, View, Image, Modal, Linking, Animated, Easing, Dimensions } from 'react-native';

// Uniswap 모듈 import
import { useUniswap } from '@/lib/hooks/useUniswap';
import { DEFAULT_SLIPPAGE } from '@/lib/uniswap/constants';
import { SUPPORTED_SWAP_TOKENS, isAllowedPair, SwapSymbol } from '@/lib/swapConfig';

// 사용자 자산 import
import { mockBalances } from '@/data/balances';

// 전역 거래 스토어 import
import { useTransactionStore } from '@/src/stores/transaction.store';

function PaymentsScreenContent() {
  const { currentUser } = useAuth();
  const { language, currency } = usePreferences();
  const [menuOpen, setMenuOpen] = useState(false);
  
  // 전역 거래 스토어 사용
  const { recordSwap, recordReward, recordStaking, recordManualAdjustment, getTransactions } = useTransactionStore();
  const [profileOpen, setProfileOpen] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [profileUpdated, setProfileUpdated] = useState(false);
  const [username, setUsername] = useState<string>('');
  const [loading, setLoading] = useState(false);
  
  // Load username and avatar on component mount
  useEffect(() => {
    (async () => {
      if (currentUser?.uid) {
        const info = await AsyncStorage.getItem(`u:${currentUser.uid}:profile.info`);
        const photo = await AsyncStorage.getItem(`u:${currentUser.uid}:profile.photoUri`);
        
        if (info) {
          try {
            const parsedInfo = JSON.parse(info);
            setUsername(parsedInfo.username || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User');
          } catch {
            setUsername(currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User');
          }
        } else {
          setUsername(currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User');
        }
        
        setAvatarUri(photo);
      }
    })();
  }, [currentUser?.uid, profileUpdated]);
  const [markets, setMarkets] = useState<{ KRW: UpbitTicker[]; USDT: UpbitTicker[]; BTC: UpbitTicker[]; ETH: any[] }>({ KRW: [], USDT: [], BTC: [], ETH: [] });
  const [tab, setTab] = useState<'KRW'|'USDT'|'BTC'|'ETH'>('KRW');
  const [topTab, setTopTab] = useState<'uniswap'|'tradeHistory'>('uniswap');
  const [selectedTx, setSelectedTx] = useState<any | null>(null);
  const toastY = useRef(new Animated.Value(120)).current;
  const [toastText, setToastText] = useState('');
  const [toastColor, setToastColor] = useState('#6b7280');
  const screenHeight = Dimensions.get('window').height;
  const showToast = (msg: string, type: 'success'|'error'|'info'='info') => {
    setToastText(msg);
    setToastColor(type==='success' ? '#22c55e' : type==='error' ? '#ef4444' : '#6b7280');
    toastY.setValue(120);
    Animated.sequence([
      Animated.timing(toastY, { toValue: -screenHeight * 0.4, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.delay(10000),
      Animated.timing(toastY, { toValue: 120, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: true })
    ]).start(() => setToastText(''));
  };

  // Payments(안전 모드: 외부 지갑/게이트웨이로 연결) 상태
  const [payCoin, setPayCoin] = useState<string>('YOY');
  const [payAmount, setPayAmount] = useState<string>('');
  const [payTo, setPayTo] = useState<string>('');
  const [generatedUri, setGeneratedUri] = useState<string>('');
  
  // Provider/Signer (MetaMask 웹)
  const getWebProvider = async () => {
    try {
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { BrowserProvider } = require('ethers');
        const provider = new BrowserProvider((window as any).ethereum);
        return provider;
      }
    } catch {}
    return null as any;
  };
  const [webProvider, setWebProvider] = useState<any>(null);
  useEffect(() => {
    (async () => {
      const p = await getWebProvider();
      setWebProvider(p);
    })();
  }, []);
  const uniswap = useUniswap(webProvider as any);
  
  // 스테이킹 관련 state
  const [stakingAmount, setStakingAmount] = useState('');
  const [stakingPeriod, setStakingPeriod] = useState(30); // 일 단위
  const [stakingReward, setStakingReward] = useState(0);
  const [activeStakings, setActiveStakings] = useState<any[]>([]);
  
  // 토큰 선택 관련 state
  const [showTokenSelector, setShowTokenSelector] = useState(false);
  const [selectingToken, setSelectingToken] = useState<'from' | 'to'>('from');
  
  // 사용자 잔액 관리 (실제 wallet 자산에서 가져오기)
  const [userBalances, setUserBalances] = useState<Record<string, number>>({});

  // 거래 내역을 기반으로 최종 잔액 계산
  const calculateFinalBalances = (initialBalances: Record<string, number>) => {
    const transactions = getTransactions();
    const finalBalances = { ...initialBalances };
    
    transactions.forEach(transaction => {
      if (transaction.type === 'swap') {
        // 스왑 거래: fromToken 차감, toToken 증가
        if (transaction.fromToken && transaction.fromAmount) {
          finalBalances[transaction.fromToken] = (finalBalances[transaction.fromToken] || 0) - transaction.fromAmount;
        }
        if (transaction.toToken && transaction.toAmount) {
          finalBalances[transaction.toToken] = (finalBalances[transaction.toToken] || 0) + transaction.toAmount;
        }
      } else if (transaction.type === 'reward' || transaction.type === 'daily_reward' || transaction.type === 'event_reward') {
        // 보상 거래: 해당 토큰 증가
        if (transaction.symbol && transaction.amount) {
          finalBalances[transaction.symbol] = (finalBalances[transaction.symbol] || 0) + transaction.amount;
        }
      } else if (transaction.type === 'staking') {
        // 스테이킹 거래: 해당 토큰 차감
        if (transaction.symbol && transaction.amount) {
          finalBalances[transaction.symbol] = (finalBalances[transaction.symbol] || 0) - transaction.amount;
        }
      }
    });
    
    return finalBalances;
  };

  // wallet 자산을 userBalances로 변환 (영구 저장)
  useEffect(() => {
    const loadUserBalances = async () => {
      if (!currentUser?.email) return;
      
      const storageKey = `user_balances_${currentUser.email}`;
      
      try {
        // 저장된 잔액이 있는지 확인
        const savedBalances = await AsyncStorage.getItem(storageKey);
        
        if (savedBalances) {
          // 저장된 잔액이 있으면 불러오기
          const initialBalances = JSON.parse(savedBalances);
          // 거래 내역을 기반으로 최종 잔액 계산
          const finalBalances = calculateFinalBalances(initialBalances);
          console.log('Initial balances:', initialBalances);
          console.log('Final balances after transactions:', finalBalances);
          setUserBalances(finalBalances);
        } else {
          // 저장된 잔액이 없으면 초기값 설정
          const balances: Record<string, number> = {};
          
          // 관리자 3개 계정만 자산을 가지고, 나머지 사용자는 0
          const adminEmails = ['admin@yooyland.com', 'jch4389@gmail.com', 'landyooy@gmail.com'];
          const isAdmin = currentUser?.email && adminEmails.includes(currentUser.email);
          
          mockBalances.forEach(balance => {
            balances[balance.symbol] = isAdmin ? balance.amount : 0;
          });

          // Uniswap에서 지원하는 토큰들에 대한 기본값 설정 (wallet에 없는 경우)
          const uniswapTokens = ['YOY', 'WETH', 'USDT', 'USDC', 'WBTC', 'DAI', 'LINK', 'UNI', 'AAVE', 'CRV', 'SUSHI', 'COMP', 'MKR', 'SNX', 'YFI', 'BAL', 'LRC', 'ZRX', 'BAT', 'KNC'];
          
          uniswapTokens.forEach(token => {
            if (!balances[token]) {
              // wallet에 없는 토큰은 0으로 설정
              balances[token] = 0;
            }
          });

          setUserBalances(balances);
          // 초기 잔액 저장
          await AsyncStorage.setItem(storageKey, JSON.stringify(balances));
        }
      } catch (error) {
        console.error('Error loading user balances:', error);
      }
    };

    loadUserBalances();
  }, [currentUser?.email]); // currentUser 전체가 아닌 email만 의존성으로 설정

  // userBalances 변경 시 AsyncStorage에 저장
  useEffect(() => {
    const saveUserBalances = async () => {
      if (!currentUser?.email || Object.keys(userBalances).length === 0) return;
      
      const storageKey = `user_balances_${currentUser.email}`;
      try {
        await AsyncStorage.setItem(storageKey, JSON.stringify(userBalances));
      } catch (error) {
        console.error('Error saving user balances:', error);
      }
    };

    saveUserBalances();
  }, [userBalances, currentUser]);

  // 스왑 결과 상태
  const [swapResult, setSwapResult] = useState<{
    success: boolean;
    fromAmount: number;
    toAmount: number;
    fromToken: string;
    toToken: string;
    transactionHash: string;
    timestamp: string;
  } | null>(null);

  // 스테이킹 기간 변경 핸들러
  const handleStakingPeriodChange = (period: number) => {
    setStakingPeriod(period);
    if (stakingAmount) {
      const amount = parseFloat(stakingAmount);
      const reward = amount * (period / 365) * 0.1; // 10% 연간 수익률
      setStakingReward(reward);
    }
  };

  const startStaking = () => {
    if (!stakingAmount || parseFloat(stakingAmount) <= 0) {
      Alert.alert('알림', '올바른 수량을 입력해주세요.');
      return;
    }

    const amount = parseFloat(stakingAmount);
    
    // YOY 잔액 확인
    if (userBalances['YOY'] < amount) {
      Alert.alert('잔액 부족', `YOY 잔액이 부족합니다.\n보유: ${userBalances['YOY']} YOY\n요청: ${amount} YOY`);
      return;
    }

    // 전역 거래 스토어에 스테이킹 기록
    recordStaking({
      symbol: 'YOY',
      amount,
      description: `${stakingPeriod}일 스테이킹 출금`,
      duration: stakingPeriod
    });
    
    // YOY 잔액 차감
    const newBalances = {
      ...userBalances,
      YOY: (userBalances.YOY || 0) - amount
    };
    setUserBalances(newBalances);

    const newStaking = {
      id: Date.now().toString(),
      amount,
      period: stakingPeriod,
      startDate: new Date(),
      endDate: new Date(Date.now() + stakingPeriod * 24 * 60 * 60 * 1000),
      reward: stakingReward,
      status: 'active'
    };

    setActiveStakings(prev => [...prev, newStaking]);
    setStakingAmount('');
    setStakingReward(0);
    Alert.alert('성공', '스테이킹이 시작되었습니다.');
  };

  // 토큰 선택 관련 함수들
  const openTokenSelector = (type: 'from' | 'to') => {
    setSelectingToken(type);
    setShowTokenSelector(true);
  };

  const selectToken = (tokenSymbol: string) => {
    const other = selectingToken === 'from' ? (uniswap.swapState.toToken as SwapSymbol) : (uniswap.swapState.fromToken as SwapSymbol);
    const next = tokenSymbol as SwapSymbol;
    if (other === next) {
      Alert.alert('안내', '같은 토큰끼리는 스왑할 수 없습니다.');
      return;
    }
    if (!isAllowedPair(selectingToken === 'from' ? next : (uniswap.swapState.fromToken as SwapSymbol),
                       selectingToken === 'from' ? (uniswap.swapState.toToken as SwapSymbol) : next)) {
      Alert.alert('안내', '이 앱에서는 YOY 중심 스왑만 지원됩니다');
      return;
    }
    if (selectingToken === 'from') uniswap.setFromToken(tokenSymbol);
    else uniswap.setToToken(tokenSymbol);
    setShowTokenSelector(false);
  };

  // 스왑 실행 함수
  const executeSwap = async () => {
    if (!uniswap.isValidSwap) { Alert.alert('오류', '올바른 스왑 정보를 입력해주세요.'); return; }
    const fromToken = uniswap.swapState.fromToken;
    const toTokenSnap = uniswap.swapState.toToken;
    const fromAmount = parseFloat(uniswap.swapState.amountIn || '0');
    const toAmountSnap = parseFloat(uniswap.swapState.amountOut || '0');
    if (!fromToken || !isFinite(fromAmount) || fromAmount <= 0) { Alert.alert('오류','토큰과 수량을 확인해주세요.'); return; }
    if (userBalances[fromToken] < fromAmount) { Alert.alert('잔액 부족', `${fromToken} 잔액이 부족합니다.`); return; }
    try {
      // 서명자 준비: 웹은 MetaMask, 네이티브는 로컬 월렛
      let signer: any = null;
      try {
        if (typeof window !== 'undefined' && (window as any).ethereum && webProvider) {
          const { BrowserProvider } = require('ethers');
          const provider = new BrowserProvider((window as any).ethereum);
          signer = await provider.getSigner();
        }
      } catch {}
      if (!signer) {
        const { getLocalWallet, getProvider } = await import('@/src/wallet/wallet');
        const local = await getLocalWallet();
        if (!local) { Alert.alert('지갑 필요','지갑을 먼저 생성/복구해 주세요.'); return; }
        signer = local.wallet.connect(getProvider());
      }
      const txHash = await uniswap.executeSwap(signer);
      const toToken = toTokenSnap;
      const toAmount = toAmountSnap;
      // 거래 기록
      try {
        recordSwap({
          fromToken,
          toToken,
          fromAmount,
          toAmount,
          transactionHash: txHash,
        });
      } catch {}
      // 잔액 즉시 반영(로컬 오버레이)
      try {
        const { useMonitorStore } = require('@/lib/monitorStore');
        await useMonitorStore.getState().applyLocalChange?.({ symbol: fromToken, delta: -fromAmount, type: 'swap', description: `Swap to ${toToken}` });
        if (toAmount > 0) {
          await useMonitorStore.getState().applyLocalChange?.({ symbol: toToken, delta: toAmount, type: 'swap', description: `Swap from ${fromToken}` });
        }
      } catch {}
      showToast('스왑이 완료되었습니다.', 'success');
    } catch (e) {
      console.error('Swap execute failed:', e);
      try {
        useTransactionStore.getState().recordFailure({
          type: 'swap',
          description: `Swap 실패: ${fromToken} → ${toTokenSnap}`,
          symbol: fromToken,
          amount: fromAmount,
          source: 'uniswap',
          memo: String((e as any)?.message || e),
        });
      } catch {}
      Alert.alert('스왑 실패', String((e as any)?.message || e));
    }
  };

  // 사용 가능한 토큰 목록
  const availableTokens = SUPPORTED_SWAP_TOKENS;

  return (
    <ThemedView style={styles.container}>
      <TopBar 
        title={username} 
        onMenuPress={() => setMenuOpen(true)}
        onProfilePress={() => setProfileOpen(true)}
        profileUpdated={profileUpdated}
      />
      
      <ScrollView 
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => {}} />
        }
      >
        {/* 상단 3탭: Uniswap / 입출금 / 스테이킹 */}
        <View style={styles.topTabContainer}>
          <TouchableOpacity style={[styles.topTab, topTab === 'uniswap' && styles.topTabActive]} onPress={() => setTopTab('uniswap')}>
            <ThemedText style={[styles.topTabText, topTab === 'uniswap' && styles.topTabTextActive]}>Uniswap</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.topTab, topTab === 'tradeHistory' && styles.topTabActive]} onPress={() => setTopTab('tradeHistory')}>
            <ThemedText style={[styles.topTabText, topTab === 'tradeHistory' && styles.topTabTextActive]}>{t('history', language)}</ThemedText>
          </TouchableOpacity>
        </View>

        {/* Uniswap 탭 */}
        {topTab === 'uniswap' && (
          <View style={styles.tabContent}>
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>{t('tokenSwap', language)}</ThemedText>
              <ThemedText style={styles.sectionSubtitle}>{t('uniswapInfoTitle', language)}</ThemedText>
            </View>

            {/* 스왑 입력 영역 */}
            <View style={styles.swapContainer}>
              {/* From 토큰 */}
              <View style={styles.swapInputContainer}>
                <View style={styles.swapInputHeader}>
                  <ThemedText style={styles.swapInputLabel}>
                    {language === 'en' ? 'From' : 'From'}
                  </ThemedText>
                  <TouchableOpacity onPress={() => {
                    const maxAmount = userBalances[uniswap.swapState.fromToken] || 0;
                    uniswap.setAmountIn(maxAmount.toString());
                  }}>
                    <ThemedText style={styles.maxButton}>
                      {language === 'en' ? 'MAX' : '최대'}
                    </ThemedText>
                  </TouchableOpacity>
                </View>
                
                <View style={styles.swapInputRow}>
                  <View style={styles.amountInputContainer}>
                    <TextInput
                      style={styles.swapAmountInput}
                      placeholder="0.0"
                      placeholderTextColor="#666"
                      value={uniswap.formattedAmountIn}
                      onChangeText={uniswap.setAmountIn}
                      keyboardType="numeric"
                    />
                    <ThemedText style={styles.usdValue}>
                      {(() => {
                        const p = getCoinPriceByCurrency(uniswap.swapState.fromToken, currency as any) || 0;
                        const symbol = currency === 'USD' ? '$' : currency === 'KRW' ? '₩' : '';
                        const val = (parseFloat(uniswap.formattedAmountIn || '0') || 0) * p;
                        return `≈ ${symbol}${val.toLocaleString()}`;
                      })()}
                    </ThemedText>
                  </View>
                  
                  <TouchableOpacity
                    style={styles.tokenButton}
                    onPress={() => openTokenSelector('from')}
                  >
                    <View style={styles.tokenButtonContent}>
                      {/* @ts-ignore */}
                      <Image source={getCoinLogoPath(uniswap.swapState.fromToken)} style={styles.tokenLogo} />
                      <ThemedText style={styles.tokenButtonText}>
                        {uniswap.swapState.fromToken}
                      </ThemedText>
                      <ThemedText style={styles.tokenArrow}>▼</ThemedText>
                    </View>
                  </TouchableOpacity>
                </View>
                
                <ThemedText style={styles.swapBalance}>{(t('available', language) || (language==='ko'?'잔액':'Balance'))}: {userBalances[uniswap.swapState.fromToken]?.toLocaleString() || 0} {uniswap.swapState.fromToken}</ThemedText>
              </View>

              {/* 스왑 화살표 */}
              <View style={styles.swapArrowContainer}>
                <TouchableOpacity
                  style={styles.swapArrow}
                  onPress={uniswap.swapTokens}
                >
                  <ThemedText style={styles.swapArrowText}>⇅</ThemedText>
                </TouchableOpacity>
              </View>

              {/* To 토큰 */}
              <View style={styles.swapInputContainer}>
                <View style={styles.swapInputHeader}>
                  <ThemedText style={styles.swapInputLabel}>
                    {language === 'en' ? 'To' : 'To'}
                  </ThemedText>
                  <ThemedText style={styles.swapRate}>
                    {(() => {
                      const fp = getCoinPriceByCurrency(uniswap.swapState.fromToken, currency as any) || 0;
                      const tp = getCoinPriceByCurrency(uniswap.swapState.toToken, currency as any) || 0;
                      if (!fp || !tp) return '';
                      const rate = fp / tp;
                      return `1 ${uniswap.swapState.fromToken} = ${rate.toFixed(6)} ${uniswap.swapState.toToken}`;
                    })()}
                  </ThemedText>
                </View>
                
                <View style={styles.swapInputRow}>
                  <View style={styles.amountInputContainer}>
                    <TextInput
                      style={styles.swapAmountInput}
                      placeholder="0.0"
                      placeholderTextColor="#666"
                      value={uniswap.formattedAmountOut}
                      onChangeText={uniswap.setAmountOut}
                      keyboardType="numeric"
                    />
                    <ThemedText style={styles.usdValue}>
                      {(() => {
                        const p = getCoinPriceByCurrency(uniswap.swapState.toToken, currency as any) || 0;
                        const symbol = currency === 'USD' ? '$' : currency === 'KRW' ? '₩' : '';
                        const val = (parseFloat(uniswap.formattedAmountOut || '0') || 0) * p;
                        return `≈ ${symbol}${val.toLocaleString()}`;
                      })()}
                    </ThemedText>
                  </View>
                  
                  <TouchableOpacity
                    style={styles.tokenButton}
                    onPress={() => openTokenSelector('to')}
                  >
                    <View style={styles.tokenButtonContent}>
                      {/* @ts-ignore */}
                      <Image source={getCoinLogoPath(uniswap.swapState.toToken)} style={styles.tokenLogo} />
                      <ThemedText style={styles.tokenButtonText}>
                        {uniswap.swapState.toToken}
                      </ThemedText>
                      <ThemedText style={styles.tokenArrow}>▼</ThemedText>
                    </View>
                  </TouchableOpacity>
                </View>
                
                <ThemedText style={styles.swapBalance}>{(t('available', language) || (language==='ko'?'잔액':'Balance'))}: {userBalances[uniswap.swapState.toToken]?.toLocaleString() || 0} {uniswap.swapState.toToken}</ThemedText>
              </View>

              {/* 가스비 및 수수료 정보 */}
              <View style={styles.swapInfoContainer}>
                <View style={styles.swapInfoRow}>
                  <ThemedText style={styles.swapInfoLabel}>
                    {language === 'en' ? 'Network Fee' : '네트워크 수수료'}
                  </ThemedText>
                  <ThemedText style={styles.swapInfoValue}>
                    {(() => {
                      try {
                        const gasEth = parseFloat(uniswap.swapState.gasFee || '0') || 0;
                        const price = getCoinPriceByCurrency('ETH', 'USD' as any) || 0;
                        const usd = gasEth * price;
                        return `~$${usd.toFixed(2)}`;
                      } catch { return '~$0.00'; }
                    })()}
                  </ThemedText>
                </View>
                <View style={styles.swapInfoRow}>
                  <ThemedText style={styles.swapInfoLabel}>
                    {language === 'en' ? 'Price Impact' : '가격 영향'}
                  </ThemedText>
                  <ThemedText style={styles.swapInfoValue}>
                    {`${Math.max(0, uniswap.swapState.priceImpact || 0).toFixed(2)}%`}
                  </ThemedText>
                </View>
                <View style={styles.swapInfoRow}>
                  <ThemedText style={styles.swapInfoLabel}>
                    {language === 'en' ? 'Minimum Received' : '최소 수령량'}
                  </ThemedText>
                  <ThemedText style={styles.swapInfoValue}>
                    {uniswap.swapState.amountOut
                      ? (parseFloat(uniswap.swapState.amountOut) * (1 - (DEFAULT_SLIPPAGE/100))).toFixed(6)
                      : '0'} {uniswap.swapState.toToken}
                  </ThemedText>
                </View>
              </View>

              {/* 스왑 버튼 */}
              <TouchableOpacity
                style={[styles.swapButton, !uniswap.isValidSwap && styles.swapButtonDisabled]}
                onPress={executeSwap}
                disabled={!uniswap.isValidSwap || uniswap.swapState.isSwapping}
              >
                <ThemedText style={styles.swapButtonText}>
                  {uniswap.swapState.isSwapping ? 'Swapping...' : 
                   !uniswap.isValidSwap ? 'Enter an amount' : 
                   `Swap ${uniswap.swapState.fromToken} for ${uniswap.swapState.toToken}`}
                </ThemedText>
              </TouchableOpacity>
            </View>

            {/* 스왑 결과 토스트 카드 (아래에서 위로) */}
            {swapResult && (
              <Animated.View style={{ position:'absolute', left:16, right:16, bottom:16, transform:[{ translateY: toastY }], zIndex: 9998 }}>
                <View style={styles.swapResultCard}>
                  <ThemedText style={styles.swapResultTitle}>
                    {swapResult.success ? '✅ 스왑 완료!' : '❌ 스왑 실패'}
                  </ThemedText>
                  <View style={styles.swapResultContent}>
                    <ThemedText style={styles.swapResultText}>
                      {swapResult.fromAmount} {swapResult.fromToken} → {swapResult.toAmount} {swapResult.toToken}
                    </ThemedText>
                    <ThemedText style={styles.swapResultHash}>
                      트랜잭션: {swapResult.transactionHash}
                    </ThemedText>
                    <ThemedText style={styles.swapResultTime}>
                      완료 시간: {swapResult.timestamp}
                    </ThemedText>
                  </View>
                  <TouchableOpacity 
                    style={styles.closeResultButton}
                    onPress={() => setSwapResult(null)}
                  >
                    <ThemedText style={styles.closeResultButtonText}>닫기</ThemedText>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            )}

            {/* 스왑 거래 내역 탭으로 이동 */}

            <View style={styles.swapInfoCard}>
              <ThemedText style={styles.swapInfoTitle}>{t('uniswapInfoTitle', language)}</ThemedText>
              <ThemedText style={styles.swapInfoText}>
                • {t('uniswapBullet1', language)}{'\n'}
                • {t('uniswapBullet2', language)}{'\n'}
                • {t('uniswapBullet3', language)}{'\n'}
                • {t('uniswapBullet4', language)}{'\n'}
                • {t('uniswapBullet5', language)}{'\n'}
                • {t('uniswapBullet6', language)}
              </ThemedText>
            </View>
          </View>
        )}

        {/* Payments 탭 */}
        {topTab === 'payments' && (
          <View style={styles.tabContent}>
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>{t('depositWithdraw', language)}</ThemedText>
              <ThemedText style={styles.sectionSubtitle}>
                {language === 'en' ? 'Manage your crypto assets' : '암호화폐 자산을 관리하세요'}
              </ThemedText>
            </View>

            {/* 안전 결제 섹션: 외부 지갑/게이트웨이로만 연결 (스토어 규정 준수) */}
            <View style={styles.paymentBox}>
              <ThemedText style={styles.paymentTitle}>{t('paymentSafeMode', language)}</ThemedText>
              <View style={styles.paymentRow}>
                <ThemedText style={styles.paymentLabel}>Coin</ThemedText>
                <TextInput style={styles.paymentInput} placeholder="YOY / ETH / USDT" placeholderTextColor="#666" value={payCoin} onChangeText={setPayCoin} />
              </View>
              <View style={styles.paymentRow}>
                <ThemedText style={styles.paymentLabel}>{t('amountLabel', language)}</ThemedText>
                <TextInput style={styles.paymentInput} placeholder="0.0" placeholderTextColor="#666" keyboardType="decimal-pad" value={payAmount} onChangeText={setPayAmount} />
              </View>
              <View style={styles.paymentRow}>
                <ThemedText style={styles.paymentLabel}>{t('toAddress', language)}</ThemedText>
                <TextInput style={styles.paymentInput} placeholder="0x... or destination" placeholderTextColor="#666" value={payTo} onChangeText={setPayTo} />
              </View>

              <View style={{ flexDirection:'row', marginTop: 8 }}>
                <TouchableOpacity style={styles.paymentBtn} onPress={() => {
                  const amt = parseFloat(payAmount||'0');
                  if (!payCoin || !payTo || !(amt>0)) { Alert.alert('Error','Fill coin, amount, address'); return; }
                  // 간단 EVM ETH URI (토큰은 안내 메시지로 대체)
                  let uri = '';
                  if (payCoin === 'ETH') {
                    const wei = Math.floor(amt * 1e18).toString();
                    uri = `ethereum:${payTo}?value=${wei}`; // EIP-681 간단형
                  } else {
                    uri = `${payCoin}:${payTo}?amount=${amt}`; // 일반화된 URI (지갑 호환 시)
                  }
                  setGeneratedUri(uri);
                }}>
                  <ThemedText style={styles.paymentBtnText}>{t('generateUri', language)}</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.paymentBtn, { backgroundColor:'#2a2a2a', marginLeft:8 }]} onPress={async() => {
                  if (!generatedUri) { Alert.alert('Info','먼저 URI를 생성하세요'); return; }
                  try {
                    if (typeof navigator !== 'undefined' && navigator.clipboard) {
                      await navigator.clipboard.writeText(generatedUri);
                      Alert.alert('Copied', 'URI copied');
                    }
                  } catch {}
                }}>
                  <ThemedText style={styles.paymentBtnText}>{t('copyUri', language)}</ThemedText>
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection:'row', marginTop: 8 }}>
                <TouchableOpacity style={[styles.paymentBtn, { backgroundColor:'#1e3a8a' }]} onPress={() => {
                  if (!generatedUri) { Alert.alert('Info','먼저 URI를 생성하세요'); return; }
                  Linking.openURL(generatedUri);
                }}>
                  <ThemedText style={styles.paymentBtnText}>{t('openInWallet', language)}</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.paymentBtn, { backgroundColor:'#1f2937', marginLeft:8 }]} onPress={() => {
                  // 외부 결제 게이트웨이(예: 우리 홈페이지)로 안전하게 이동
                  const url = `https://yooy.land/pay?coin=${encodeURIComponent(payCoin)}&amount=${encodeURIComponent(payAmount)}&to=${encodeURIComponent(payTo)}`;
                  Linking.openURL(url);
                }}>
                  <ThemedText style={styles.paymentBtnText}>{t('openCheckout', language)}</ThemedText>
                </TouchableOpacity>
              </View>

              {!!generatedUri && (
                <ThemedText style={styles.paymentUri}>{generatedUri}</ThemedText>
              )}
            </View>

            {/* 자산 목록 */}
            <View style={styles.assetsContainer}>
              <ThemedText style={styles.assetsTitle}>{t('yourAssets', language)}</ThemedText>
              
              <ScrollView style={styles.assetsList} showsVerticalScrollIndicator={false}>
                {Object.entries(userBalances).filter(([symbol]) => {
                  const email = (currentUser as any)?.email || '';
                  const isAdmin = email === 'admin@yooyland.com';
                  const yoyOnly = email === 'jch4389@gmail.com' || email === 'landyooy@gmail.com';
                  return isAdmin ? true : (yoyOnly ? symbol === 'YOY' : false);
                }).map(([symbol, amount]) => {
                  if (amount === 0) return null;
                  
                  return (
                    <View key={symbol} style={styles.assetItem}>
                      <View style={styles.assetInfo}>
                        <View style={styles.assetIcon}>
                          <ThemedText style={styles.assetIconText}>
                            {symbol.charAt(0)}
                          </ThemedText>
                        </View>
                        <View style={styles.assetDetails}>
                          <ThemedText style={styles.assetSymbol}>{symbol}</ThemedText>
                          <ThemedText style={styles.assetName}>
                            {availableTokens.find(t => t.symbol === symbol)?.name || symbol}
                          </ThemedText>
                        </View>
                      </View>
                      
                      <View style={styles.assetAmount}>
                        <ThemedText style={styles.assetBalance}>
                          {amount.toLocaleString()}
                        </ThemedText>
                        <ThemedText style={styles.assetValue}>
                          ≈ ${(amount * (symbol === 'YOY' ? 0.035 : 1)).toFixed(2)}
                        </ThemedText>
                      </View>
                      
                      <View style={styles.assetActions}>
                        <TouchableOpacity style={styles.actionButton}>
                          <ThemedText style={styles.actionButtonText}>{t('send', language)}</ThemedText>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.actionButton, styles.actionButtonSecondary]}>
                          <ThemedText style={[styles.actionButtonText, styles.actionButtonTextSecondary]}>{t('receive', language)}</ThemedText>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            </View>

            {/* 빠른 액션 */}
            <View style={styles.quickActionsContainer}>
              <ThemedText style={styles.quickActionsTitle}>
                {t('quickActions', language)}
              </ThemedText>
              
              <View style={styles.quickActionsGrid}>
                <TouchableOpacity style={styles.quickActionItem}>
                  <View style={styles.quickActionIcon}>
                    <ThemedText style={styles.quickActionIconText}>📤</ThemedText>
                  </View>
                  <ThemedText style={styles.quickActionLabel}>
                    {language === 'en' ? 'Send' : '보내기'}
                  </ThemedText>
                </TouchableOpacity>
                
                <TouchableOpacity style={styles.quickActionItem}>
                  <View style={styles.quickActionIcon}>
                    <ThemedText style={styles.quickActionIconText}>📥</ThemedText>
                  </View>
                  <ThemedText style={styles.quickActionLabel}>
                    {language === 'en' ? 'Receive' : '받기'}
                  </ThemedText>
                </TouchableOpacity>
                
                <TouchableOpacity style={styles.quickActionItem}>
                  <View style={styles.quickActionIcon}>
                    <ThemedText style={styles.quickActionIconText}>🔄</ThemedText>
                  </View>
                  <ThemedText style={styles.quickActionLabel}>
                    {language === 'en' ? 'Swap' : '스왑'}
                  </ThemedText>
                </TouchableOpacity>
                
                <TouchableOpacity style={styles.quickActionItem}>
                  <View style={styles.quickActionIcon}>
                    <ThemedText style={styles.quickActionIconText}>📊</ThemedText>
                  </View>
                  <ThemedText style={styles.quickActionLabel}>
                    {language === 'en' ? 'Stake' : '스테이킹'}
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>

            {/* 최근 거래 */}
            <View style={styles.recentTransactionsContainer}>
              <View style={styles.recentTransactionsHeader}>
                <ThemedText style={styles.recentTransactionsTitle}>
                  {language === 'en' ? 'Recent Transactions' : '최근 거래'}
                </ThemedText>
                <TouchableOpacity>
                  <ThemedText style={styles.viewAllButton}>
                    {language === 'en' ? 'View All' : '전체 보기'}
                  </ThemedText>
                </TouchableOpacity>
              </View>
              
              <ScrollView style={styles.recentTransactionsList} showsVerticalScrollIndicator={false}>
                {getTransactions({ limit: 5 }).map((transaction) => (
                  <View key={transaction.id} style={styles.transactionItem}>
                    <View style={styles.transactionIcon}>
                      <ThemedText style={styles.transactionIconText}>
                        {transaction.type === 'swap' ? '🔄' : 
                         transaction.type === 'reward' ? '🎁' : 
                         transaction.type === 'staking' ? '📊' : '💸'}
                      </ThemedText>
                    </View>
                    
                    <View style={styles.transactionDetails}>
                      <ThemedText style={styles.transactionDescription}>
                        {transaction.description}
                      </ThemedText>
                      <ThemedText style={styles.transactionTime}>
                        {transaction.timestamp}
                      </ThemedText>
                    </View>
                    
                    <View style={styles.transactionAmount}>
                      <ThemedText style={[
                        styles.transactionAmountText,
                        transaction.change && transaction.change > 0 ? styles.transactionAmountPositive : styles.transactionAmountNegative
                      ]}>
                        {transaction.change && transaction.change > 0 ? '+' : ''}
                        {transaction.amount} {transaction.symbol}
                      </ThemedText>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>

            {/* 네트워크 정보 */}
            <View style={styles.networkInfoContainer}>
              <ThemedText style={styles.networkInfoTitle}>
                {language === 'en' ? 'Network Information' : '네트워크 정보'}
              </ThemedText>
              
              <View style={styles.networkInfoCard}>
                <View style={styles.networkInfoRow}>
                  <ThemedText style={styles.networkInfoLabel}>
                    {language === 'en' ? 'Network' : '네트워크'}
                  </ThemedText>
                  <ThemedText style={styles.networkInfoValue}>
                    Ethereum Mainnet
                  </ThemedText>
                </View>
                <View style={styles.networkInfoRow}>
                  <ThemedText style={styles.networkInfoLabel}>
                    {language === 'en' ? 'Gas Price' : '가스 가격'}
                  </ThemedText>
                  <ThemedText style={styles.networkInfoValue}>
                    20 Gwei
                  </ThemedText>
                </View>
                <View style={styles.networkInfoRow}>
                  <ThemedText style={styles.networkInfoLabel}>
                    {language === 'en' ? 'Block Height' : '블록 높이'}
                  </ThemedText>
                  <ThemedText style={styles.networkInfoValue}>
                    18,234,567
                  </ThemedText>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* 거래내역 탭 (스왑 전용 구분) */}
        {topTab === 'tradeHistory' && (
          <View style={styles.tabContent}>
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>
                {language === 'en' ? 'History' : '거래내역'}
              </ThemedText>
              <ThemedText style={styles.sectionSubtitle}>
                {language === 'en' ? 'Recent swap-only transactions' : '스왑 전용 거래 기록'}
              </ThemedText>
            </View>

            {(() => {
              const rows = getTransactions({ type: 'swap', limit: 100 });
              if (rows.length === 0) {
                return (
                  <ThemedText style={{ color: '#aaa', padding: 16 }}>
                    {language === 'en' ? 'No swap history' : '스왑 거래 기록이 없습니다.'}
                  </ThemedText>
                );
              }

              return (
                <View style={styles.historyTableContainer}>
                  {/* Header */}
                  <View style={styles.historyHeaderRow}>
                    <ThemedText style={[styles.historyHeaderCell, { flex: 1 }]}>{language === 'en' ? 'Time' : '시간'}</ThemedText>
                    <ThemedText style={[styles.historyHeaderCell, { flex: 1 }]}>{language === 'en' ? 'State' : '상태'}</ThemedText>
                    <ThemedText style={[styles.historyHeaderCell, { flex: 1.2 }]}>{language === 'en' ? 'Coin' : '코인'}</ThemedText>
                    <ThemedText style={[styles.historyHeaderCell, { flex: 1.2 }]}>{language === 'en' ? 'Amount' : '수량'}</ThemedText>
                    <ThemedText style={[styles.historyHeaderCell, { flex: 1.6 }]}>{language === 'en' ? 'Tx' : 'Tx'}</ThemedText>
                  </View>

                  {/* Rows */}
                  <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={true}>
                    {rows.map((r) => {
                      const ts = r.timestamp || r.time || r.createdAt;
                      const d = ts ? new Date(ts) : null;
                      const timeLabel = d && !isNaN(d.getTime()) ? `${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}` : '-';
                      const ok = r.success === true;
                      const stateStyle = ok ? styles.badgeSuccess : (r.success === false ? styles.badgeFail : styles.badgePending);
                      const fromToken = r.fromToken || '—';
                      const toToken = r.toToken || '—';
                      const fromAmount = typeof r.fromAmount === 'number' ? r.fromAmount : parseFloat(r.fromAmount || '0') || 0;
                      const toAmount = typeof r.toAmount === 'number' ? r.toAmount : parseFloat(r.toAmount || '0') || 0;
                      const coin = `${fromToken}/${toToken}`;
                      const amount = `${fromAmount}→${toAmount}`;
                      const txHash = r.transactionHash || r.txHash || '-';
                      return (
                        <TouchableOpacity key={r.id || `${txHash}-${timeLabel}`} style={styles.historyRow} onPress={() => setSelectedTx(r)}>
                          <ThemedText style={[styles.historyCell, { flex: 1 }]}>{timeLabel}</ThemedText>
                          <View style={[styles.stateBadge, stateStyle]}>
                            <ThemedText style={styles.stateBadgeText}>{ok ? (language==='en'?'Success':'성공') : (r.success===false ? (language==='en'?'Failed':'실패') : 'Pending')}</ThemedText>
                          </View>
                          <ThemedText style={[styles.historyCell, { flex: 1.2 }]}>{coin}</ThemedText>
                          <ThemedText style={[styles.historyCell, { flex: 1.2 }]}>{amount}</ThemedText>
                          <ThemedText numberOfLines={1} style={[styles.historyCell, styles.historyHashCell, { flex: 1.6 }]}>{txHash}</ThemedText>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              );
            })()}
          </View>
        )}

        {/* 스테이킹 탭 */}
        {topTab === 'staking' && (
          <View style={styles.tabContent}>
            <View style={styles.sectionHeader}>
              <ThemedText style={styles.sectionTitle}>
                {language === 'en' ? 'Staking' : '스테이킹'}
              </ThemedText>
              <ThemedText style={styles.sectionSubtitle}>
                {language === 'en' ? 'Stake YOY tokens to earn rewards' : 'YOY 토큰을 스테이킹하여 보상을 받으세요'}
              </ThemedText>
            </View>

            {/* 스테이킹 입력 영역 */}
            <View style={styles.stakingContainer}>
              <View style={styles.stakingInputGroup}>
                <ThemedText style={styles.stakingLabel}>
                  {language === 'en' ? 'Amount to Stake' : '스테이킹 수량'}
                </ThemedText>
                <View style={styles.stakingInputRow}>
                  <TextInput
                    style={styles.stakingAmountInput}
                    placeholder="0"
                    placeholderTextColor="#666"
                    value={stakingAmount}
                    onChangeText={(text) => {
                      setStakingAmount(text);
                      if (text) {
                        const amount = parseFloat(text);
                        const reward = amount * (stakingPeriod / 365) * 0.1; // 10% 연간 수익률
                        setStakingReward(reward);
                      }
                    }}
                    keyboardType="numeric"
                  />
                  <ThemedText style={styles.stakingTokenLabel}>YOY</ThemedText>
                </View>
                <ThemedText style={styles.stakingBalance}>
                  {language === 'en' ? 'Available' : '사용 가능'}: {userBalances['YOY']?.toLocaleString() || 0} YOY
                </ThemedText>
              </View>

              <View style={styles.stakingInputGroup}>
                <ThemedText style={styles.stakingLabel}>
                  {language === 'en' ? 'Staking Period' : '스테이킹 기간'}
                </ThemedText>
                <View style={styles.stakingPeriodContainer}>
                  {[7, 30, 90, 180, 365].map((period) => (
                    <TouchableOpacity
                      key={period}
                      style={[
                        styles.stakingPeriodButton,
                        stakingPeriod === period && styles.stakingPeriodButtonActive
                      ]}
                      onPress={() => handleStakingPeriodChange(period)}
                    >
                      <ThemedText style={[
                        styles.stakingPeriodButtonText,
                        stakingPeriod === period && styles.stakingPeriodButtonTextActive
                      ]}>
                        {period}일
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {stakingReward > 0 && (
                <View style={styles.stakingRewardContainer}>
                  <ThemedText style={styles.stakingRewardLabel}>
                    {language === 'en' ? 'Expected Reward' : '예상 보상'}
                  </ThemedText>
                  <ThemedText style={styles.stakingRewardAmount}>
                    {stakingReward.toFixed(6)} YOY
                  </ThemedText>
                </View>
              )}

              <TouchableOpacity style={styles.stakingButton} onPress={startStaking}>
                <ThemedText style={styles.stakingButtonText}>
                  {language === 'en' ? 'Start Staking' : '스테이킹 시작'}
                </ThemedText>
              </TouchableOpacity>
            </View>

            {/* 활성 스테이킹 목록 */}
            {activeStakings.length > 0 && (
              <View style={styles.activeStakingsContainer}>
                <ThemedText style={styles.activeStakingsTitle}>
                  {language === 'en' ? 'Active Stakings' : '활성 스테이킹'}
                </ThemedText>
                {activeStakings.map((staking) => (
                  <View key={staking.id} style={styles.stakingItem}>
                    <View style={styles.stakingItemHeader}>
                      <ThemedText style={styles.stakingItemAmount}>
                        {staking.amount.toLocaleString()} YOY
                      </ThemedText>
                      <ThemedText style={styles.stakingItemStatus}>
                        {staking.status === 'active' ? '활성' : '완료'}
                      </ThemedText>
                    </View>
                    <ThemedText style={styles.stakingItemPeriod}>
                      {staking.period}일 스테이킹
                    </ThemedText>
                    <ThemedText style={styles.stakingItemDate}>
                      시작: {staking.startDate.toLocaleDateString('ko-KR')}
                    </ThemedText>
                    <ThemedText style={styles.stakingItemDate}>
                      종료: {staking.endDate.toLocaleDateString('ko-KR')}
                    </ThemedText>
                    <ThemedText style={styles.stakingItemReward}>
                      예상 보상: {staking.reward.toFixed(6)} YOY
                    </ThemedText>
                  </View>
                ))}
              </View>
            )}

            {/* 스테이킹 정보 */}
            <View style={styles.stakingInfoCard}>
              <ThemedText style={styles.stakingInfoTitle}>스테이킹 정보</ThemedText>
              <ThemedText style={styles.stakingInfoText}>
                • 연간 수익률: 10%{'\n'}
                • 최소 스테이킹 기간: 7일{'\n'}
                • 최대 스테이킹 기간: 365일{'\n'}
                • 스테이킹 중에는 토큰을 사용할 수 없습니다{'\n'}
                • 보상은 스테이킹 종료 시 지급됩니다
              </ThemedText>
            </View>
          </View>
        )}

        {/* 토큰 선택 모달 */}
        <Modal visible={showTokenSelector} transparent animationType="fade" onRequestClose={() => setShowTokenSelector(false)}>
          <View style={styles.tokenSelectorModal}>
            <View style={styles.tokenSelectorContent}>
              <View style={styles.tokenSelectorHeader}>
                <ThemedText style={styles.tokenSelectorTitle}>
                  {language === 'en' ? 'Select Token' : '토큰 선택'}
                </ThemedText>
                <TouchableOpacity 
                  style={styles.tokenSelectorClose}
                  onPress={() => setShowTokenSelector(false)}
                >
                  <ThemedText style={styles.tokenSelectorCloseText}>✕</ThemedText>
                </TouchableOpacity>
              </View>
              
              <View style={styles.tokenSelectorInfo}>
                <ThemedText style={styles.tokenSelectorInfoText}>
                  {language === 'en' ? 'YOY must be included in Uniswap swap' : 'Uniswap 스왑에는 YOY 토큰이 포함되어야 합니다'}
                </ThemedText>
              </View>
              
              <ScrollView style={styles.tokenList} showsVerticalScrollIndicator={false}>
                {availableTokens.map((token) => (
                  <TouchableOpacity
                    key={token.symbol}
                    style={[
                      styles.tokenItem,
                      (selectingToken === 'from' ? uniswap.swapState.fromToken : uniswap.swapState.toToken) === token.symbol && styles.tokenItemSelected
                    ]}
                    onPress={() => selectToken(token.symbol)}
                  >
                    <View style={styles.tokenItemContent}>
                      <ThemedText style={styles.tokenSymbol}>{token.symbol}</ThemedText>
                      <ThemedText style={styles.tokenName}>{token.name}</ThemedText>
                    </View>
                    <ThemedText style={styles.tokenBalance}>
                      {userBalances[token.symbol]?.toLocaleString() || 0}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* 거래 상세 모달 */}
        <Modal
          visible={!!selectedTx}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedTx(null)}
        >
          <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'center', alignItems:'center' }}>
            <View style={{ width:'88%', backgroundColor:'#121212', borderRadius:12, padding:16 }}>
              <ThemedText style={{ fontSize:18, fontWeight:'700', marginBottom:8 }}>
                {language==='en' ? 'Transaction Detail' : '거래 상세'}
              </ThemedText>
              {selectedTx && (
                <>
                  <ThemedText style={{ color:'#bbb', marginBottom:4 }}>
                    {language==='en' ? 'Time' : '시간'}: {selectedTx.timestamp || selectedTx.time || selectedTx.createdAt}
                  </ThemedText>
                  <ThemedText style={{ color:'#bbb', marginBottom:4 }}>
                    {language==='en' ? 'Status' : '상태'}: {selectedTx.success ? (language==='en'?'Success':'성공') : (selectedTx.success===false ? (language==='en'?'Failed':'실패') : 'Pending')}
                  </ThemedText>
                  <ThemedText style={{ color:'#bbb', marginBottom:4 }}>
                    {language==='en' ? 'Pair' : '코인'}: {(selectedTx.fromToken||'—')}/{(selectedTx.toToken||'—')}
                  </ThemedText>
                  <ThemedText style={{ color:'#bbb', marginBottom:4 }}>
                    {language==='en' ? 'Amount' : '수량'}: {(selectedTx.fromAmount||0)} → {(selectedTx.toAmount||0)}
                  </ThemedText>
                  <TouchableOpacity
                    onPress={() => {
                      const h = selectedTx.transactionHash || selectedTx.txHash;
                      if (h) {
                        try { Linking.openURL(`https://etherscan.io/tx/${h}`); } catch {}
                      }
                    }}
                    disabled={!selectedTx.transactionHash && !selectedTx.txHash}
                  >
                    <ThemedText style={{ color:'#4da3ff', marginBottom:8 }} numberOfLines={1}>
                      Tx: {selectedTx.transactionHash || selectedTx.txHash || '—'}
                    </ThemedText>
                  </TouchableOpacity>
                  <View style={{ flexDirection:'row', justifyContent:'flex-end', marginTop:8 }}>
                    <TouchableOpacity onPress={() => setSelectedTx(null)} style={{ paddingVertical:10, paddingHorizontal:14, backgroundColor:'#1e1e1e', borderRadius:8 }}>
                      <ThemedText style={{ color:'#fff' }}>{language==='en' ? 'Close' : '닫기'}</ThemedText>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </View>
        </Modal>

        <View style={{ height: 28 }} />
      </ScrollView>
      {!!toastText && (
        <Animated.View style={{ position:'absolute', left:16, right:16, bottom:16, transform:[{ translateY: toastY }], zIndex: 9999 }}>
          <View style={{ backgroundColor:'#0b0b0b', borderWidth:1, borderColor: toastColor, borderRadius:10, paddingVertical:10, paddingHorizontal:12, alignItems:'center' }}>
            <ThemedText style={{ color:'#fff', fontWeight:'700' }}>{toastText}</ThemedText>
          </View>
        </Animated.View>
      )}
      
      <HamburgerMenu visible={menuOpen} onClose={() => setMenuOpen(false)} avatarUri={avatarUri} />
      <ProfileSheet 
        visible={profileOpen} 
        onClose={() => setProfileOpen(false)} 
        onSaved={async (uri) => {
          setAvatarUri(uri);
          setProfileUpdated(prev => !prev); // 프로필 업데이트 상태 토글
          
          // username도 다시 로드
          if (currentUser?.uid) {
            const info = await AsyncStorage.getItem(`u:${currentUser.uid}:profile.info`);
            if (info) {
              try {
                const parsedInfo = JSON.parse(info);
                setUsername(parsedInfo.username || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User');
              } catch {
                setUsername(currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User');
              }
            }
          }
        }} 
      />
    </ThemedView>
  );
}

export default function PaymentsScreen() {
  if (WEB_TRADE_BLOCKED || IOS_APP_STORE_SHELF || !(SWAP_ENABLED && ORDER_ENABLED && STAKING_ENABLED)) {
    return <Redirect href="/(tabs)/dashboard" />;
  }
  return <PaymentsScreenContent />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 0,
    paddingBottom: 66, // 16 + 50 (하단바 높이)
    paddingTop: 0,
    backgroundColor: '#0C0C0C',
  },
  scrollView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  topTabContainer: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
    marginHorizontal: 16,
    marginTop: 4,
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#3A3A3A',
    marginBottom: 12,
  },
  topTab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 0,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  topTabActive: {
    borderBottomColor: '#FFD700',
  },
  topTabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  topTabTextActive: {
    color: '#FFD700',
    fontSize: 16,
  },
  tabContent: {
    paddingHorizontal: 16,
  },
  sectionHeader: {
    marginTop: 12,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#A8A8A8',
  },
  swapContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  swapInputContainer: {
    marginBottom: 16,
  },
  swapInputHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  swapInputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  maxButton: {
    fontSize: 12,
    color: '#FFD700',
    fontWeight: '600',
  },
  swapRate: {
    fontSize: 12,
    color: '#A8A8A8',
  },
  swapBalance: {
    fontSize: 12,
    color: '#A8A8A8',
    marginTop: 8,
  },
  amountInputContainer: {
    flex: 1,
    marginRight: 12,
  },
  usdValue: {
    fontSize: 12,
    color: '#A8A8A8',
    marginTop: 4,
  },
  tokenButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tokenLogo: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
    backgroundColor: '#0A0A0A'
  },
  tokenArrow: {
    fontSize: 10,
    color: '#A8A8A8',
    marginLeft: 4,
  },
  swapInfoContainer: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  swapInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  swapInfoLabel: {
    fontSize: 14,
    color: '#A8A8A8',
  },
  swapInfoValue: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  swapInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
  },
  swapAmountInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginRight: 12,
  },
  tokenButton: {
    backgroundColor: '#3a3a3a',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 80,
    alignItems: 'center',
  },
  tokenButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  swapArrowContainer: {
    alignItems: 'center',
    marginVertical: 8,
  },
  swapArrow: {
    backgroundColor: '#4b2bb3',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapArrowText: {
    fontSize: 20,
    color: '#FFFFFF',
  },
  swapButton: {
    backgroundColor: '#FFD700',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  swapButtonDisabled: {
    backgroundColor: '#3a3a3a',
  },
  swapButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  swapResultCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#6a4cff',
  },
  swapResultTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  swapResultContent: {
    marginBottom: 16,
  },
  swapResultText: {
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 8,
  },
  swapResultHash: {
    fontSize: 12,
    color: '#A8A8A8',
    marginBottom: 4,
  },
  swapResultTime: {
    fontSize: 12,
    color: '#A8A8A8',
  },
  closeResultButton: {
    backgroundColor: '#3a3a3a',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  closeResultButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
  },
  swapHistoryCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  historyTableContainer: {
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    paddingVertical: 8,
    marginTop: 8,
  },
  historyHeaderRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#2A2A2A',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  historyHeaderCell: {
    fontSize: 12,
    fontWeight: '700',
    color: '#CCCCCC',
    textAlign: 'center',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  historyCell: {
    color: '#EEE',
    fontSize: 12,
    textAlign: 'center',
  },
  historyHashCell: {
    color: '#9ad0ff',
  },
  stateBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
  },
  stateBadgeText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '700',
  },
  badgeSuccess: { backgroundColor: '#29d399' },
  badgeFail: { backgroundColor: '#ff6b6b' },
  badgePending: { backgroundColor: '#ffd54f' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    width: '90%',
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
  },
  modalTitle: { color: '#fff', fontWeight: '800', marginBottom: 10 },
  modalRow: { color: '#ddd', marginBottom: 6 },
  link: { color: '#9ad0ff', textDecorationLine: 'underline' },
  modalClose: { marginTop: 10, alignSelf: 'flex-end', backgroundColor: '#FFD700', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  modalCloseText: { color: '#000', fontWeight: '700' },
  swapHistoryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  swapHistoryList: {
    maxHeight: 200,
  },
  swapHistoryItem: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  swapHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  swapHistoryStatus: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  swapHistoryTime: {
    fontSize: 12,
    color: '#A8A8A8',
  },
  swapHistoryText: {
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  swapHistoryHash: {
    fontSize: 12,
    color: '#A8A8A8',
    marginBottom: 4,
  },
  swapHistoryFee: {
    fontSize: 12,
    color: '#FFD700',
  },
  swapInfoCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  swapInfoTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  swapInfoText: {
    fontSize: 14,
    color: '#A8A8A8',
    lineHeight: 20,
  },
  assetsContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  paymentBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  paymentTitle: { color:'#fff', fontWeight:'700', marginBottom: 12, fontSize: 16 },
  paymentRow: { flexDirection:'row', alignItems:'center', marginBottom: 10 },
  paymentLabel: { width: 100, color:'#ccc' },
  paymentInput: { flex:1, backgroundColor:'#111', color:'#fff', borderWidth:1, borderColor:'#333', borderRadius:8, paddingHorizontal:10, paddingVertical:8 },
  paymentBtn: { backgroundColor:'#374151', borderRadius:8, paddingHorizontal:12, paddingVertical:10 },
  paymentBtnText: { color:'#fff', fontWeight:'700' },
  paymentUri: { color:'#9ad0ff', marginTop: 8, fontSize:12 },
  assetsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  assetsList: {
    maxHeight: 300,
  },
  assetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  assetInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  assetIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  assetIconText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  assetDetails: {
    flex: 1,
  },
  assetSymbol: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  assetName: {
    fontSize: 12,
    color: '#A8A8A8',
    marginTop: 2,
  },
  assetAmount: {
    alignItems: 'flex-end',
    marginRight: 16,
  },
  assetBalance: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  assetValue: {
    fontSize: 12,
    color: '#A8A8A8',
    marginTop: 2,
  },
  assetActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    backgroundColor: '#FFD700',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  actionButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  actionButtonTextSecondary: {
    color: '#FFD700',
  },
  quickActionsContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  quickActionsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  quickActionItem: {
    width: '22%',
    alignItems: 'center',
  },
  quickActionIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  quickActionIconText: {
    fontSize: 20,
  },
  quickActionLabel: {
    fontSize: 12,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  recentTransactionsContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  recentTransactionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  recentTransactionsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  viewAllButton: {
    fontSize: 14,
    color: '#FFD700',
    fontWeight: '600',
  },
  recentTransactionsList: {
    maxHeight: 200,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3a3a3a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  transactionIconText: {
    fontSize: 16,
  },
  transactionDetails: {
    flex: 1,
  },
  transactionDescription: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  transactionTime: {
    fontSize: 12,
    color: '#A8A8A8',
    marginTop: 2,
  },
  transactionAmount: {
    alignItems: 'flex-end',
  },
  transactionAmountText: {
    fontSize: 14,
    fontWeight: '600',
  },
  transactionAmountPositive: {
    color: '#4CD964',
  },
  transactionAmountNegative: {
    color: '#FF3B30',
  },
  networkInfoContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  networkInfoTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  networkInfoCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
  },
  networkInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  networkInfoLabel: {
    fontSize: 14,
    color: '#A8A8A8',
  },
  networkInfoValue: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  stakingContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  stakingInputGroup: {
    marginBottom: 20,
  },
  stakingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  stakingInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
  },
  stakingAmountInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginRight: 12,
  },
  stakingTokenLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#A8A8A8',
  },
  stakingBalance: {
    fontSize: 12,
    color: '#A8A8A8',
    marginTop: 8,
  },
  stakingPeriodContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  stakingPeriodButton: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  stakingPeriodButtonActive: {
    backgroundColor: '#FFD700',
  },
  stakingPeriodButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  stakingPeriodButtonTextActive: {
    color: '#000',
  },
  stakingRewardContainer: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  stakingRewardLabel: {
    fontSize: 14,
    color: '#A8A8A8',
    marginBottom: 4,
  },
  stakingRewardAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFD700',
  },
  stakingButton: {
    backgroundColor: '#FFD700',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  stakingButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  activeStakingsContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  activeStakingsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  stakingItem: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  stakingItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  stakingItemAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  stakingItemStatus: {
    fontSize: 12,
    color: '#4CD964',
    backgroundColor: '#1a3a1a',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  stakingItemPeriod: {
    fontSize: 14,
    color: '#A8A8A8',
    marginBottom: 4,
  },
  stakingItemDate: {
    fontSize: 12,
    color: '#A8A8A8',
    marginBottom: 2,
  },
  stakingItemReward: {
    fontSize: 14,
    color: '#FFD700',
    marginTop: 8,
  },
  stakingInfoCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  stakingInfoTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  stakingInfoText: {
    fontSize: 14,
    color: '#A8A8A8',
    lineHeight: 20,
  },
  tokenSelectorModal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  tokenSelectorContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
  },
  tokenSelectorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  tokenSelectorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  tokenSelectorClose: {
    backgroundColor: '#3a3a3a',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenSelectorCloseText: {
    fontSize: 18,
    color: '#FFFFFF',
  },
  tokenSelectorInfo: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  tokenSelectorInfoText: {
    fontSize: 12,
    color: '#A8A8A8',
    textAlign: 'center',
  },
  tokenList: {
    maxHeight: 300,
  },
  tokenItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  tokenItemSelected: {
    backgroundColor: '#3a3a3a',
  },
  tokenItemContent: {
    flex: 1,
  },
  tokenSymbol: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  tokenName: {
    fontSize: 12,
    color: '#A8A8A8',
    marginTop: 2,
  },
  tokenBalance: {
    fontSize: 14,
    color: '#A8A8A8',
  },
});