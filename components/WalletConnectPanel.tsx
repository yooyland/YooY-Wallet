import React, { useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { ThemedText } from '@/components/themed-text';
import { useWalletConnect } from '@/contexts/WalletConnectContext';
import { router } from 'expo-router';

export default function WalletConnectPanel() {
  const { state, connect, disconnect, switchToMainnet, getChainId } = useWalletConnect();

  // 페이지 진입 시 자동 초기화/연결을 수행하지 않음(일부 단말 충돌 방지)
  useEffect(() => {}, []);
  const ensureUriAndOpenWallet = async (scheme: string) => {
    try {
      let uri = state.uri;
      if (!uri) { await connect(); uri = state.uri; }
      if (!uri) return;
      const url = `${scheme}://wc?uri=${encodeURIComponent(uri)}`;
      await Linking.openURL(url);
    } catch {}
  };
  const openYooyLocalWalletFlow = () => {
    try { router.push('/(tabs)/wallet?tab=receive&coin=YOY&create=true' as any); } catch {}
  };
  const chainBadge = (() => {
    const hex = (state.chainIdHex || '0x1').toLowerCase();
    const isMainnet = hex === '0x1';
    return (
      <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginTop:6 }}>
        <View style={{ paddingHorizontal:8, paddingVertical:4, borderRadius:8, borderWidth:1, borderColor:isMainnet?'#1F5130':'#5A2A2A', backgroundColor:isMainnet?'#102418':'#2A1313' }}>
          <ThemedText style={{ color: isMainnet ? '#8CF5B5' : '#FF9E9E', fontWeight:'800', fontSize:12 }}>{isMainnet ? '메인넷 연결됨' : `네트워크 ${hex}`}</ThemedText>
        </View>
        {!isMainnet && (
          <TouchableOpacity style={[styles.smallBtn, { borderColor:'#2E8647', backgroundColor:'#12331F' }]} onPress={switchToMainnet}>
            <ThemedText style={[styles.smallBtnText, { color:'#8CF5B5' }]}>메인넷으로 전환</ThemedText>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.smallBtn, { borderColor:'#2B3A3F' }]} onPress={getChainId}>
          <ThemedText style={styles.smallBtnText}>상태 새로고침</ThemedText>
        </TouchableOpacity>
      </View>
    );
  })();
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
          <TouchableOpacity style={styles.btn} onPress={async()=>{ try { await connect(); } catch { /* Alert는 컨텍스트에서 처리 */ } }}>
            <ThemedText style={styles.btnText}>연결</ThemedText>
          </TouchableOpacity>
        )}
      </View>
      {state.connected ? (
        <>
          <ThemedText style={styles.sub}>{state.address}</ThemedText>
          {chainBadge}
        </>
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
                  <TouchableOpacity style={styles.smallBtn} onPress={() => ensureUriAndOpenWallet('metamask')}>
                    <ThemedText style={styles.smallBtnText}>MetaMask</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.smallBtn} onPress={() => ensureUriAndOpenWallet('trust')}>
                    <ThemedText style={styles.smallBtnText}>Trust</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.smallBtn} onPress={() => ensureUriAndOpenWallet('rainbow')}>
                    <ThemedText style={styles.smallBtnText}>Rainbow</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.smallBtn} onPress={() => ensureUriAndOpenWallet('zerion')}>
                    <ThemedText style={styles.smallBtnText}>Zerion</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.smallBtn} onPress={() => ensureUriAndOpenWallet('binance')}>
                    <ThemedText style={styles.smallBtnText}>Binance</ThemedText>
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

      {/* 빠른 연결 섹션 (오른쪽 목업 UX) */}
      <View style={{ marginTop:14 }}>
        <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
          <ThemedText style={{ color:'#FFFFFF', fontWeight:'800', fontSize:16 }}>Main Net</ThemedText>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: state.connected ? '#2A3A12' : '#FFD700', borderColor: state.connected ? '#3E6B21' : '#FFD700' }]}
            onPress={async()=>{ try { if (state.connected) { await disconnect(); } else { await switchToMainnet(); await connect(); } await getChainId(); } catch {} }}
          >
            <ThemedText style={[styles.btnText, { color: state.connected ? '#CDEBA8' : '#0D0D0D' }]}>{state.connected ? '연결 됨' : '연결'}</ThemedText>
          </TouchableOpacity>
        </View>
        <ThemedText style={[styles.sub, { marginTop:6 }]}>{state.connected ? '보유 중인 다른 지갑 연결을 원하시면, 아래 지갑을 선택해 주세요!' : '지갑앱으로 연결하세요(메타마스크/Trust/Rainbow 등)'}</ThemedText>
        <View style={{ marginTop:8, gap:10 }}>
          <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
            <ThemedText style={{ color:'#EDEDED', fontSize:15, fontWeight:'700' }}>YooY Land App</ThemedText>
            <TouchableOpacity style={styles.smallBtn} onPress={openYooyLocalWalletFlow}><ThemedText style={styles.smallBtnText}>연결</ThemedText></TouchableOpacity>
          </View>
          {Platform.OS !== 'web' && (
            <>
              <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
                <ThemedText style={{ color:'#EDEDED', fontSize:15, fontWeight:'700' }}>MetaMask</ThemedText>
                <TouchableOpacity style={styles.smallBtn} onPress={() => ensureUriAndOpenWallet('metamask')}><ThemedText style={styles.smallBtnText}>연결</ThemedText></TouchableOpacity>
              </View>
              <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
                <ThemedText style={{ color:'#EDEDED', fontSize:15, fontWeight:'700' }}>Trust</ThemedText>
                <TouchableOpacity style={styles.smallBtn} onPress={() => ensureUriAndOpenWallet('trust')}><ThemedText style={styles.smallBtnText}>연결</ThemedText></TouchableOpacity>
              </View>
              <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
                <ThemedText style={{ color:'#EDEDED', fontSize:15, fontWeight:'700' }}>Rainbow</ThemedText>
                <TouchableOpacity style={styles.smallBtn} onPress={() => ensureUriAndOpenWallet('rainbow')}><ThemedText style={styles.smallBtnText}>연결</ThemedText></TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
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


