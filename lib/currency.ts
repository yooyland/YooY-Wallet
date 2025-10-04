import AsyncStorage from '@react-native-async-storage/async-storage';

export type SupportedCurrency = 'USD' | 'KRW' | 'JPY' | 'CNY' | 'EUR';

export interface ExchangeRates {
  USD: number;
  KRW: number;
  JPY: number;
  CNY: number;
  EUR: number;
}

const CACHE_KEY = 'currency.rates';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

let cachedRates: ExchangeRates | null = null;
let lastFetch = 0;

export async function getExchangeRates(): Promise<ExchangeRates> {
  const now = Date.now();
  
  // Return cached rates if still valid
  if (cachedRates && (now - lastFetch) < CACHE_DURATION) {
    return cachedRates;
  }

  try {
    // Try to get from cache first
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached) {
      const { rates, timestamp } = JSON.parse(cached);
      if (now - timestamp < CACHE_DURATION) {
        cachedRates = rates;
        lastFetch = timestamp;
        return rates;
      }
    }

    // Fetch fresh rates
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    const data = await response.json();
    
    const rates: ExchangeRates = {
      USD: 1,
      KRW: data.rates.KRW,
      JPY: data.rates.JPY,
      CNY: data.rates.CNY,
      EUR: data.rates.EUR,
    };

    // Cache the rates
    cachedRates = rates;
    lastFetch = now;
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ rates, timestamp: now }));

    return rates;
  } catch (error) {
    console.warn('Failed to fetch exchange rates:', error);
    
    // Return cached rates or fallback
    if (cachedRates) {
      return cachedRates;
    }
    
    // Fallback rates (approximate)
    return {
      USD: 1,
      KRW: 1300,
      JPY: 150,
      CNY: 7.2,
      EUR: 0.85,
    };
  }
}

export function formatCurrency(
  amount: number,
  currency: SupportedCurrency = 'USD',
  rates?: ExchangeRates
): string {
  const convertedAmount = rates ? amount * rates[currency] : amount;
  
  const options: Intl.NumberFormatOptions = {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: currency === 'JPY' ? 0 : 2,
    maximumFractionDigits: currency === 'JPY' ? 0 : 8,
  };

  return new Intl.NumberFormat('en-US', options).format(convertedAmount);
}

export function formatCrypto(amount: number, symbol: string = 'YOY'): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  }).format(amount) + ` ${symbol}`;
}

export function formatPercentage(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}
