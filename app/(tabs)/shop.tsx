import { StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function ShopScreen() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Shop / NFT</ThemedText>
      <ThemedText>쇼핑몰 / NFT 자리표시자</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
});


