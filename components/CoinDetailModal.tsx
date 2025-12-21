import { formatTransactionAmount, useTransactionStore } from '@/src/stores/transaction.store';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
    Dimensions,
    Image,
    Modal,
    ScrollView,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface CoinDetailModalProps {
  visible: boolean;
  onClose: () => void;
  coin: {
    symbol: string;
    name: string;
    amount: number;
    valueUSD: number;
    logo?: string;
  };
  onNavigateToWallet?: (tab: 'send' | 'receive', coinSymbol: string) => void;
  onNavigateToMarket?: (coinSymbol: string) => void;
}

interface TransactionDetail {
  id: string;
  type: string;
  amount: number;
  timestamp: string;
  description: string;
  status: string;
  hash?: string;
  fee?: number;
}

const { height } = Dimensions.get('window');

export default function CoinDetailModal({ visible, onClose, coin, onNavigateToWallet, onNavigateToMarket }: CoinDetailModalProps) {
  const insets = useSafeAreaInsets();
  const { getTransactions } = useTransactionStore();
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionDetail | null>(null);

  // 코인 로고 가져오기
  const getCoinLogoSource = (symbol: string) => {
    if (symbol === 'YOY') {
      return require('@/assets/images/yoy.png');
    }
    return { uri: `https://static.upbit.com/logos/${symbol}.png` };
  };

  // 보내기 핸들러
  const handleSend = () => {
    if (onNavigateToWallet) {
      onNavigateToWallet('send', coin.symbol);
      onClose();
    }
  };

  // 받기 핸들러
  const handleReceive = () => {
    if (onNavigateToWallet) {
      onNavigateToWallet('receive', coin.symbol);
      onClose();
    }
  };

  // 코인정보 보기 핸들러
  const handleViewCoinInfo = () => {
    if (onNavigateToMarket) {
      onNavigateToMarket(coin.symbol);
      onClose();
    }
  };

  // 해당 코인과 관련된 거래 내역 필터링 및 잔액 계산
  const { coinTransactions, calculatedBalance } = useMemo(() => {
    const allTransactions = getTransactions();
    const filteredTransactions = allTransactions.filter(transaction => {
      // 스왑 거래의 경우 fromToken 또는 toToken이 해당 코인인지 확인
      if (transaction.type === 'swap') {
        return transaction.fromToken === coin.symbol || transaction.toToken === coin.symbol;
      }
      // 다른 거래의 경우 symbol이 해당 코인인지 확인
      return transaction.symbol === coin.symbol;
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // 거래 내역을 기반으로 최종 잔액 계산
    let balance = coin.amount; // 초기 잔액
    
    filteredTransactions.forEach(transaction => {
      if (transaction.type === 'swap') {
        // 새로운 스왑 거래 구조: symbol과 change 사용
        if (transaction.symbol === coin.symbol && transaction.change !== undefined) {
          balance += transaction.change;
        }
        // 기존 스왑 거래 구조도 지원
        else if (transaction.fromToken === coin.symbol && transaction.fromAmount) {
          balance -= transaction.fromAmount;
        }
        if (transaction.toToken === coin.symbol && transaction.toAmount) {
          balance += transaction.toAmount;
        }
      } else if (transaction.type === 'reward' || transaction.type === 'daily_reward' || transaction.type === 'event_reward') {
        // 보상 거래: 해당 토큰 증가
        if (transaction.amount) {
          balance += transaction.amount;
        }
      } else if (transaction.type === 'staking') {
        // 스테이킹 거래: 해당 토큰 차감
        if (transaction.amount) {
          balance -= transaction.amount;
        }
      }
    });

    return {
      coinTransactions: filteredTransactions,
      calculatedBalance: balance
    };
  }, [getTransactions, coin.symbol, coin.amount]);

  // 거래 상세 정보 표시
  const showTransactionDetail = (transaction: any) => {
    const detail: TransactionDetail = {
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount || transaction.fromAmount || transaction.toAmount || 0,
      timestamp: transaction.timestamp,
      description: transaction.description,
      status: transaction.status || 'completed',
      hash: transaction.transactionHash,
      fee: transaction.fee,
    };
    setSelectedTransaction(detail);
  };

  // 거래 타입별 한국어 표시
  const getTransactionTypeText = (type: string) => {
    const typeMap: Record<string, string> = {
      'swap': '스왑',
      'reward': '보상',
      'daily_reward': '일일 보상',
      'event_reward': '이벤트 보상',
      'staking': '스테이킹',
      'deposit': '입금',
      'withdrawal': '출금',
      'transfer': '전송',
      'trade': '거래',
      'penalty': '페널티',
      'fee': '수수료',
      'refund': '환불',
      'airdrop': '에어드랍',
      'burn': '소각',
      'mint': '발행',
    };
    return typeMap[type] || type;
  };

  // 거래 방향 표시 (스왑의 경우)
  const getTransactionDirection = (transaction: any) => {
    if (transaction.type === 'swap') {
      if (transaction.fromToken === coin.symbol) {
        return `→ ${transaction.toToken}`;
      } else if (transaction.toToken === coin.symbol) {
        return `← ${transaction.fromToken}`;
      }
    }
    return '';
  };

  // 거래 금액 표시
  const getTransactionAmount = (transaction: any) => {
    if (transaction.type === 'swap') {
      if (transaction.fromToken === coin.symbol) {
        return `-${formatTransactionAmount(transaction.fromAmount, coin.symbol)}`;
      } else if (transaction.toToken === coin.symbol) {
        return `+${formatTransactionAmount(transaction.toAmount, coin.symbol)}`;
      }
    }
    return `${transaction.amount > 0 ? '+' : ''}${formatTransactionAmount(transaction.amount, coin.symbol)}`;
  };

  // 거래 타입별 색상
  const getTypeColor = (type: string) => {
    const colorMap: Record<string, string> = {
      'swap': '#9C27B0',
      'reward': '#4CAF50',
      'daily_reward': '#4CAF50',
      'event_reward': '#4CAF50',
      'staking': '#FF9800',
      'deposit': '#2196F3',
      'withdrawal': '#F44336',
      'transfer': '#607D8B',
      'trade': '#795548',
      'penalty': '#F44336',
      'fee': '#FF5722',
      'refund': '#4CAF50',
      'airdrop': '#E91E63',
      'burn': '#424242',
      'mint': '#3F51B5',
    };
    return colorMap[type] || '#FFFFFF';
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      statusBarTranslucent
      hardwareAccelerated
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, { paddingTop: Math.max(insets.top, 8), paddingBottom: Math.max(insets.bottom, 8) }]}>
        <View style={[styles.modalContainer, { width: '92%', alignSelf:'center', maxHeight: Math.min(height * 0.92, height - (insets.top + insets.bottom) - 12) }]}>
          {/* 헤더: 코인이름 (코인정보)  X */}
           <View style={styles.header}>
             <View style={styles.coinInfo}>
               <Image source={getCoinLogoSource(coin.symbol)} style={styles.coinLogo} />
               <View style={styles.coinDetails}>
                <View style={{ flexDirection:'row', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                 <Text style={styles.coinName}>{coin.name}</Text>
                  <TouchableOpacity onPress={handleViewCoinInfo} style={styles.infoInline}>
                    <Ionicons name="information-circle" size={16} color="#FFD700" />
                    <Text style={styles.infoInlineText}>코인정보</Text>
                  </TouchableOpacity>
                </View>
                 <Text style={styles.coinSymbol}>{coin.symbol}</Text>
               </View>
             </View>
             <TouchableOpacity onPress={onClose} style={styles.closeButton}>
               <Ionicons name="close" size={24} color="#fff" />
             </TouchableOpacity>
           </View>

          {/* 보내기/받기 버튼 (상단) */}
          <View style={styles.topActions}>
            <TouchableOpacity style={[styles.topActionBtn, { backgroundColor:'#FFD700' }]} onPress={handleSend}>
              <Ionicons name="arrow-up" size={18} color="#000" />
              <Text style={[styles.topActionText, { color:'#000' }]}>보내기</Text>
               </TouchableOpacity>
            <TouchableOpacity style={[styles.topActionBtn, { backgroundColor:'#333', borderWidth:1, borderColor:'#555' }]} onPress={handleReceive}>
              <Ionicons name="arrow-down" size={18} color="#FFD700" />
              <Text style={styles.topActionText}>받기</Text>
               </TouchableOpacity>
           </View>

          {/* 본문 스크롤 영역 */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
           {/* 거래 내역 */}
           <View style={styles.transactionSection}>
             <Text style={styles.sectionTitle}>거래 내역</Text>
             <View style={styles.txTable}>
               <View style={styles.txHeader}>
                 <Text style={[styles.txHeadText, {flex:1.2}]}>Time</Text>
                 <Text style={[styles.txHeadText, {flex:1.1}]}>Type</Text>
                 <Text style={[styles.txHeadText, {flex:1}]}>Amount</Text>
                 <Text style={[styles.txHeadText, {flex:0.9}]}>Status</Text>
                 <Text style={[styles.txHeadText, {flex:1.4, textAlign:'right'}]}>Memo</Text>
               </View>
                <ScrollView style={styles.transactionList} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                 {coinTransactions.length === 0 ? (
                   <View style={styles.emptyState}>
                     <Text style={styles.emptyText}>거래 내역이 없습니다</Text>
                   </View>
                 ) : (
                   coinTransactions.map((transaction) => (
                     <TouchableOpacity
                       key={transaction.id}
                       style={styles.txRow}
                       onPress={() => showTransactionDetail(transaction)}
                     >
                       <Text style={[styles.txCell, {flex:1.2}]} numberOfLines={1}>
                         {(() => {
                           try {
                             // ISO 형식 또는 기존 형식 모두 처리
                             let date: Date;
                             if (transaction.timestamp.includes('T')) {
                               // ISO 형식인 경우
                               date = new Date(transaction.timestamp);
                             } else {
                               // 기존 한국어 형식인 경우
                               date = new Date(transaction.timestamp.replace(/\./g, '-'));
                             }
                             
                             if (isNaN(date.getTime())) {
                               // 여전히 유효하지 않은 경우 현재 날짜 사용
                               date = new Date();
                             }
                             
                             return date.toLocaleDateString('ko-KR', { 
                               month: 'short', 
                               day: 'numeric' 
                             });
                           } catch (error) {
                             // 오류 발생 시 현재 날짜 사용
                             return new Date().toLocaleDateString('ko-KR', { 
                               month: 'short', 
                               day: 'numeric' 
                             });
                           }
                         })()}
                       </Text>
                       <Text style={[styles.txCell, {flex:1.1, color: getTypeColor(transaction.type)}]} numberOfLines={1}>
                         {transaction.type.toUpperCase()}
                       </Text>
                       <Text style={[styles.txCell, {flex:1}]} numberOfLines={1}>
                         {transaction.type === 'swap' 
                           ? transaction.swapType === 'from' 
                             ? `-${transaction.amount || transaction.change || 0} ${transaction.symbol || ''}`
                             : `+${transaction.amount || transaction.change || 0} ${transaction.symbol || ''}`
                           : `${transaction.amount || transaction.change || 0} ${transaction.symbol || ''}`
                         }
                       </Text>
                       <Text style={[styles.txCell, {flex:0.9, color: (transaction.status || 'completed')==='completed'?'#4CAF50':(transaction.status || 'completed')==='failed'?'#F44336':'#FFD54F'}]} numberOfLines={1}>
                         {transaction.status || 'completed'}
                       </Text>
                       <View style={[styles.txMemoCell, {flex:1.4}]}>
                         <Text style={[styles.txCell, {textAlign:'right', maxWidth: 80, color: transaction.memo ? '#FFFFFF' : '#FFD700'}]} numberOfLines={1} ellipsizeMode="tail">
                           {transaction.memo ? transaction.memo : '✎'}
                         </Text>
                       </View>
                     </TouchableOpacity>
                   ))
                 )}
               </ScrollView>
             </View>
           </View>
          </ScrollView>

          {/* 거래 상세 모달 */}
          {selectedTransaction && (
            <Modal
              visible={!!selectedTransaction}
              animationType="fade"
              transparent={true}
              onRequestClose={() => setSelectedTransaction(null)}
            >
              <View style={styles.detailOverlay}>
                <View style={styles.detailModal}>
                  <View style={styles.detailHeader}>
                    <Text style={styles.detailTitle}>거래 상세</Text>
                    <TouchableOpacity onPress={() => setSelectedTransaction(null)}>
                      <Ionicons name="close" size={24} color="#fff" />
                    </TouchableOpacity>
                  </View>
                  
                  <ScrollView style={styles.detailContent}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>거래 유형</Text>
                      <Text style={styles.detailValue}>
                        {getTransactionTypeText(selectedTransaction.type)}
                      </Text>
                    </View>
                    
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>금액</Text>
                      <Text style={styles.detailValue}>
                        {formatTransactionAmount(selectedTransaction.amount, coin.symbol)}
                      </Text>
                    </View>
                    
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>시간</Text>
                      <Text style={styles.detailValue}>
                        {selectedTransaction.timestamp}
                      </Text>
                    </View>
                    
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>상태</Text>
                      <Text style={[styles.detailValue, { color: '#4CAF50' }]}>
                        {selectedTransaction.status === 'completed' ? '완료' : selectedTransaction.status}
                      </Text>
                    </View>
                    
                    {selectedTransaction.hash && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>트랜잭션 해시</Text>
                        <Text style={styles.detailValue}>
                          {selectedTransaction.hash}
                        </Text>
                      </View>
                    )}
                    
                    {selectedTransaction.fee && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>수수료</Text>
                        <Text style={styles.detailValue}>
                          {selectedTransaction.fee}%
                        </Text>
                      </View>
                    )}
                    
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>설명</Text>
                      <Text style={styles.detailValue}>
                        {selectedTransaction.description}
                      </Text>
                    </View>
                  </ScrollView>
                </View>
              </View>
            </Modal>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = {
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    maxHeight: height * 0.9,
    paddingBottom: 20,
    width: '92%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  coinInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
   coinLogo: {
     width: 50,
     height: 50,
     borderRadius: 25,
     marginRight: 15,
   },
  coinDetails: {
    flex: 1,
  },
  coinName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  coinSymbol: {
    fontSize: 14,
    color: '#888',
    marginTop: 2,
  },
   infoInline: { flexDirection:'row', alignItems:'center', backgroundColor:'#2A2A2A', paddingHorizontal:8, paddingVertical:4, borderRadius:999, gap:4 },
   infoInlineText: { color:'#FFD700', fontSize:12, fontWeight:'600' },
   closeButton: {
     padding: 5,
   },
   topActions: { paddingHorizontal:20, paddingTop:12, paddingBottom:6, flexDirection:'row', gap:12 },
   topActionBtn: { flex:1, borderRadius:10, paddingVertical:12, alignItems:'center', justifyContent:'center', flexDirection:'row', gap:8 },
   topActionText: { color:'#FFD700', fontSize:14, fontWeight:'700' },
  transactionSection: {
    flex: 1,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 15,
  },
   transactionList: {
     flex: 1,
   },
   emptyState: {
     alignItems: 'center',
     justifyContent: 'center',
     paddingVertical: 40,
   },
   emptyText: {
     color: '#888',
     fontSize: 16,
   },
   txTable: { 
     marginTop: 8, 
     borderWidth: 1, 
     borderColor: '#2A2A2A', 
     borderRadius: 10, 
     overflow: 'hidden' 
   },
   txHeader: { 
     flexDirection: 'row', 
     backgroundColor: '#121212', 
     paddingVertical: 8, 
     paddingHorizontal: 12 
   },
   txHeadText: { 
     color: '#AAAAAA', 
     fontWeight: '700', 
     fontSize: 12 
   },
   txRow: { 
     flexDirection: 'row', 
     backgroundColor: '#0E0E0E', 
     paddingVertical: 8, 
     paddingHorizontal: 12, 
     borderTopWidth: 1, 
     borderTopColor: '#1A1A1A' 
   },
   txCell: { 
     color: '#FFFFFF', 
     fontSize: 12 
   },
   txMemoCell: { 
     justifyContent: 'center', 
     alignItems: 'flex-end' 
   },
  detailOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  detailModal: {
    backgroundColor: '#1a1a1a',
    borderRadius: 15,
    width: '100%',
    maxHeight: '80%',
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  detailContent: {
    padding: 20,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  detailLabel: {
    fontSize: 14,
    color: '#888',
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    color: '#fff',
    flex: 2,
    textAlign: 'right',
  },
};
