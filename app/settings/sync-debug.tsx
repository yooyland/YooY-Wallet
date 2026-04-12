import React, { useEffect, useState } from 'react';
import { View, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import Constants from 'expo-constants';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import { getEthMonitorHttp } from '@/lib/config';
import { firebaseAuth } from '@/lib/firebase';
import * as Clipboard from 'expo-clipboard';

export default function SyncDebug() {
  const { currentUser, accessToken } = useAuth();
  const [base, setBase] = useState<string>('');
  const [tokenHead, setTokenHead] = useState<string>('—');
  const [health, setHealth] = useState<{ status?: number; ms?: number; requestUrl?: string; raw?: string; error?: string }>({});
  const [addrRes, setAddrRes] = useState<{ status?: number; ms?: number; requestUrl?: string; raw?: string; error?: string }>({});
  const [balRes, setBalRes] = useState<{ status?: number; ms?: number; requestUrl?: string; raw?: string; error?: string }>({});
  const [txRes, setTxRes] = useState<{ status?: number; ms?: number; requestUrl?: string; raw?: string; error?: string }>({});
  const [linkAddr, setLinkAddr] = useState<string>('');
  const [linkRes, setLinkRes] = useState<{ status?: number; ms?: number; requestUrl?: string; raw?: string; error?: string }>({});
  const [timeline, setTimeline] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const b = await getEthMonitorHttp();
        setBase(b);
        if (accessToken) setTokenHead(accessToken.slice(0, 20));
        try {
          const { useMonitorStore } = require('@/lib/monitorStore');
          const unsub = useMonitorStore.subscribe((s: any) => setTimeline(s.timeline || []));
          return () => { try { unsub(); } catch {} };
        } catch {}
      } catch (e:any) {
        // ignore
      }
    })();
  }, [accessToken]);

  async function runHealth() {
    try {
      const url = new URL('/health', base).toString();
      const t0 = Date.now();
      const r = await fetch(url);
      const ms = Date.now() - t0;
      const text = await r.text();
      setHealth({ status: r.status, ms, requestUrl: url, raw: text });
    } catch (e:any) {
      setHealth({ error: String(e?.message||e) });
    }
  }
  async function runMe(path: '/me/addresses'|'/me/balances'|'/me/transactions?page=1&limit=50') {
    try {
      const u = (firebaseAuth as any)?.currentUser;
      const token = u ? await u.getIdToken(true) : null;
      if (!token) {
        const err = { status: 401, ms: 0, requestUrl: new URL(path, base).toString(), raw: JSON.stringify({ error: 'no token' }) };
        if (path.startsWith('/me/addresses')) setAddrRes(err); else if (path.startsWith('/me/balances')) setBalRes(err); else setTxRes(err);
        return;
      }
      const url = new URL(path, base).toString();
      const t0 = Date.now();
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const ms = Date.now() - t0;
      const text = await r.text();
      setTokenHead(token.slice(0,20));
      const res = { status: r.status, ms, requestUrl: url, raw: text };
      if (path.startsWith('/me/addresses')) setAddrRes(res);
      else if (path.startsWith('/me/balances')) setBalRes(res);
      else setTxRes(res);
    } catch (e:any) {
      const res = { error: String(e?.message||e) };
      if (path.startsWith('/me/addresses')) setAddrRes(res);
      else if (path.startsWith('/me/balances')) setBalRes(res);
      else setTxRes(res);
    }
  }
  async function runPostLink() {
    try {
      const u = (firebaseAuth as any)?.currentUser;
      const token = u ? await u.getIdToken(true) : null;
      if (!token) {
        setLinkRes({ status: 401, ms: 0, requestUrl: new URL('/me/addresses', base).toString(), raw: JSON.stringify({ error: 'no token' }) });
        return;
      }
      // 서버 링크 성공/실패와 무관하게, 온체인 조회용으로 마지막 주소를 로컬에 저장
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const normalized = (linkAddr || '').trim();
        if (normalized) await AsyncStorage.setItem('wallet.lastKnownAddress', normalized);
      } catch {}
      const url = new URL('/me/addresses', base).toString();
      const t0 = Date.now();
      const r = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: (linkAddr || '').trim() })
      });
      const ms = Date.now() - t0;
      const text = await r.text();
      setTokenHead(token.slice(0,20));
      setLinkRes({ status: r.status, ms, requestUrl: url, raw: text });
      // auto refresh sequence
      await runMe('/me/addresses');
      await runMe('/me/balances');
      await runMe('/me/transactions?page=1&limit=50');
    } catch (e:any) {
      setLinkRes({ error: String(e?.message||e) });
    }
  }
  async function runRefresh() {
    await runMe('/me/addresses');
    await runMe('/me/balances');
    await runMe('/me/transactions?page=1&limit=50');
  }

  const buildFingerprint = (Constants.expoConfig as any)?.extra?.BUILD_FINGERPRINT ?? '—';

  return (
    <ThemedView style={{ flex: 1, padding: 16 }}>
      <ThemedText style={{ fontWeight: '800', fontSize: 16, marginBottom: 8 }}>Sync Debug</ThemedText>
      <ThemedText style={{ marginBottom: 4 }}>빌드: {buildFingerprint}</ThemedText>
      <ThemedText>uid: {currentUser?.uid || '—'}</ThemedText>
      <ThemedText>base: {base || '—'}</ThemedText>
      <ThemedText>idToken(head): {tokenHead}</ThemedText>
      <TouchableOpacity onPress={async ()=>{ try {
        const payload = JSON.stringify({ health, addrRes, balRes, txRes }, null, 2);
        await Clipboard.setStringAsync(payload);
      } catch {} }}>
        <ThemedText style={{ color:'#FFD700', fontWeight:'800', marginTop:8 }}>Copy JSON</ThemedText>
      </TouchableOpacity>
      <ScrollView style={{ marginTop: 12 }}>
        <ThemedText style={{ fontWeight:'800', marginBottom:6 }}>[Timeline]</ThemedText>
        <ThemedText selectable>{JSON.stringify(timeline, null, 2)}</ThemedText>

        <TouchableOpacity onPress={runHealth} style={{ backgroundColor:'#333', padding:10, borderRadius:6, marginBottom:6 }}>
          <ThemedText>GET /health</ThemedText>
        </TouchableOpacity>
        <ThemedText selectable>{JSON.stringify(health, null, 2)}</ThemedText>

        <TouchableOpacity onPress={()=>runMe('/me/addresses')} style={{ backgroundColor:'#333', padding:10, borderRadius:6, marginVertical:6 }}>
          <ThemedText>GET /me/addresses</ThemedText>
        </TouchableOpacity>
        <ThemedText selectable>{JSON.stringify(addrRes, null, 2)}</ThemedText>

        <TouchableOpacity onPress={()=>runMe('/me/balances')} style={{ backgroundColor:'#333', padding:10, borderRadius:6, marginVertical:6 }}>
          <ThemedText>GET /me/balances</ThemedText>
        </TouchableOpacity>
        <ThemedText selectable>{JSON.stringify(balRes, null, 2)}</ThemedText>

        <TouchableOpacity onPress={()=>runMe('/me/transactions?page=1&limit=50')} style={{ backgroundColor:'#333', padding:10, borderRadius:6, marginVertical:6 }}>
          <ThemedText>GET /me/transactions?page=1&limit=50</ThemedText>
        </TouchableOpacity>
        <ThemedText selectable>{JSON.stringify(txRes, null, 2)}</ThemedText>

        {/* Link Address section */}
        <View style={{ height: 12 }} />
        <ThemedText style={{ fontWeight:'800', marginBottom:6 }}>Link Address</ThemedText>
        <TextInput
          style={{ backgroundColor:'#111', color:'#fff', borderWidth:1, borderColor:'#333', borderRadius:8, padding:10, marginBottom:8 }}
          value={linkAddr}
          onChangeText={setLinkAddr}
          placeholder="0x..."
          placeholderTextColor="#666"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={{ flexDirection:'row', gap:8 }}>
          <TouchableOpacity onPress={runPostLink} style={{ backgroundColor:'#FFD700', padding:10, borderRadius:6 }}>
            <ThemedText style={{ color:'#000', fontWeight:'900' }}>POST /me/addresses</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity onPress={runRefresh} style={{ backgroundColor:'#333', padding:10, borderRadius:6 }}>
            <ThemedText>Refresh</ThemedText>
          </TouchableOpacity>
        </View>
        <ThemedText selectable>{JSON.stringify(linkRes, null, 2)}</ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

