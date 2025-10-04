import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { usePreferences } from '@/contexts/PreferencesContext';
import { mockBalances } from '@/data/balances';
import { formatCurrency, getExchangeRates, formatCrypto } from '@/lib/currency';
import React, { useMemo, useState, useEffect } from 'react';
import { Alert, Button, FlatList, StyleSheet, TextInput, View } from 'react-native';

export default function WalletScreen() {
  const { currency } = usePreferences();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [symbol, setSymbol] = useState('YOY');
  const [rates, setRates] = useState<any>(null);
  const total = useMemo(() => mockBalances.reduce((s, b) => s + b.valueUSD, 0), []);

  useEffect(() => {
    (async () => {
      const exchangeRates = await getExchangeRates();
      setRates(exchangeRates);
    })();
  }, [currency]);

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Wallet</ThemedText>
      <ThemedText style={{ opacity: 0.7 }}>Total ≈ {formatCurrency(total, currency, rates)}</ThemedText>

      <View style={{ height: 12 }} />
      <FlatList
        data={mockBalances}
        keyExtractor={(b) => b.symbol}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <ThemedText type="defaultSemiBold">{item.symbol}</ThemedText>
              <ThemedText style={{ opacity: 0.7 }}>{item.name}</ThemedText>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <ThemedText>{formatCrypto(item.amount, item.symbol)}</ThemedText>
              <ThemedText style={{ opacity: 0.7 }}>{formatCurrency(item.valueUSD, currency, rates)}</ThemedText>
            </View>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, opacity: 0.2 }} />}
      />

      <View style={{ height: 16 }} />
      <ThemedText type="subtitle">Send {symbol}</ThemedText>
      <TextInput style={styles.input} placeholder="Recipient (0x...)" autoCapitalize="none" value={to} onChangeText={setTo} />
      <TextInput style={styles.input} placeholder="Amount" keyboardType="numeric" value={amount} onChangeText={setAmount} />
      <Button title="Send" onPress={() => {
        const amt = Number(amount);
        if (!to.startsWith('0x') || to.length < 10) { Alert.alert('Invalid address'); return; }
        if (Number.isNaN(amt) || amt <= 0) { Alert.alert('Invalid amount'); return; }
        Alert.alert('Submitted', `Send ${amt} ${symbol} to ${to}`);
        setTo(''); setAmount('');
      }} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  input: { borderWidth: 1, borderColor: '#444', borderRadius: 8, padding: 10, marginVertical: 8 },
});


