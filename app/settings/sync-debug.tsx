import React, { useEffect, useState } from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import { getEthMonitorHttp } from '@/lib/config';
import { firebaseAuth } from '@/lib/firebase';
import * as Clipboard from 'expo-clipboard';

export default function SyncDebug() {
  const { currentUser } = useAuth();
  const [base, setBase] = useState<string>('');
  const [tokenHead, setTokenHead] = useState<string>('—');
  const [health, setHealth] = useState<{ status?: number; ms?: number; url?: string; body?: any; error?: string }>({});
  const [addrRes, setAddrRes] = useState<{ status?: number; ms?: number; url?: string; body?: any; error?: string }>({});
  const [balRes, setBalRes] = useState<{ status?: number; ms?: number; url?: string; body?: any; error?: string }>({});
  const [txRes, setTxRes] = useState<{ status?: number; ms?: number; url?: string; body?: any; error?: string }>({});

  useEffect(() => {
    (async () => {
      try {
        const b = await getEthMonitorHttp();
        setBase(b);
        const u = (firebaseAuth as any)?.currentUser;
        const token = u ? await u.getIdToken(true) : null;
        if (token) setTokenHead(token.slice(0, 20));
      } catch (e:any) {
        // ignore
      }
    })();
  }, []);

  async function runHealth() {
    try {
      const url = `${base}/health`;
      const t0 = Date.now();
      const r = await fetch(url);
      const ms = Date.now() - t0;
      const text = await r.text();
      let body: any; try { body = JSON.parse(text); } catch { body = text; }
      setHealth({ status: r.status, ms, url, body });
    } catch (e:any) {
      setHealth({ error: String(e?.message||e) });
    }
  }
  async function runMe(path: '/me/addresses'|'/me/balances'|'/me/transactions?page=1&limit=50') {
    try {
      const u = (firebaseAuth as any)?.currentUser;
      const token = u ? await u.getIdToken(true) : null;
      if (!token) {
        const err = { status: 401, ms: 0, url: `${base}${path}`, body: { error: 'no token' } };
        if (path.startsWith('/me/addresses')) setAddrRes(err); else if (path.startsWith('/me/balances')) setBalRes(err); else setTxRes(err);
        return;
      }
      const url = `${base}${path}`;
      const t0 = Date.now();
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const ms = Date.now() - t0;
      const text = await r.text();
      let body: any; try { body = JSON.parse(text); } catch { body = text; }
      const res = { status: r.status, ms, url, body };
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

  return (
    <ThemedView style={{ flex: 1, padding: 16 }}>
      <ThemedText style={{ fontWeight: '800', fontSize: 16, marginBottom: 8 }}>Sync Debug</ThemedText>
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
      </ScrollView>
    </ThemedView>
  );
}

