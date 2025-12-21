import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { ThemedText } from '@/components/themed-text';
import { useWalletConnect } from '@/contexts/WalletConnectContext';

export default function WalletConnectPanel() {
  const { state, connect, disconnect } = useWalletConnect();
  const openWallet = async (scheme: string) => {
    try {
      if (!state.uri) return;
      const url = `${scheme}://wc?uri=${encodeURIComponent(state.uri)}`;
      await Linking.openURL(url);
    } catch {}
  };
  return (
    <View style={styles.card}>
      <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
        <ThemedText style={styles.title}>WalletConnect</ThemedText>
        {state.connected ? (
          <TouchableOpacity style={[styles.btn, { backgroundColor:'#2A2A2A', borderColor:'#333' }]} onPress={disconnect}>
            <ThemedText style={[styles.btnText, { color:'#E5E7EB' }]}>연결 해제</ThemedText>
          </TouchableOpacity>
        ) : state.connecting ? (
          <TouchableOpacity style={[styles.btn, { opacity:0.7 }]} disabled>
            <ThemedText style={styles.btnText}>연결 중…</ThemedText>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.btn} onPress={connect}>
            <ThemedText style={styles.btnText}>연결</ThemedText>
          </TouchableOpacity>
        )}
      </View>
      {state.connected ? (
        <ThemedText style={styles.sub}>{state.address}</ThemedText>
      ) : (
        <>
          {state.connecting && <ThemedText style={[styles.sub, { color:'#FFD700' }]}>연결 요청을 지갑앱에서 승인해 주세요…</ThemedText>}
          {!state.connecting && <ThemedText style={styles.sub}>지갑앱으로 연결하세요(메타마스크/Trust/Rainbow 등)</ThemedText>}
          {state.uri && (
            <View style={{ marginTop:8 }}>
              <ThemedText style={styles.sub}>아래 URI를 지갑앱에서 스캔/열기</ThemedText>
              <ThemedText style={[styles.sub, { color:'#FFD700' }]} selectable numberOfLines={3}>{state.uri}</ThemedText>
              {Platform.OS !== 'web' && (
                <View style={{ flexDirection:'row', gap:8, marginTop:8, flexWrap:'wrap' }}>
                  <TouchableOpacity style={styles.smallBtn} onPress={() => openWallet('metamask')}>
                    <ThemedText style={styles.smallBtnText}>MetaMask</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.smallBtn} onPress={() => openWallet('trust')}>
                    <ThemedText style={styles.smallBtnText}>Trust</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.smallBtn} onPress={() => openWallet('rainbow')}>
                    <ThemedText style={styles.smallBtnText}>Rainbow</ThemedText>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
          {!state.uri && !state.connecting && (
            <ThemedText style={[styles.sub, { marginTop:6 }]}>‘연결’을 누르면 지갑 목록이 활성화됩니다.</ThemedText>
          )}
          {!!state.uri && !state.connecting && (
            <View style={{ flexDirection:'row', gap:8, marginTop:10, flexWrap:'wrap' }}>
              <TouchableOpacity style={[styles.smallBtn, { backgroundColor:'#2A2A2A', borderColor:'#333' }]} onPress={disconnect}>
                <ThemedText style={[styles.smallBtnText, { color:'#E5E7EB' }]}>외부 지갑 비활성화</ThemedText>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor:'#111', borderWidth:1, borderColor:'#1E1E1E', borderRadius:12, padding:12, marginBottom:12 },
  title: { color:'#FFFFFF', fontWeight:'800' },
  sub: { color:'#9CA3AF', marginTop:6 },
  btn: { backgroundColor:'#FFD700', borderRadius:8, paddingHorizontal:12, paddingVertical:8, borderWidth:1, borderColor:'#FFD700' },
  btnText: { color:'#0D0D0D', fontWeight:'900' },
  smallBtn: { backgroundColor:'#243034', borderRadius:8, paddingHorizontal:10, paddingVertical:6, borderWidth:1, borderColor:'#375A64' },
  smallBtnText: { color:'#EDEDED', fontWeight:'700', fontSize:12 },
});


