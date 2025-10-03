import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function ExchangeScreen() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Exchange</ThemedText>
      <View style={{ height: 8 }} />
      <ThemedText>Upbit 스타일 거래소 화면 자리표시자</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
});


