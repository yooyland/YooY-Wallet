import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { StyleSheet, TouchableOpacity, View, TextInput, ScrollView } from 'react-native';
import { router, Redirect, useRootNavigationState } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';
import { getAdminRoleByEmail } from '@/constants/admins';
import { CustomCoin, loadCustomCoins, removeCustomCoin as removeCustom, saveCustomCoins, upsertCustomCoin } from '@/lib/customCoins';
import { getEthChainIdHex, getYoyContractAddress, setEthChainIdHex, setYoyContractAddress } from '@/lib/config';
import { useMarket } from '@/contexts/MarketContext';

export default function SystemPage() {
  const { currentUser } = useAuth();
  const role = currentUser?.email ? getAdminRoleByEmail(currentUser.email) : null;
  const isSuperAdmin = role === 'super_admin';
  const navState = useRootNavigationState();
  if (!navState?.key) return null;
  if (!isSuperAdmin) return <Redirect href="/(tabs)/dashboard" />;

  type Coin = { symbol: string; name: string; priceUSD: number };
  const [coins, setCoins] = useState<Coin[]>([]);
  const [newSymbol, setNewSymbol] = useState('');
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState<string>('');
  const [yoyDraft, setYoyDraft] = useState<string>('0');
  const [draftBySymbol, setDraftBySymbol] = useState<Record<string, string>>({});
  const [yoyContract, setYoyContract] = useState<string>('');
  const [ethChainIdHex, setEthChainIdHexState] = useState<string>('');
  const [monitorHttp, setMonitorHttp] = useState<string>('');
  const [monitorWs, setMonitorWs] = useState<string>('');
  // Advanced ERC-20 fields for new coins
  const [newChainId, setNewChainId] = useState<string>('');
  const [newContract, setNewContract] = useState<string>('');
  const [newDecimals, setNewDecimals] = useState<string>('');

  const { setYoyPriceUSD } = useMarket();

  const load = useCallback(async () => {
    const list = await loadCustomCoins();
    const normalized = list.map(c => ({ symbol: c.symbol.toUpperCase(), name: c.name || c.symbol, priceUSD: Number(c.priceUSD||0) }));
    if (!normalized.find(c => c.symbol === 'YOY')) normalized.unshift({ symbol:'YOY', name:'YOY', priceUSD: 0 });
    setCoins(normalized);
  }, []);

  const save = useCallback(async (list: Coin[]) => {
    setCoins(list);
    const toPersist: CustomCoin[] = list.map(c => ({ symbol: c.symbol, name: c.name, priceUSD: c.priceUSD, markets: ['USDT','KRW'] }));
    await saveCustomCoins(toPersist);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Sync drafts when coins change
  useEffect(() => {
    const yoy = coins.find(c => c.symbol === 'YOY');
    setYoyDraft(String(yoy?.priceUSD ?? 0));
    const map: Record<string,string> = {};
    coins.forEach(c => { map[c.symbol] = String(c.priceUSD ?? 0); });
    setDraftBySymbol(map);
  }, [coins]);

  useEffect(() => {
    (async () => {
      setYoyContract((await getYoyContractAddress()) || '');
      setEthChainIdHexState((await getEthChainIdHex()) || '');
      const { getEthMonitorHttp, getEthMonitorWs } = await import('@/lib/config');
      setMonitorHttp(await getEthMonitorHttp());
      setMonitorWs(await getEthMonitorWs());
    })();
  }, []);

  const updatePriceUSD = (symbol: string, priceUSD: number) => {
    const list = coins.map(c => c.symbol === symbol ? { ...c, priceUSD } : c);
    save(list);
    if (symbol === 'YOY') void setYoyPriceUSD(priceUSD);
  };

  const adjustPercent = (_symbol: string, _pct: number) => {};

  const addCoin = () => {
    const sym = newSymbol.trim().toUpperCase();
    const nm = newName.trim() || sym;
    const priceVal = Number(newPrice);
    if (!sym) return;
    if (Number.isNaN(priceVal)) return;
    if (coins.some(c => c.symbol === sym)) {
      updatePriceUSD(sym, priceVal);
    } else {
      const dec = Number(newDecimals);
      const entry: any = { symbol: sym, name: nm || sym, priceUSD: priceVal };
      if (newChainId) entry.chainIdHex = newChainId;
      if (newContract) entry.contract = newContract;
      if (!Number.isNaN(dec)) entry.decimals = dec;
      save([entry, ...coins]);
    }
    setNewSymbol(''); setNewName(''); setNewPrice(''); setNewChainId(''); setNewContract(''); setNewDecimals('');
  };

  const removeCoin = (symbol: string) => {
    if (symbol === 'YOY') return; // YOY는 필수
    save(coins.filter(c => c.symbol !== symbol));
  };



  const yoy = coins.find(c => c.symbol === 'YOY');

  const applyAll = async () => {
    const next = coins.map(c => {
      const draft = c.symbol === 'YOY' ? yoyDraft : (draftBySymbol[c.symbol] ?? String(c.priceUSD));
      const price = Number(draft);
      return { ...c, priceUSD: Number.isFinite(price) && price >= 0 ? price : 0 };
    });
    await save(next);
    const yy = next.find(x => x.symbol === 'YOY');
    if (yy) await setYoyPriceUSD(yy.priceUSD);
    // Save YOY contract and chain
    if (yoyContract) await setYoyContractAddress(yoyContract);
    if (ethChainIdHex) await setEthChainIdHex(ethChainIdHex);
    // Save monitor endpoints
    const { setEthMonitorHttp, setEthMonitorWs } = await import('@/lib/config');
    if (monitorHttp) await setEthMonitorHttp(monitorHttp);
    if (monitorWs) await setEthMonitorWs(monitorWs);
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={()=>router.back()} style={styles.backBtn}><ThemedText style={styles.backText}>←</ThemedText></TouchableOpacity>
        <ThemedText style={styles.headerTitle}>System</ThemedText>
      </View>

      {/* YOY 가격 (USD 기준) */}
      <View style={styles.card}>
        <ThemedText style={styles.sectionTitle}>YOY 가격(USD)</ThemedText>
        <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
          <TextInput
            style={[styles.input, { flex:1 }]}
            value={yoyDraft}
            onChangeText={setYoyDraft}
            onEndEditing={()=> updatePriceUSD('YOY', Number(yoyDraft) || 0)}
            keyboardType="decimal-pad"
            {...({ inputMode: 'decimal' } as any)}
            placeholder="0.0"
            placeholderTextColor="#666"
          />
        </View>
      </View>

      {/* YOY ERC20 설정 */}
      <View style={styles.card}>
        <ThemedText style={styles.sectionTitle}>YOY ERC-20 설정</ThemedText>
        <TextInput
          style={[styles.input, { marginBottom:8 }]}
          value={yoyContract}
          onChangeText={setYoyContract}
          placeholder="컨트랙트 주소 (0x...)"
          placeholderTextColor="#666"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          value={ethChainIdHex}
          onChangeText={setEthChainIdHexState}
          placeholder="이더리움 체인ID (예: 0x1 메인넷, 0x5 고얼리)"
          placeholderTextColor="#666"
          autoCapitalize="none"
        />
      </View>

      {/* 입금 모니터 설정 */}
      <View style={styles.card}>
        <ThemedText style={styles.sectionTitle}>입금 모니터 (HTTP/WS)</ThemedText>
        <TextInput
          style={[styles.input, { marginBottom:8 }]}
          value={monitorHttp}
          onChangeText={setMonitorHttp}
          placeholder="모니터 HTTP (예: http://192.168.0.10:3002)"
          placeholderTextColor="#666"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          value={monitorWs}
          onChangeText={setMonitorWs}
          placeholder="모니터 WS (예: ws://192.168.0.10:3002)"
          placeholderTextColor="#666"
          autoCapitalize="none"
        />
      </View>

      {/* 신규 코인 등록 */}
      <View style={styles.card}>
        <ThemedText style={styles.sectionTitle}>코인 등록</ThemedText>
        <View style={{ flexDirection:'row', gap:8 }}>
          <TextInput style={[styles.input, { flex:0.9 }]} value={newSymbol} onChangeText={setNewSymbol} placeholder="심볼 (예: BTC)" placeholderTextColor="#666" autoCapitalize="characters" />
          <TextInput style={[styles.input, { flex:1.1 }]} value={newName} onChangeText={setNewName} placeholder="이름 (예: Bitcoin)" placeholderTextColor="#666" />
        </View>
        <View style={{ flexDirection:'row', gap:8 }}>
          <TextInput style={[styles.input, { flex:1 }]} value={newPrice} onChangeText={setNewPrice} placeholder="USD 가격" placeholderTextColor="#666" keyboardType="decimal-pad" {...({ inputMode: 'decimal' } as any)} />
          <TouchableOpacity style={styles.button} onPress={addCoin}><ThemedText style={styles.buttonText}>등록/업데이트</ThemedText></TouchableOpacity>
        </View>
        <View style={{ height:8 }} />
        <ThemedText style={[styles.sectionTitle, { fontSize:12, color:'#9CA3AF' }]}>선택: ERC‑20 정보(송금/입금 자동화)</ThemedText>
        <View style={{ flexDirection:'row', gap:8 }}>
          <TextInput style={[styles.input, { flex:0.7 }]} value={newChainId} onChangeText={setNewChainId} placeholder="체인ID (예: 0x1)" placeholderTextColor="#666" autoCapitalize="none" />
          <TextInput style={[styles.input, { flex:1.3 }]} value={newContract} onChangeText={setNewContract} placeholder="컨트랙트 주소 (0x…)" placeholderTextColor="#666" autoCapitalize="none" />
          <TextInput style={[styles.input, { width:80 }]} value={newDecimals} onChangeText={setNewDecimals} placeholder="dec" placeholderTextColor="#666" keyboardType="number-pad" />
        </View>
      </View>

      {/* 등록된 코인 */}
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {coins.map(c => (
          <View key={c.symbol} style={styles.card}>
            <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
              <ThemedText style={styles.coinTitle}>{c.symbol} · {c.name}</ThemedText>
              {c.symbol !== 'YOY' && (
                <TouchableOpacity style={[styles.smallBtn, { backgroundColor:'#2A2A2A', borderColor:'#333' }]} onPress={()=>removeCoin(c.symbol)}>
                  <ThemedText style={{ color:'#E5E7EB', fontWeight:'800' }}>삭제</ThemedText>
                </TouchableOpacity>
              )}
            </View>
            <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginTop:8 }}>
              <TextInput
                style={[styles.input, { flex:1 }]}
                value={draftBySymbol[c.symbol] ?? String(c.priceUSD)}
                onChangeText={(v)=> setDraftBySymbol(prev => ({ ...prev, [c.symbol]: v }))}
                onEndEditing={()=> updatePriceUSD(c.symbol, Number(draftBySymbol[c.symbol] ?? c.priceUSD) || 0)}
                keyboardType="decimal-pad"
                {...({ inputMode: 'decimal' } as any)}
              />
            </View>
          </View>
        ))}
      </ScrollView>

      {/* 적용 버튼 */}
      <View style={{ paddingHorizontal:16, paddingBottom:16 }}>
        <TouchableOpacity style={styles.applyButton} onPress={applyAll}>
          <ThemedText style={styles.applyText}>적용</ThemedText>
        </TouchableOpacity>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:'#0D0D0D' },
  headerRow: { flexDirection:'row', alignItems:'center', gap:8, padding:16, paddingBottom:8 },
  backBtn: { width:32, height:32, borderRadius:6, borderWidth:1, borderColor:'#2A2A2A', alignItems:'center', justifyContent:'center', backgroundColor:'#111' },
  backText: { color:'#FFD700', fontWeight:'900', fontSize:16 },
  headerTitle: { color:'#FFFFFF', fontWeight:'900', fontSize:18 },
  card: { backgroundColor:'#111', borderWidth:1, borderColor:'#1E1E1E', borderRadius:12, padding:12, marginHorizontal:16, marginBottom:12 },
  sectionTitle: { color:'#FFFFFF', fontWeight:'800', marginBottom:8 },
  input: { backgroundColor:'#0F0F0F', borderWidth:1, borderColor:'#2A2A2A', color:'#FFFFFF', borderRadius:8, paddingHorizontal:10, paddingVertical:8 },
  button: { backgroundColor:'#FFD700', borderRadius:8, paddingVertical:10, paddingHorizontal:16, alignItems:'center', justifyContent:'center' },
  buttonText: { color:'#000', fontWeight:'900' },
  coinTitle: { color:'#FFFFFF', fontWeight:'800', fontSize:16 },
  smallBtn: { backgroundColor:'#1A1A1A', borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingVertical:8, paddingHorizontal:12 },
  smallBtnText: { color:'#E5E7EB', fontWeight:'800' },
  applyButton: { backgroundColor:'#FFD700', borderRadius:10, paddingVertical:14, alignItems:'center' },
  applyText: { color:'#0D0D0D', fontWeight:'900' },
});


