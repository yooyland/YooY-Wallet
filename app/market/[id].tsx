import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { mockOrderbook } from '@/data/orderbook';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Button, FlatList, StyleSheet, TextInput, View } from 'react-native';

export default function MarketDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ob = useMemo(() => mockOrderbook(id ?? 'YOY-USD'), [id]);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [type, setType] = useState<'limit' | 'market'>('limit');
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submitOrder = async () => {
    const priceNum = type === 'market' ? undefined : Number(price);
    const amountNum = Number(amount);
    if (Number.isNaN(amountNum) || amountNum <= 0) {
      Alert.alert('Invalid amount');
      return;
    }
    if (type === 'limit' && (Number.isNaN(priceNum) || (priceNum as number) <= 0)) {
      Alert.alert('Invalid price');
      return;
    }
    setSubmitting(true);
    try {
      // Mock submit
      await new Promise((r) => setTimeout(r, 600));
      Alert.alert('Order placed', `${side.toUpperCase()} ${amountNum} @ ${type === 'market' ? 'MARKET' : priceNum}`);
      setAmount('');
      if (type === 'limit') setPrice('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: id }} />
      <View style={styles.section}>
        <ThemedText type="subtitle">Orderbook</ThemedText>
        <View style={styles.orderbookRow}>
          <FlatList
            style={{ flex: 1, marginRight: 8 }}
            data={ob.bids}
            keyExtractor={(i) => `b-${i.price}`}
            renderItem={({ item }) => (
              <View style={styles.level}><ThemedText>{new Intl.NumberFormat(undefined, { maximumFractionDigits: 8 }).format(item.price)}</ThemedText><ThemedText>{new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(item.size)}</ThemedText></View>
            )}
          />
          <FlatList
            style={{ flex: 1, marginLeft: 8 }}
            data={ob.asks}
            keyExtractor={(i) => `a-${i.price}`}
            renderItem={({ item }) => (
              <View style={styles.level}><ThemedText>{new Intl.NumberFormat(undefined, { maximumFractionDigits: 8 }).format(item.price)}</ThemedText><ThemedText>{new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(item.size)}</ThemedText></View>
            )}
          />
        </View>
      </View>
      <View style={styles.section}>
        <ThemedText type="subtitle">Recent Trades</ThemedText>
        <FlatList
          data={ob.trades}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => (
            <View style={styles.tradeRow}>
              <ThemedText>{item.time.slice(11, 19)}</ThemedText>
              <ThemedText>{new Intl.NumberFormat(undefined, { maximumFractionDigits: 8 }).format(item.price)}</ThemedText>
              <ThemedText>{new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(item.size)}</ThemedText>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, opacity: 0.2 }} />}
        />
      </View>
      <View style={styles.section}>
        <ThemedText type="subtitle">Place Order</ThemedText>
        <View style={styles.toggleRow}>
          <Button title={side === 'buy' ? 'BUY ✔' : 'BUY'} onPress={() => setSide('buy')} />
          <View style={{ width: 8 }} />
          <Button title={side === 'sell' ? 'SELL ✔' : 'SELL'} color={'#e67e22'} onPress={() => setSide('sell')} />
        </View>
        <View style={{ height: 8 }} />
        <View style={styles.toggleRow}>
          <Button title={type === 'limit' ? 'Limit ✔' : 'Limit'} onPress={() => setType('limit')} />
          <View style={{ width: 8 }} />
          <Button title={type === 'market' ? 'Market ✔' : 'Market'} onPress={() => setType('market')} />
        </View>
        {type === 'limit' ? (
          <TextInput
            style={styles.input}
            placeholder="Price"
            keyboardType="numeric"
            value={price}
            onChangeText={setPrice}
          />
        ) : null}
        <TextInput
          style={styles.input}
          placeholder="Amount"
          keyboardType="numeric"
          value={amount}
          onChangeText={setAmount}
        />
        <Button title={submitting ? 'Submitting…' : 'Submit Order'} onPress={submitOrder} disabled={submitting} />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  section: { marginBottom: 16 },
  orderbookRow: { flexDirection: 'row' },
  level: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  tradeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  toggleRow: { flexDirection: 'row' },
  input: { borderWidth: 1, borderColor: '#444', borderRadius: 8, padding: 10, marginVertical: 8 },
});


