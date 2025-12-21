import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Link } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

export default function CEVScreen() {
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [chain, setChain] = useState('');
  const [contract, setContract] = useState('');
  const [officialUrl, setOfficialUrl] = useState('');
  const [whitepaper, setWhitepaper] = useState('');
  const [contact, setContact] = useState('');

  return (
    <ThemedView style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <ThemedText style={styles.title}>Coin Exchange Verification (CEV)</ThemedText>
        <ThemedText style={styles.desc}>간단한 정보로 코인 등록을 신청하세요. 제출 후 진행 단계가 안내됩니다.</ThemedText>

        <View style={styles.formRow}><ThemedText style={styles.label}>Symbol</ThemedText><TextInput value={symbol} onChangeText={setSymbol} placeholder="e.g. YOY" placeholderTextColor="#666" style={styles.input}/></View>
        <View style={styles.formRow}><ThemedText style={styles.label}>Name</ThemedText><TextInput value={name} onChangeText={setName} placeholder="e.g. YooY Land" placeholderTextColor="#666" style={styles.input}/></View>
        <View style={styles.formRow}><ThemedText style={styles.label}>Chain</ThemedText><TextInput value={chain} onChangeText={setChain} placeholder="e.g. Ethereum" placeholderTextColor="#666" style={styles.input}/></View>
        <View style={styles.formRow}><ThemedText style={styles.label}>Contract</ThemedText><TextInput value={contract} onChangeText={setContract} placeholder="0x..." placeholderTextColor="#666" style={styles.input}/></View>
        <View style={styles.formRow}><ThemedText style={styles.label}>Official Site</ThemedText><TextInput value={officialUrl} onChangeText={setOfficialUrl} placeholder="https://" placeholderTextColor="#666" style={styles.input}/></View>
        <View style={styles.formRow}><ThemedText style={styles.label}>Whitepaper</ThemedText><TextInput value={whitepaper} onChangeText={setWhitepaper} placeholder="https://" placeholderTextColor="#666" style={styles.input}/></View>
        <View style={styles.formRow}><ThemedText style={styles.label}>Contact</ThemedText><TextInput value={contact} onChangeText={setContact} placeholder="email/telegram" placeholderTextColor="#666" style={styles.input}/></View>

        <TouchableOpacity style={styles.submit}><ThemedText style={styles.submitText}>Submit</ThemedText></TouchableOpacity>

        <View style={styles.steps}>
          <ThemedText style={styles.stepTitle}>Progress</ThemedText>
          <ThemedText style={styles.stepItem}>1) Submitted</ThemedText>
          <ThemedText style={styles.stepItem}>2) Review</ThemedText>
          <ThemedText style={styles.stepItem}>3) Verification</ThemedText>
          <ThemedText style={styles.stepItem}>4) Listing & Wallet</ThemedText>
        </View>

        <Link href="/exchange" asChild><TouchableOpacity style={styles.back}><ThemedText style={styles.backText}>Back to Exchange</ThemedText></TouchableOpacity></Link>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  title: { color: '#FFF', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  desc: { color: '#CCC', fontSize: 12, marginBottom: 16 },
  formRow: { marginBottom: 10 },
  label: { color: '#FFF', marginBottom: 6 },
  input: { backgroundColor: '#1A1A1A', color: '#FFF', borderWidth: 1, borderColor: '#333', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  submit: { backgroundColor: '#FFD700', paddingVertical: 10, borderRadius: 8, alignItems: 'center', marginTop: 6 },
  submitText: { color: '#000', fontWeight: '700' },
  steps: { marginTop: 18, padding: 12, borderWidth: 1, borderColor: '#333', borderRadius: 8 },
  stepTitle: { color: '#FFF', fontWeight: '700', marginBottom: 6 },
  stepItem: { color: '#CCC', fontSize: 12, marginBottom: 2 },
  back: { marginTop: 16, alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#333' },
  backText: { color: '#FFF' },
});



