import { StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function TodoScreen() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">To-Do</ThemedText>
      <ThemedText>일정관리(달력), 일기, 가계부 자리표시자</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
});


