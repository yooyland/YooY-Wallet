import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, TouchableOpacity, View, Text } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { router } from 'expo-router';
import { createNewWallet, importWalletFromMnemonic } from '@/src/wallet/wallet';

export default function WalletSetupScreen() {
  const [tab, setTab] = useState<'create'|'import'>('create');
  const [mnemonic, setMnemonic] = useState<string>('');
  const [generated, setGenerated] = useState<string>('');
  const [checked, setChecked] = useState<boolean>(false);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(true);

  const words = useMemo(() => (generated || '').split(' ').filter(Boolean), [generated]);

  const handleCreate = async () => {
    try {
      setBusy(true);
      const w = await createNewWallet();
      setGenerated(w.mnemonic);
      setChecked(false);
      setRevealed(true);
      Alert.alert('지갑 생성', '니모닉을 안전한 곳에 적어두세요.');
    } catch (e: any) {
      Alert.alert('오류', String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const handleCopyMnemonic = async () => {
    try {
      if (!generated) return;
      // 네이티브 우선: expo-clipboard, 실패 시 웹 clipboard
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Clipboard = require('expo-clipboard');
        await Clipboard.setStringAsync(generated);
      } catch {
        // 웹
        await (navigator as any)?.clipboard?.writeText?.(generated);
      }
      Alert.alert('복사됨', '니모닉을 클립보드에 복사했습니다.\n절대 타인과 공유하지 마세요.');
    } catch {
      Alert.alert('오류', '복사에 실패했습니다.');
    }
  };

  const handleContinue = () => {
    if (!generated || !checked) {
      Alert.alert('확인 필요', '니모닉을 백업하고 체크박스를 선택해주세요.');
      return;
    }
    router.replace('/(tabs)/dashboard');
  };

  const handleImport = async () => {
    try {
      setBusy(true);
      const norm = mnemonic.trim().toLowerCase();
      if (norm.split(/\s+/).length < 12) {
        Alert.alert('형식 오류', '12/24 단어 니모닉을 입력하세요.');
        return;
      }
      await importWalletFromMnemonic(norm);
      Alert.alert('완료', '지갑을 복구했습니다.');
      router.replace('/(tabs)/dashboard');
    } catch (e: any) {
      Alert.alert('오류', String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText style={styles.title}>Wallet Setup</ThemedText>
      </View>
      <View style={styles.tabRow}>
        <TouchableOpacity onPress={()=>setTab('create')} style={[styles.tabBtn, tab==='create' && styles.tabActive]}><ThemedText style={styles.tabText}>Create</ThemedText></TouchableOpacity>
        <TouchableOpacity onPress={()=>setTab('import')} style={[styles.tabBtn, tab==='import' && styles.tabActive]}><ThemedText style={styles.tabText}>Import</ThemedText></TouchableOpacity>
      </View>
      {tab==='create' ? (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <TouchableOpacity onPress={handleCreate} style={[styles.primaryBtn,{ opacity: busy?0.6:1 }]} disabled={busy}>
            <ThemedText style={styles.primaryText}>{generated ? 'Regenerate' : 'Create Wallet'}</ThemedText>
          </TouchableOpacity>
          {!!generated && (
            <>
              <View style={styles.mnemonicCard}>
                <View style={styles.mnemonicHeader}>
                  <ThemedText style={styles.mnemonicTitle}>니모닉 백업</ThemedText>
                  <View style={{ flexDirection:'row', gap:8 }}>
                    <TouchableOpacity onPress={()=>setRevealed(v=>!v)} style={styles.smallBtn}>
                      <ThemedText style={styles.smallBtnText}>{revealed ? '숨기기' : '보이기'}</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleCopyMnemonic} style={styles.smallBtn}>
                      <ThemedText style={styles.smallBtnText}>복사</ThemedText>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.wordsGrid}>
                  {words.map((w, i) => (
                    <View key={`${i}_${w}`} style={styles.wordItem}>
                      <View style={styles.wordIndex}><Text style={styles.wordIndexText}>{i+1}</Text></View>
                      <Text style={styles.wordText}>{revealed ? w : '•••••'}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.warningText}>
                  이 단어들은 비수탁 지갑의 유일한 복구 수단입니다. 절대 타인과 공유하지 마세요.
                </Text>
              </View>
              <TouchableOpacity onPress={()=>setChecked(!checked)} style={styles.checkRow}>
                <View style={[styles.checkbox, checked && styles.checkboxOn]} />
                <ThemedText style={styles.checkText}>I wrote it down</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleContinue} style={[styles.primaryBtn,{ backgroundColor:'#16A34A', opacity: checked?1:0.5 }]} disabled={!checked}>
                <ThemedText style={styles.primaryText}>Continue</ThemedText>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <ThemedText style={styles.label}>Mnemonic (12/24 words)</ThemedText>
          <TextInput
            style={styles.input}
            value={mnemonic}
            onChangeText={setMnemonic}
            placeholder="example word ... (space separated)"
            placeholderTextColor="#666"
            autoCapitalize="none"
            multiline
          />
          <TouchableOpacity onPress={handleImport} style={[styles.primaryBtn,{ opacity: busy?0.6:1 }]} disabled={busy}>
            <ThemedText style={styles.primaryText}>Import Wallet</ThemedText>
          </TouchableOpacity>
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:'#0D0D0D' },
  header: { padding: 16, borderBottomWidth:1, borderBottomColor:'#1E1E1E' },
  title: { color:'#FFD700', fontWeight:'900', fontSize:18 },
  tabRow: { flexDirection:'row', gap:8, padding: 16, paddingBottom: 0 },
  tabBtn: { flex:1, borderWidth:1, borderColor:'#2A2A2A', paddingVertical:10, borderRadius:8, alignItems:'center', backgroundColor:'#111' },
  tabActive: { borderColor:'#FFD700' },
  tabText: { color:'#E5E7EB', fontWeight:'800' },
  primaryBtn: { backgroundColor:'#FFD700', paddingVertical:12, borderRadius:10, alignItems:'center', marginTop:12 },
  primaryText: { color:'#0D0D0D', fontWeight:'900' },
  // 새 니모닉 카드 디자인
  mnemonicCard: { backgroundColor:'#0F0F0F', borderWidth:1, borderColor:'#2A2A2A', padding:12, borderRadius:12, marginTop:12 },
  mnemonicHeader: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:8 },
  mnemonicTitle: { color:'#EDEDED', fontWeight:'900' },
  wordsGrid: { flexDirection:'row', flexWrap:'wrap', gap:8, marginTop:6 },
  wordItem: { flexDirection:'row', alignItems:'center', backgroundColor:'#151515', borderWidth:1, borderColor:'#2A2A2A', paddingHorizontal:10, paddingVertical:8, borderRadius:10 },
  wordIndex: { width:18, height:18, borderRadius:9, backgroundColor:'#FFD700', alignItems:'center', justifyContent:'center', marginRight:6 },
  wordIndexText: { color:'#0C0C0C', fontWeight:'900', fontSize:11 },
  wordText: { color:'#E5E7EB', fontWeight:'700' },
  smallBtn: { paddingHorizontal:10, paddingVertical:6, borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, backgroundColor:'#111' },
  smallBtnText: { color:'#FFD700', fontWeight:'800', fontSize:12 },
  warningText: { color:'#A3A3A3', fontSize:12, marginTop:10, lineHeight:18 },
  checkRow: { flexDirection:'row', alignItems:'center', gap:8, marginTop:12 },
  checkbox: { width:18, height:18, borderRadius:4, borderWidth:1, borderColor:'#444' },
  checkboxOn: { backgroundColor:'#22C55E', borderColor:'#22C55E' },
  checkText: { color:'#CFCFCF', fontWeight:'700' },
  label: { color:'#9CA3AF', marginBottom:6 },
  input: { backgroundColor:'#0F0F0F', borderWidth:1, borderColor:'#2A2A2A', color:'#FFFFFF', borderRadius:8, padding:10, minHeight:90, textAlignVertical:'top' },
});


