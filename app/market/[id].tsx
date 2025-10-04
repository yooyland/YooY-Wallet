import React, { useState, useEffect } from 'react';
import { 
  View, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  TextInput, 
  Pressable, 
  ScrollView,
  Dimensions,
  Alert
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { mockMarkets } from '@/data/markets';
import { formatCurrency, getExchangeRates } from '@/lib/currency';

const { width } = Dimensions.get('window');

export default function MarketDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [selectedTab, setSelectedTab] = useState('주문');
  const [orderType, setOrderType] = useState('지정');
  const [orderSide, setOrderSide] = useState('매수');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [totalAmount, setTotalAmount] = useState('0');
  const [availableBalance, setAvailableBalance] = useState('0');
  const [rates, setRates] = useState<any>(null);

  // 코인 정보 찾기
  const coin = mockMarkets.find(m => m.id === id);
  
  if (!coin) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>코인을 찾을 수 없습니다.</ThemedText>
      </ThemedView>
    );
  }

  useEffect(() => {
    (async () => {
      const exchangeRates = await getExchangeRates();
      setRates(exchangeRates);
    })();
  }, []);

  // 호가 데이터 (mock)
  const orderBookData = {
    sellOrders: [
      { price: 174363000, quantity: 0.002, percentage: 0.52 },
      { price: 174362000, quantity: 0.087, percentage: 0.52 },
      { price: 174353000, quantity: 0.606, percentage: 0.51 },
      { price: 174352000, quantity: 0.007, percentage: 0.51 },
      { price: 174343000, quantity: 0.004, percentage: 0.51 },
    ],
    buyOrders: [
      { price: 174326000, quantity: 0.036, percentage: 0.50 },
      { price: 174325000, quantity: 0.032, percentage: 0.50 },
      { price: 174324000, quantity: 0.001, percentage: 0.50 },
      { price: 174314000, quantity: 0.032, percentage: 0.49 },
      { price: 174300000, quantity: 0.001, percentage: 0.48 },
    ]
  };

  // 체결 데이터 (mock)
  const tradeData = [
    { time: '20:54:39', price: 174323000, quantity: 0.00630000 },
    { time: '20:54:38', price: 174323000, quantity: 0.00780000 },
    { time: '20:54:36', price: 174316000, quantity: 0.00757679 },
    { time: '20:54:36', price: 174324000, quantity: 0.00064688 },
    { time: '20:54:35', price: 174323000, quantity: 0.00050000 },
  ];

  const handleOrderSubmit = () => {
    if (!quantity || !price) {
      Alert.alert('오류', '수량과 가격을 입력해주세요.');
      return;
    }
    
    const total = parseFloat(quantity) * parseFloat(price);
    Alert.alert(
      '주문 확인', 
      `${orderSide} 주문\n수량: ${quantity}\n가격: ${price}\n총액: ${total.toLocaleString()} KRW`,
      [
        { text: '취소', style: 'cancel' },
        { text: '확인', onPress: () => {
          Alert.alert('주문 완료', '주문이 성공적으로 접수되었습니다.');
          setQuantity('');
          setPrice('');
          setTotalAmount('0');
        }}
      ]
    );
  };

  const updateTotalAmount = () => {
    if (quantity && price) {
      const total = parseFloat(quantity) * parseFloat(price);
      setTotalAmount(total.toLocaleString());
    }
  };

  useEffect(() => {
    updateTotalAmount();
  }, [quantity, price]);

  return (
    <ThemedView style={styles.container}>
      {/* 상단 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ThemedText style={styles.backIcon}>←</ThemedText>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <ThemedText style={styles.coinName}>{coin.name}({coin.base}/{coin.quote})</ThemedText>
          <ThemedText style={styles.currentPrice}>₩{coin.price.toLocaleString()}</ThemedText>
          <ThemedText style={[styles.change, { color: coin.change24hPct >= 0 ? '#FF4444' : '#00C851' }]}>
            {coin.change24hPct >= 0 ? '+' : ''}{coin.change24hPct.toFixed(2)}% ({coin.change >= 0 ? '+' : ''}{coin.change.toLocaleString()})
          </ThemedText>
        </View>
        <View style={styles.headerIcons}>
          <TouchableOpacity style={styles.headerIcon}>
            <ThemedText style={styles.iconText}>⭐</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIcon}>
            <ThemedText style={styles.iconText}>📤</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIcon}>
            <ThemedText style={styles.iconText}>🔗</ThemedText>
          </TouchableOpacity>
        </View>
      </View>

      {/* 탭 네비게이션 */}
      <View style={styles.tabContainer}>
        {['주문', '호가', '차트', '시세', '정보'].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, selectedTab === tab && styles.activeTab]}
            onPress={() => setSelectedTab(tab)}
          >
            <ThemedText style={[styles.tabText, selectedTab === tab && styles.activeTabText]}>
              {tab}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </View>

      {/* 주문 탭 */}
      {selectedTab === '주문' && (
        <View style={styles.orderContainer}>
          <View style={styles.orderBook}>
            <View style={styles.orderBookHeader}>
              <ThemedText style={styles.orderBookTitle}>호가</ThemedText>
            </View>
            
            {/* 매도 호가 */}
            <View style={styles.sellOrders}>
              {orderBookData.sellOrders.map((order, index) => (
                <View key={index} style={styles.orderRow}>
                  <ThemedText style={[styles.orderPrice, { color: '#FF4444' }]}>
                    ₩{order.price.toLocaleString()}
                  </ThemedText>
                  <ThemedText style={styles.orderQuantity}>{order.quantity}</ThemedText>
                  <ThemedText style={styles.orderPercentage}>{order.percentage}%</ThemedText>
                </View>
              ))}
            </View>

            {/* 현재가 */}
            <View style={styles.currentPriceRow}>
              <ThemedText style={styles.currentPriceText}>
                ₩{coin.price.toLocaleString()}
              </ThemedText>
            </View>

            {/* 매수 호가 */}
            <View style={styles.buyOrders}>
              {orderBookData.buyOrders.map((order, index) => (
                <View key={index} style={styles.orderRow}>
                  <ThemedText style={[styles.orderPrice, { color: '#00C851' }]}>
                    ₩{order.price.toLocaleString()}
                  </ThemedText>
                  <ThemedText style={styles.orderQuantity}>{order.quantity}</ThemedText>
                  <ThemedText style={styles.orderPercentage}>{order.percentage}%</ThemedText>
                </View>
              ))}
            </View>
          </View>

          {/* 주문 폼 */}
          <View style={styles.orderForm}>
            <View style={styles.orderTypeContainer}>
              {['지정', '시장', '예약'].map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.orderTypeButton, orderType === type && styles.activeOrderType]}
                  onPress={() => setOrderType(type)}
                >
                  <ThemedText style={[styles.orderTypeText, orderType === type && styles.activeOrderTypeText]}>
                    {type}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.balanceInfo}>
              <ThemedText style={styles.balanceText}>주문가능: {availableBalance} KRW</ThemedText>
            </View>

            <View style={styles.inputContainer}>
              <View style={styles.inputRow}>
                <ThemedText style={styles.inputLabel}>수량</ThemedText>
                <TextInput
                  style={styles.input}
                  value={quantity}
                  onChangeText={setQuantity}
                  placeholder="0"
                  placeholderTextColor="#666"
                  keyboardType="numeric"
                />
                <ThemedText style={styles.inputUnit}>가능</ThemedText>
              </View>

              <View style={styles.inputRow}>
                <ThemedText style={styles.inputLabel}>가격</ThemedText>
                <TextInput
                  style={styles.input}
                  value={price}
                  onChangeText={setPrice}
                  placeholder={coin.price.toString()}
                  placeholderTextColor="#666"
                  keyboardType="numeric"
                />
                <View style={styles.priceButtons}>
                  <TouchableOpacity style={styles.priceButton}>
                    <ThemedText style={styles.priceButtonText}>+</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.priceButton}>
                    <ThemedText style={styles.priceButtonText}>-</ThemedText>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.totalContainer}>
                <ThemedText style={styles.totalLabel}>총액</ThemedText>
                <ThemedText style={styles.totalAmount}>{totalAmount} KRW</ThemedText>
              </View>
            </View>

            <View style={styles.orderButtons}>
              <TouchableOpacity style={styles.resetButton}>
                <ThemedText style={styles.resetButtonText}>초기화</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.buyButton, orderSide === '매수' && styles.activeBuyButton]}
                onPress={() => setOrderSide('매수')}
              >
                <ThemedText style={[styles.buyButtonText, orderSide === '매수' && styles.activeBuyButtonText]}>
                  매수
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.sellButton, orderSide === '매도' && styles.activeSellButton]}
                onPress={() => setOrderSide('매도')}
              >
                <ThemedText style={[styles.sellButtonText, orderSide === '매도' && styles.activeSellButtonText]}>
                  매도
                </ThemedText>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.submitButton} onPress={handleOrderSubmit}>
              <ThemedText style={styles.submitButtonText}>
                {orderSide} 주문하기
              </ThemedText>
            </TouchableOpacity>

            <View style={styles.orderInfo}>
              <ThemedText style={styles.orderInfoText}>최소주문금액: 5,000 KRW</ThemedText>
              <ThemedText style={styles.orderInfoText}>수수료(부가세 포함): 0.05%</ThemedText>
              <ThemedText style={styles.orderInfoText}>주문유험 안내</ThemedText>
            </View>
          </View>
        </View>
      )}

      {/* 호가 탭 */}
      {selectedTab === '호가' && (
        <View style={styles.orderBookContainer}>
          <View style={styles.orderBookHeader}>
            <ThemedText style={styles.orderBookTitle}>호가</ThemedText>
          </View>
          
          <View style={styles.orderBookContent}>
            <View style={styles.sellOrders}>
              {orderBookData.sellOrders.map((order, index) => (
                <View key={index} style={styles.orderRow}>
                  <ThemedText style={[styles.orderPrice, { color: '#FF4444' }]}>
                    ₩{order.price.toLocaleString()}
                  </ThemedText>
                  <ThemedText style={styles.orderQuantity}>{order.quantity}</ThemedText>
                  <ThemedText style={styles.orderPercentage}>{order.percentage}%</ThemedText>
                </View>
              ))}
            </View>

            <View style={styles.currentPriceRow}>
              <ThemedText style={styles.currentPriceText}>
                ₩{coin.price.toLocaleString()}
              </ThemedText>
            </View>

            <View style={styles.buyOrders}>
              {orderBookData.buyOrders.map((order, index) => (
                <View key={index} style={styles.orderRow}>
                  <ThemedText style={[styles.orderPrice, { color: '#00C851' }]}>
                    ₩{order.price.toLocaleString()}
                  </ThemedText>
                  <ThemedText style={styles.orderQuantity}>{order.quantity}</ThemedText>
                  <ThemedText style={styles.orderPercentage}>{order.percentage}%</ThemedText>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.marketInfo}>
            <View style={styles.infoRow}>
              <ThemedText style={styles.infoLabel}>거래량</ThemedText>
              <ThemedText style={styles.infoValue}>2,659 BTC</ThemedText>
            </View>
            <View style={styles.infoRow}>
              <ThemedText style={styles.infoLabel}>52주최고</ThemedText>
              <ThemedText style={styles.infoValue}>₩174,995,000</ThemedText>
            </View>
            <View style={styles.infoRow}>
              <ThemedText style={styles.infoLabel}>52주최저</ThemedText>
              <ThemedText style={styles.infoValue}>₩80,635,000</ThemedText>
            </View>
            <View style={styles.infoRow}>
              <ThemedText style={styles.infoLabel}>전일종가</ThemedText>
              <ThemedText style={styles.infoValue}>₩173,460,000</ThemedText>
            </View>
            <View style={styles.infoRow}>
              <ThemedText style={styles.infoLabel}>당일고가</ThemedText>
              <ThemedText style={styles.infoValue}>₩174,774,000</ThemedText>
            </View>
            <View style={styles.infoRow}>
              <ThemedText style={styles.infoLabel}>당일저가</ThemedText>
              <ThemedText style={styles.infoValue}>₩172,673,000</ThemedText>
            </View>
          </View>
        </View>
      )}

      {/* 차트 탭 */}
      {selectedTab === '차트' && (
        <View style={styles.chartContainer}>
          <View style={styles.chartHeader}>
            <View style={styles.timeframeContainer}>
              {['초', '분', '일', '주', '월', '년'].map((timeframe) => (
                <TouchableOpacity
                  key={timeframe}
                  style={[styles.timeframeButton, timeframe === '일' && styles.activeTimeframe]}
                >
                  <ThemedText style={[styles.timeframeText, timeframe === '일' && styles.activeTimeframeText]}>
                    {timeframe}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.indicatorContainer}>
              <ThemedText style={styles.indicatorLabel}>단순 MA</ThemedText>
              <View style={styles.maButtons}>
                {['5', '10', '20', '60', '120'].map((ma) => (
                  <TouchableOpacity
                    key={ma}
                    style={[styles.maButton, ['5', '10', '20'].includes(ma) && styles.activeMaButton]}
                  >
                    <ThemedText style={[styles.maText, ['5', '10', '20'].includes(ma) && styles.activeMaText]}>
                      {ma}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
          
          <View style={styles.chartArea}>
            <View style={styles.candlestickChart}>
              <ThemedText style={styles.chartPlaceholder}>📈 캔들스틱 차트</ThemedText>
              <ThemedText style={styles.chartInfo}>2025-09-01 ~ 25-10-1</ThemedText>
            </View>
            
            <View style={styles.volumeChart}>
              <ThemedText style={styles.volumeLabel}>거래량</ThemedText>
              <View style={styles.volumeBars}>
                <View style={[styles.volumeBar, { height: 60, backgroundColor: '#00C851' }]} />
                <View style={[styles.volumeBar, { height: 40, backgroundColor: '#FF4444' }]} />
                <View style={[styles.volumeBar, { height: 80, backgroundColor: '#00C851' }]} />
                <View style={[styles.volumeBar, { height: 30, backgroundColor: '#FF4444' }]} />
                <View style={[styles.volumeBar, { height: 50, backgroundColor: '#00C851' }]} />
              </View>
              <View style={styles.volumeValues}>
                <ThemedText style={styles.volumeValue}>3,176.245</ThemedText>
                <ThemedText style={styles.volumeValue}>2,117.496</ThemedText>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* 시세 탭 */}
      {selectedTab === '시세' && (
        <View style={styles.tradeContainer}>
          <View style={styles.tradeHeader}>
            <TouchableOpacity style={styles.tradeTab}>
              <ThemedText style={styles.tradeTabText}>체결</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.tradeTab}>
              <ThemedText style={styles.tradeTabText}>일별</ThemedText>
            </TouchableOpacity>
          </View>
          
          <View style={styles.tradeTable}>
            <View style={styles.tradeTableHeader}>
              <ThemedText style={styles.tradeHeaderText}>체결시간</ThemedText>
              <ThemedText style={styles.tradeHeaderText}>체결가격(KRW)</ThemedText>
              <ThemedText style={styles.tradeHeaderText}>체결량(BTC)</ThemedText>
            </View>
            
            {tradeData.map((trade, index) => (
              <View key={index} style={styles.tradeRow}>
                <ThemedText style={styles.tradeTime}>{trade.time}</ThemedText>
                <ThemedText style={styles.tradePrice}>₩{trade.price.toLocaleString()}</ThemedText>
                <ThemedText style={styles.tradeQuantity}>{trade.quantity}</ThemedText>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* 정보 탭 */}
      {selectedTab === '정보' && (
        <View style={styles.infoContainer}>
          <View style={styles.infoHeader}>
            <TouchableOpacity style={styles.infoTab}>
              <ThemedText style={styles.infoTabText}>주요 정보</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.infoTab}>
              <ThemedText style={styles.infoTabText}>마켓 인사이트</ThemedText>
            </TouchableOpacity>
          </View>
          
          <View style={styles.coinInfo}>
            <View style={styles.coinLogo}>
              <ThemedText style={styles.coinLogoText}>{coin.base.charAt(0)}</ThemedText>
            </View>
            <ThemedText style={styles.coinFullName}>{coin.name} (Bitcoin)</ThemedText>
            <ThemedText style={styles.coinSymbol}>심볼: {coin.base}</ThemedText>
            
            <View style={styles.coinLinks}>
              <TouchableOpacity style={styles.coinLink}>
                <ThemedText style={styles.coinLinkText}>웹사이트</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.coinLink}>
                <ThemedText style={styles.coinLinkText}>블록조회</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={styles.coinLink}>
                <ThemedText style={styles.coinLinkText}>원문백서</ThemedText>
              </TouchableOpacity>
            </View>
            
            <View style={styles.coinDetails}>
              <View style={styles.detailRow}>
                <ThemedText style={styles.detailLabel}>최초발행</ThemedText>
                <ThemedText style={styles.detailValue}>2009.01.</ThemedText>
              </View>
              <View style={styles.detailRow}>
                <ThemedText style={styles.detailLabel}>총 발행한도</ThemedText>
                <ThemedText style={styles.detailValue}>21,000,000 (코인마켓캡 제공)</ThemedText>
              </View>
              <View style={styles.detailRow}>
                <ThemedText style={styles.detailLabel}>시가총액</ThemedText>
                <ThemedText style={styles.detailValue}>3434.9조원 (25.10.04. 기준)</ThemedText>
              </View>
            </View>
          </View>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1A1A1A',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backButton: {
    marginRight: 12,
  },
  backIcon: {
    color: '#FFFFFF',
    fontSize: 24,
  },
  headerInfo: {
    flex: 1,
  },
  coinName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  currentPrice: {
    color: '#FFD700',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 2,
  },
  change: {
    fontSize: 14,
    marginTop: 2,
  },
  headerIcons: {
    flexDirection: 'row',
  },
  headerIcon: {
    marginLeft: 12,
  },
  iconText: {
    color: '#FFFFFF',
    fontSize: 18,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1A',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#FFD700',
  },
  tabText: {
    color: '#CCCCCC',
    fontSize: 14,
    fontWeight: '500',
  },
  activeTabText: {
    color: '#FFD700',
    fontWeight: '600',
  },
  orderContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  orderBook: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    padding: 16,
  },
  orderBookHeader: {
    marginBottom: 12,
  },
  orderBookTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  sellOrders: {
    marginBottom: 8,
  },
  orderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  orderPrice: {
    fontSize: 12,
    fontWeight: '500',
  },
  orderQuantity: {
    color: '#CCCCCC',
    fontSize: 12,
  },
  orderPercentage: {
    color: '#999',
    fontSize: 12,
  },
  currentPriceRow: {
    backgroundColor: '#2A2A2A',
    padding: 8,
    alignItems: 'center',
    marginVertical: 4,
  },
  currentPriceText: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buyOrders: {
    marginTop: 8,
  },
  orderForm: {
    width: width * 0.4,
    backgroundColor: '#1A1A1A',
    padding: 16,
  },
  orderTypeContainer: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  orderTypeButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
    marginRight: 4,
  },
  activeOrderType: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },
  orderTypeText: {
    color: '#CCCCCC',
    fontSize: 12,
  },
  activeOrderTypeText: {
    color: '#000000',
    fontWeight: 'bold',
  },
  balanceInfo: {
    marginBottom: 16,
  },
  balanceText: {
    color: '#CCCCCC',
    fontSize: 12,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  inputLabel: {
    color: '#CCCCCC',
    fontSize: 14,
    width: 60,
  },
  input: {
    flex: 1,
    backgroundColor: '#2A2A2A',
    color: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    marginHorizontal: 8,
  },
  inputUnit: {
    color: '#999',
    fontSize: 12,
  },
  priceButtons: {
    flexDirection: 'row',
    marginLeft: 8,
  },
  priceButton: {
    backgroundColor: '#333',
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 4,
  },
  priceButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  totalLabel: {
    color: '#CCCCCC',
    fontSize: 14,
  },
  totalAmount: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
  },
  orderButtons: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  resetButton: {
    flex: 1,
    backgroundColor: '#FF4444',
    paddingVertical: 12,
    alignItems: 'center',
    marginRight: 8,
  },
  resetButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  buyButton: {
    flex: 1,
    backgroundColor: '#00C851',
    paddingVertical: 12,
    alignItems: 'center',
    marginRight: 4,
  },
  activeBuyButton: {
    backgroundColor: '#FFD700',
  },
  buyButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  activeBuyButtonText: {
    color: '#000000',
  },
  sellButton: {
    flex: 1,
    backgroundColor: '#FF4444',
    paddingVertical: 12,
    alignItems: 'center',
  },
  activeSellButton: {
    backgroundColor: '#FFD700',
  },
  sellButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  activeSellButtonText: {
    color: '#000000',
  },
  submitButton: {
    backgroundColor: '#FFD700',
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  submitButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  orderInfo: {
    marginTop: 16,
  },
  orderInfoText: {
    color: '#999',
    fontSize: 12,
    marginBottom: 4,
  },
  orderBookContainer: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  orderBookContent: {
    flex: 1,
    padding: 16,
  },
  marketInfo: {
    backgroundColor: '#1A1A1A',
    padding: 16,
    margin: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  infoLabel: {
    color: '#CCCCCC',
    fontSize: 14,
  },
  infoValue: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  tradeContainer: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  tradeHeader: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1A',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  tradeTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tradeTabText: {
    color: '#CCCCCC',
    fontSize: 14,
  },
  tradeTable: {
    flex: 1,
    padding: 16,
  },
  tradeTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1A',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  tradeHeaderText: {
    flex: 1,
    color: '#CCCCCC',
    fontSize: 12,
    fontWeight: 'bold',
  },
  tradeRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  tradeTime: {
    flex: 1,
    color: '#CCCCCC',
    fontSize: 12,
  },
  tradePrice: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 12,
  },
  tradeQuantity: {
    flex: 1,
    color: '#CCCCCC',
    fontSize: 12,
  },
  infoContainer: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  infoHeader: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1A',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  infoTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  infoTabText: {
    color: '#CCCCCC',
    fontSize: 14,
  },
  coinInfo: {
    padding: 16,
  },
  coinLogo: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  coinLogoText: {
    color: '#000000',
    fontSize: 24,
    fontWeight: 'bold',
  },
  coinFullName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  coinSymbol: {
    color: '#CCCCCC',
    fontSize: 14,
    marginBottom: 16,
  },
  coinLinks: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  coinLink: {
    marginRight: 16,
  },
  coinLinkText: {
    color: '#FFD700',
    fontSize: 14,
  },
  coinDetails: {
    backgroundColor: '#1A1A1A',
    padding: 16,
    borderRadius: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  detailLabel: {
    color: '#CCCCCC',
    fontSize: 14,
  },
  detailValue: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  chartContainer: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  chartHeader: {
    backgroundColor: '#1A1A1A',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  timeframeContainer: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  timeframeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#333',
  },
  activeTimeframe: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },
  timeframeText: {
    color: '#CCCCCC',
    fontSize: 12,
  },
  activeTimeframeText: {
    color: '#000000',
    fontWeight: 'bold',
  },
  indicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  indicatorLabel: {
    color: '#CCCCCC',
    fontSize: 12,
    marginRight: 12,
  },
  maButtons: {
    flexDirection: 'row',
  },
  maButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#333',
  },
  activeMaButton: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },
  maText: {
    color: '#CCCCCC',
    fontSize: 10,
  },
  activeMaText: {
    color: '#000000',
    fontWeight: 'bold',
  },
  chartArea: {
    flex: 1,
    padding: 16,
  },
  candlestickChart: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  chartPlaceholder: {
    color: '#FFD700',
    fontSize: 24,
    marginBottom: 8,
  },
  chartInfo: {
    color: '#CCCCCC',
    fontSize: 12,
  },
  volumeChart: {
    height: 100,
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    padding: 16,
  },
  volumeLabel: {
    color: '#CCCCCC',
    fontSize: 12,
    marginBottom: 8,
  },
  volumeBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 40,
    marginBottom: 8,
  },
  volumeBar: {
    flex: 1,
    marginHorizontal: 1,
    borderRadius: 2,
  },
  volumeValues: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  volumeValue: {
    color: '#CCCCCC',
    fontSize: 10,
  },
});