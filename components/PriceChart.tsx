import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { usePreferences } from '@/contexts/PreferencesContext';
import { getUpbitCandles } from '@/lib/upbit';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, StyleSheet, TouchableOpacity, View } from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface PriceData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PriceChartProps {
  coinSymbol: string;
  baseCurrency: string;
  currentPrice: number;
}

export default function PriceChart({ coinSymbol, baseCurrency, currentPrice }: PriceChartProps) {
  const { language } = usePreferences();
  const [priceData, setPriceData] = useState<PriceData[]>([]);
  const [selectedTimeframe, setSelectedTimeframe] = useState<'1m' | '5m' | '15m' | '1h' | '4h' | '1d'>('1h');
  const [chartType, setChartType] = useState<'candlestick' | 'line' | 'volume'>('candlestick');
  const [isLoading, setIsLoading] = useState(true);
  const [priceChange, setPriceChange] = useState({ value: 0, percentage: 0 });
  
  // 확대/축소 및 팬 기능을 위한 상태
  const [scale, setScale] = useState(1);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const [lastScale, setLastScale] = useState(1);
  const [lastTranslateX, setLastTranslateX] = useState(0);
  const [lastTranslateY, setLastTranslateY] = useState(0);
  
  // 차트 표시 범위 제어
  const [visibleStartIndex, setVisibleStartIndex] = useState(0);
  const [visibleCount, setVisibleCount] = useState(50); // 한 번에 보여줄 캔들 수
  
  // 애니메이션 값들
  const scaleValue = useRef(new Animated.Value(1)).current;
  const translateXValue = useRef(new Animated.Value(0)).current;
  const translateYValue = useRef(new Animated.Value(0)).current;
  
  // 제스처 상태를 위한 ref
  const gestureState = useRef({
    initialDistance: null as number | null,
    initialScale: 1,
    isPinching: false,
  });


  // 제스처 핸들러
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        // 제스처 시작 시 현재 값들을 저장
        setLastScale(scale);
        setLastTranslateX(translateX);
        setLastTranslateY(translateY);
        if (gestureState.current) {
          gestureState.current.isPinching = false;
        }
        
      },
      onPanResponderMove: (evt, panGestureState) => {
        const { dx, dy, numberActiveTouches } = panGestureState;
        
        
        if (numberActiveTouches === 1 && !gestureState.current?.isPinching) {
          // 단일 터치: 팬 (이동) - visibleStartIndex 제어
          const sensitivity = 2; // 이동 민감도
          const deltaIndex = Math.round(-dx / sensitivity);
          
          if (deltaIndex !== 0) {
            // 기간 제한 없이 자유롭게 이동 가능
            const newStartIndex = Math.max(0, visibleStartIndex + deltaIndex);
            setVisibleStartIndex(newStartIndex);
          }
          
          // Y축 이동은 기존대로 유지
          const newTranslateY = lastTranslateY + dy;
          const maxTranslateY = (chartHeight * scale - chartHeight) / 2;
          const clampedTranslateY = Math.max(-maxTranslateY, Math.min(maxTranslateY, newTranslateY));
          
          setTranslateY(clampedTranslateY);
          translateYValue.setValue(clampedTranslateY);
        } else if (numberActiveTouches === 2) {
          // 두 손가락: 핀치 (확대/축소)
          if (gestureState.current) {
            gestureState.current.isPinching = true;
          }
          const touches = evt.nativeEvent.touches;
          if (touches.length === 2) {
            const touch1 = touches[0];
            const touch2 = touches[1];
            
            const distance = Math.sqrt(
              Math.pow(touch2.pageX - touch1.pageX, 2) + 
              Math.pow(touch2.pageY - touch1.pageY, 2)
            );
            
            // 초기 거리 계산 (첫 번째 핀치 제스처인 경우)
            if (gestureState.current?.initialDistance === null) {
              if (gestureState.current) {
                gestureState.current.initialDistance = distance;
                gestureState.current.initialScale = lastScale;
              }
            }
            
            const scaleFactor = distance / (gestureState.current?.initialDistance || 1);
            const newScale = Math.max(0.5, Math.min(3, (gestureState.current?.initialScale || 1) * scaleFactor));
            
            // 확대/축소에 따라 표시할 캔들 수 조절
            const baseVisibleCount = 50;
            const newVisibleCount = Math.max(10, Math.min(200, Math.round(baseVisibleCount / newScale)));
            
            setScale(newScale);
            setVisibleCount(newVisibleCount);
            scaleValue.setValue(newScale);
          }
        }
      },
      onPanResponderRelease: () => {
        // 제스처 종료 시 초기 거리 리셋
        if (gestureState.current) {
          gestureState.current.initialDistance = null;
          gestureState.current.initialScale = 1;
          gestureState.current.isPinching = false;
        }
        
      },
    })
  ).current;

  // 차트 크기 설정
  const chartWidth = screenWidth;
  const chartHeight = 200; // 캔들스틱 차트 높이
  const volumeHeight = 80; // 거래량 차트 높이
  const totalHeight = chartHeight + volumeHeight;
  const padding = { top: 20, right: 0, bottom: 40, left: 0 };

  // 가격 데이터 생성 (실제로는 API에서 가져와야 함)
  const generatePriceData = (timeframe: string, count: number = 100): PriceData[] => {
    const data: PriceData[] = [];
    const now = Date.now();
    const intervalMs = getIntervalMs(timeframe);
    
    // 시드 기반 일관된 데이터 생성 (코인 심볼과 시간프레임 기반)
    const seed = coinSymbol.charCodeAt(0) + coinSymbol.charCodeAt(1) + selectedTimeframe.charCodeAt(0);
    let randomSeed = seed;
    
    const seededRandom = () => {
      randomSeed = (randomSeed * 9301 + 49297) % 233280;
      return randomSeed / 233280;
    };
    
    let basePrice = currentPrice;
    
    for (let i = count - 1; i >= 0; i--) {
      const timestamp = now - (i * intervalMs);
      const volatility = 0.02; // 2% 변동성
      const change = (seededRandom() - 0.5) * volatility;
      
      const open = basePrice;
      const close = open * (1 + change);
      const high = Math.max(open, close) * (1 + seededRandom() * 0.01);
      const low = Math.min(open, close) * (1 - seededRandom() * 0.01);
      const volume = seededRandom() * 1000000;
      
      data.push({
        timestamp,
        open: Math.round(open * 100) / 100,
        high: Math.round(high * 100) / 100,
        low: Math.round(low * 100) / 100,
        close: Math.round(close * 100) / 100,
        volume: Math.round(volume)
      });
      
      basePrice = close;
    }
    
    return data;
  };

  const getIntervalMs = (timeframe: string): number => {
    switch (timeframe) {
      case '1m': return 60 * 1000;
      case '5m': return 5 * 60 * 1000;
      case '15m': return 15 * 60 * 1000;
      case '1h': return 60 * 60 * 1000;
      case '4h': return 4 * 60 * 60 * 1000;
      case '1d': return 24 * 60 * 60 * 1000;
      default: return 60 * 60 * 1000;
    }
  };

  // 가격을 전체 표시하는 함수
  const formatPrice = (price: number): string => {
    if (price < 100) {
      return price.toFixed(5);
    } else {
      return price.toLocaleString();
    }
  };

  // 가격 데이터 로드
  useEffect(() => {
    const loadPriceData = async () => {
      setIsLoading(true);
      try {
        let data: PriceData[] = [];
        
        if (coinSymbol === 'YOY') {
          // YOY는 시뮬레이션 데이터 사용
          data = generatePriceData(selectedTimeframe);
        } else {
          // 다른 코인들은 실제 Upbit API 데이터 사용
          try {
            const market = `${coinSymbol}-${baseCurrency}`;
            
            // 시간프레임에 따라 적절한 기간의 데이터를 가져오도록 수정 (성능 최적화)
            let count: number;
            switch (selectedTimeframe) {
              case '1m': count = 200; break;   // 200분 (약 3시간 20분)
              case '5m': count = 200; break;   // 1000분 (약 16시간 40분)
              case '15m': count = 200; break;  // 3000분 (약 50시간)
              case '1h': count = 200; break;   // 200시간 (약 8일)
              case '4h': count = 200; break;   // 800시간 (약 33일)
              case '1d': count = 200; break;   // 200일
              default: count = 200;
            }
            
            const candles = await getUpbitCandles(market, selectedTimeframe, count);
            
            data = candles.map(candle => ({
              timestamp: candle.candle_date_time_kst.getTime(),
              open: candle.opening_price,
              high: candle.high_price,
              low: candle.low_price,
              close: candle.trade_price,
              volume: candle.candle_acc_trade_volume
            }));
            
            console.log(`차트 데이터 로드: ${market} ${selectedTimeframe} - ${data.length}개 캔들`);
          } catch (apiError) {
            console.error('Upbit API 호출 실패:', apiError);
            // API 실패 시 시뮬레이션 데이터 사용
            data = generatePriceData(selectedTimeframe);
          }
        }
        
        setPriceData(data);
        
        // 가격 변화 계산
        if (data.length > 1) {
          const firstPrice = data[0].close;
          const lastPrice = data[data.length - 1].close;
          const change = lastPrice - firstPrice;
          const percentage = (change / firstPrice) * 100;
          setPriceChange({ value: change, percentage });
        }
      } catch (error) {
        console.error('가격 데이터 로드 실패:', error);
        // 에러 시 시뮬레이션 데이터 사용
        const data = generatePriceData(selectedTimeframe);
        setPriceData(data);
      } finally {
        setIsLoading(false);
      }
    };

    loadPriceData();
  }, [selectedTimeframe, coinSymbol, baseCurrency]);

  // 실시간 가격 업데이트 (YOY만)
  useEffect(() => {
    if (coinSymbol !== 'YOY') return; // YOY가 아닌 경우 실시간 업데이트 비활성화
    
    const interval = setInterval(() => {
      if (priceData.length > 0) {
        const newData = [...priceData];
        const lastCandle = newData[newData.length - 1];
        const volatility = 0.001; // 0.1% 변동성
        const change = (Math.random() - 0.5) * volatility;
        
        const newClose = lastCandle.close * (1 + change);
        const newHigh = Math.max(lastCandle.high, newClose);
        const newLow = Math.min(lastCandle.low, newClose);
        
        newData[newData.length - 1] = {
          ...lastCandle,
          close: Math.round(newClose * 100) / 100,
          high: Math.round(newHigh * 100) / 100,
          low: Math.round(newLow * 100) / 100,
          volume: lastCandle.volume + Math.random() * 10000
        };
        
        setPriceData(newData);
      }
    }, 1000); // 1초마다 업데이트

    return () => clearInterval(interval);
  }, [priceData, coinSymbol]);

  // 차트 그리기 함수들
  const drawCandlestick = (ctx: any, data: PriceData, x: number, width: number, minPrice: number, maxPrice: number) => {
    const candleHeight = chartHeight - padding.top - padding.bottom;
    const priceRange = maxPrice - minPrice;
    
    const openY = padding.top + ((maxPrice - data.open) / priceRange) * candleHeight;
    const closeY = padding.top + ((maxPrice - data.close) / priceRange) * candleHeight;
    const highY = padding.top + ((maxPrice - data.high) / priceRange) * candleHeight;
    const lowY = padding.top + ((maxPrice - data.low) / priceRange) * candleHeight;
    
    const isGreen = data.close >= data.open;
    const color = isGreen ? '#02C076' : '#F23645';
    
    // 위아래 그림자 (high-low line)
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + width / 2, highY);
    ctx.lineTo(x + width / 2, lowY);
    ctx.stroke();
    
    // 캔들 바디
    const bodyTop = Math.min(openY, closeY);
    const bodyHeight = Math.abs(closeY - openY) || 1;
    
    ctx.fillStyle = color;
    ctx.fillRect(x + width * 0.1, bodyTop, width * 0.8, bodyHeight);
    
    // 캔들 테두리
    ctx.strokeStyle = color;
    ctx.strokeRect(x + width * 0.1, bodyTop, width * 0.8, bodyHeight);
  };

  const drawLineChart = (ctx: any, data: PriceData[], minPrice: number, maxPrice: number) => {
    const candleHeight = chartHeight - padding.top - padding.bottom;
    const priceRange = maxPrice - minPrice;
    const barWidth = (chartWidth - padding.left - padding.right) / data.length;
    
    ctx.strokeStyle = '#02C076';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    data.forEach((point, index) => {
      const x = padding.left + index * barWidth + barWidth / 2;
      const y = padding.top + ((maxPrice - point.close) / priceRange) * candleHeight;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
  };

  const drawVolumeChart = (ctx: any, data: PriceData[]) => {
    const volumeHeight = 100;
    const maxVolume = Math.max(...data.map(d => d.volume));
    const barWidth = (chartWidth - padding.left - padding.right) / data.length;
    
    data.forEach((point, index) => {
      const x = padding.left + index * barWidth;
      const height = (point.volume / maxVolume) * volumeHeight;
      const y = chartHeight - padding.bottom - height;
      
      const isGreen = point.close >= point.open;
      const color = isGreen ? 'rgba(2, 192, 118, 0.3)' : 'rgba(242, 54, 69, 0.3)';
      
      ctx.fillStyle = color;
      ctx.fillRect(x, y, barWidth * 0.8, height);
    });
  };

  const drawChart = () => {
    if (priceData.length === 0) return null;
    
    // 표시할 데이터 범위 계산 (기간 제한 없음)
    const endIndex = Math.min(visibleStartIndex + visibleCount, priceData.length);
    const visibleData = priceData.slice(visibleStartIndex, endIndex);
    
    // 데이터가 없는 경우 빈 배열 처리
    if (visibleData.length === 0) {
      return (
        <View style={[styles.chartContainer, { height: totalHeight }]}>
          <View style={styles.loadingContainer}>
            <ThemedText style={styles.loadingText}>
              {language === 'ko' ? '데이터가 없습니다' : 'No data available'}
            </ThemedText>
          </View>
        </View>
      );
    }
    
    const minPrice = Math.min(...visibleData.map(d => d.low));
    const maxPrice = Math.max(...visibleData.map(d => d.high));
    const barWidth = (chartWidth - padding.left - padding.right) / visibleData.length;
    
    return (
      <View style={[styles.chartContainer, { height: totalHeight }]}>
        {/* Y축 가격 라벨 */}
        <View style={[styles.yAxisLabels, { height: chartHeight }]}>
          {[maxPrice, (maxPrice + minPrice) / 2, minPrice].map((price, index) => (
            <ThemedText key={index} style={styles.yAxisLabel}>
              {formatPrice(price)}
            </ThemedText>
          ))}
        </View>
        
        {/* 캔들스틱 차트 영역 */}
        <Animated.View 
          style={[
            styles.chartArea,
            { height: chartHeight },
            {
              transform: [
                { scale: scaleValue },
                { translateX: translateXValue },
                { translateY: translateYValue },
              ],
            },
          ]}
          {...panResponder.panHandlers}
        >
          {/* 그리드 라인 */}
          <View style={styles.gridLines}>
            {[0, 0.5, 1].map((ratio, index) => (
              <View
                key={index}
                style={[
                  styles.gridLine,
                  { top: padding.top + (chartHeight - padding.top - padding.bottom) * ratio }
                ]}
              />
            ))}
          </View>
          
          {/* 캔들스틱 차트 */}
          {chartType === 'candlestick' && (
            <View style={styles.candlestickContainer}>
              {visibleData.map((data, index) => {
                const x = padding.left + index * barWidth;
                const isGreen = data.close >= data.open;
                const color = isGreen ? '#02C076' : '#F23645';
                
                const candleHeight = chartHeight - padding.top - padding.bottom;
                const priceRange = maxPrice - minPrice;
                
                const openY = padding.top + ((maxPrice - data.open) / priceRange) * candleHeight;
                const closeY = padding.top + ((maxPrice - data.close) / priceRange) * candleHeight;
                const highY = padding.top + ((maxPrice - data.high) / priceRange) * candleHeight;
                const lowY = padding.top + ((maxPrice - data.low) / priceRange) * candleHeight;
                
                return (
                  <View key={index} style={styles.candlestickWrapper}>
                    {/* 위아래 그림자 */}
                    <View
                      style={[
                        styles.candlestickShadow,
                        {
                          left: x + barWidth / 2 - 0.5,
                          top: highY,
                          height: lowY - highY,
                          backgroundColor: color
                        }
                      ]}
                    />
                    
                    {/* 캔들 바디 */}
                    <View
                      style={[
                        styles.candlestickBody,
                        {
                          left: x + barWidth * 0.1,
                          top: Math.min(openY, closeY),
                          width: barWidth * 0.8,
                          height: Math.abs(closeY - openY) || 1,
                          backgroundColor: color
                        }
                      ]}
                    />
                  </View>
                );
              })}
            </View>
          )}
          
          {/* 라인 차트 */}
          {chartType === 'line' && (
            <View style={styles.lineChartContainer}>
              <View style={styles.lineChart}>
                {visibleData.map((data, index) => {
                  const x = padding.left + index * barWidth + barWidth / 2;
                  const candleHeight = chartHeight - padding.top - padding.bottom;
                  const priceRange = maxPrice - minPrice;
                  const y = padding.top + ((maxPrice - data.close) / priceRange) * candleHeight;
                  
                  return (
                    <View
                      key={index}
                      style={[
                        styles.linePoint,
                        {
                          left: x - 2,
                          top: y - 2,
                          backgroundColor: '#02C076'
                        }
                      ]}
                    />
                  );
                })}
              </View>
            </View>
          )}
          
          {/* 볼륨 차트 */}
          {chartType === 'volume' && (
            <View style={styles.volumeChartContainer}>
              {priceData.map((data, index) => {
                const x = padding.left + index * barWidth;
                const maxVolume = Math.max(...priceData.map(d => d.volume));
                const height = (data.volume / maxVolume) * 100;
                const y = chartHeight - padding.bottom - height;
                
                const isGreen = data.close >= data.open;
                const color = isGreen ? 'rgba(2, 192, 118, 0.3)' : 'rgba(242, 54, 69, 0.3)';
                
                return (
                  <View
                    key={index}
                    style={[
                      styles.volumeBar,
                      {
                        left: x,
                        top: y,
                        width: barWidth * 0.8,
                        height: height,
                        backgroundColor: color
                      }
                    ]}
                  />
                );
              })}
            </View>
          )}
        </Animated.View>
        
        {/* 거래량 차트 */}
        <View style={[styles.volumeChartArea, { height: volumeHeight }]}>
          {visibleData.map((data, index) => {
            const x = padding.left + index * barWidth;
            const maxVolume = Math.max(...visibleData.map(d => d.volume));
            const height = (data.volume / maxVolume) * (volumeHeight - 20);
            const y = volumeHeight - height - 10;
            
            const isGreen = data.close >= data.open;
            const color = isGreen ? 'rgba(2, 192, 118, 0.6)' : 'rgba(242, 54, 69, 0.6)';
            
            return (
              <View
                key={index}
                style={[
                  styles.volumeBar,
                  {
                    left: x,
                    top: y,
                    width: barWidth * 0.8,
                    height: height,
                    backgroundColor: color
                  }
                ]}
              />
            );
          })}
        </View>
        
        {/* X축 시간 라벨 */}
        <View style={styles.xAxisLabels}>
          {visibleData.filter((_, index) => index % Math.floor(visibleData.length / 5) === 0).map((data, index) => (
            <ThemedText key={index} style={styles.xAxisLabel}>
              {new Date(data.timestamp).toLocaleTimeString(language === 'ko' ? 'ko-KR' : 'en-US', { 
                hour: '2-digit', 
                minute: '2-digit' 
              })}
            </ThemedText>
          ))}
        </View>
        
      </View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      {/* 차트 컨트롤 */}
      <View style={styles.chartControlsContainer}>
        {/* 시간 간격 선택 (왼쪽 정렬) */}
        <View style={styles.timeframeSelector}>
          {(['1m', '5m', '15m', '1h', '4h', '1d'] as const).map((timeframe) => (
            <TouchableOpacity
              key={timeframe}
              style={[
                styles.timeframeButton,
                selectedTimeframe === timeframe && styles.timeframeButtonActive
              ]}
              onPress={() => setSelectedTimeframe(timeframe)}
            >
              <ThemedText style={[
                styles.timeframeButtonText,
                selectedTimeframe === timeframe && styles.timeframeButtonTextActive
              ]}>
                {timeframe}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
        
        {/* 차트 타입 선택 (오른쪽 정렬) */}
        <View style={styles.chartTypeSelector}>
          {(['candlestick', 'line', 'volume'] as const).map((type) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.chartTypeButton,
                chartType === type && styles.chartTypeButtonActive
              ]}
              onPress={() => setChartType(type)}
            >
              <ThemedText style={[
                styles.chartTypeButtonText,
                chartType === type && styles.chartTypeButtonTextActive
              ]}>
                {type === 'candlestick' ? 
                  (language === 'ko' ? '캔들' : 'Candle') : 
                  type === 'line' ? 
                    (language === 'ko' ? '라인' : 'Line') : 
                    (language === 'ko' ? '볼륨' : 'Volume')
                }
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      
      {/* 차트 */}
      <View style={styles.chartWrapper}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ThemedText style={styles.loadingText}>차트 로딩 중...</ThemedText>
          </View>
        ) : (
          drawChart()
        )}
      </View>
      
      {/* 차트 정보 */}
      <View style={styles.chartInfo}>
        <View style={styles.infoRow}>
          <ThemedText style={styles.infoLabel}>{language === 'ko' ? '고가:' : 'High:'}</ThemedText>
          <ThemedText style={styles.infoValue}>
            {priceData.length > 0 ? Math.max(...priceData.map(d => d.high)).toLocaleString() : '-'}
          </ThemedText>
        </View>
        <View style={styles.infoRow}>
          <ThemedText style={styles.infoLabel}>{language === 'ko' ? '저가:' : 'Low:'}</ThemedText>
          <ThemedText style={styles.infoValue}>
            {priceData.length > 0 ? Math.min(...priceData.map(d => d.low)).toLocaleString() : '-'}
          </ThemedText>
        </View>
        <View style={styles.infoRow}>
          <ThemedText style={styles.infoLabel}>{language === 'ko' ? '거래량:' : 'Volume:'}</ThemedText>
          <ThemedText style={styles.infoValue}>
            {priceData.length > 0 ? priceData[priceData.length - 1].volume.toLocaleString() : '-'}
          </ThemedText>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  chartControlsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#404040',
  },
  priceInfo: {
    flex: 1,
  },
  currentPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  priceChange: {
    fontSize: 14,
    marginTop: 2,
  },
  chartControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chartTypeSelector: {
    flexDirection: 'row',
    backgroundColor: '#2A2A2A',
    borderRadius: 6,
    padding: 2,
  },
  chartTypeButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 4,
    borderRadius: 4,
  },
  chartTypeButtonActive: {
    backgroundColor: '#404040',
  },
  chartTypeButtonText: {
    fontSize: 12,
    color: '#CCCCCC',
  },
  chartTypeButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  resetButton: {
    marginLeft: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#404040',
    borderRadius: 4,
  },
  resetButtonText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  timeframeSelector: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeframeButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 4,
    borderRadius: 4,
    backgroundColor: '#2A2A2A',
  },
  timeframeButtonActive: {
    backgroundColor: '#404040',
  },
  timeframeButtonText: {
    fontSize: 12,
    color: '#CCCCCC',
  },
  timeframeButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  chartWrapper: {
    flex: 1,
    paddingVertical: 16,
  },
  chartContainer: {
    position: 'relative',
    height: 300,
  },
  yAxisLabels: {
    position: 'absolute',
    left: 8,
    top: 0,
    height: 300,
    width: 60,
    justifyContent: 'space-between',
    paddingVertical: 20,
    zIndex: 10,
  },
  yAxisLabel: {
    fontSize: 10,
    color: '#CCCCCC',
    textAlign: 'right',
  },
  chartArea: {
    position: 'relative',
    marginLeft: 0,
    height: 300,
  },
  gridLines: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#333333',
  },
  candlestickContainer: {
    position: 'relative',
    height: '100%',
  },
  candlestickWrapper: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  candlestickShadow: {
    position: 'absolute',
    width: 1,
  },
  candlestickBody: {
    position: 'absolute',
  },
  lineChartContainer: {
    position: 'relative',
    height: '100%',
  },
  lineChart: {
    position: 'relative',
    height: '100%',
  },
  linePoint: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  volumeChartContainer: {
    position: 'relative',
    height: '100%',
  },
  volumeBar: {
    position: 'absolute',
  },
  volumeChartArea: {
    position: 'relative',
    marginLeft: 0,
    borderTopWidth: 1,
    borderTopColor: '#333333',
  },
  xAxisLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginLeft: 0,
    marginTop: 8,
    paddingHorizontal: 0,
  },
  xAxisLabel: {
    fontSize: 10,
    color: '#CCCCCC',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#CCCCCC',
  },
  chartInfo: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#404040',
  },
  infoRow: {
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 12,
    color: '#CCCCCC',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
