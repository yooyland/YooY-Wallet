import React, { useEffect, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import { getEthMonitorHttp } from '@/lib/config';
import { firebaseAuth } from '@/lib/firebase';

export default function SyncDebug() {
  const { currentUser } = useAuth();
  const [base, setBase] = useState<string>('');
  const [meAddresses, setMeAddresses] = useState<any>(null);
  const [meBalances, setMeBalances] = useState<any>(null);
  const [meTx, setMeTx] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const b = await getEthMonitorHttp();
        setBase(b);
        const u = (firebaseAuth as any)?.currentUser;
        const token = u ? await u.getIdToken(true) : null;
        if (!token) {
          setLogs(l => [`no token`, ...l]); return;
        }
        const addrUrl = `${b}/me/addresses`;
        const balUrl = `${b}/me/balances`;
        const txUrl = `${b}/me/transactions?page=1&limit=20`;
        setLogs(l => [`GET ${addrUrl}`, `GET ${balUrl}`, `GET ${txUrl}`, ...l]);
        const h = { Authorization: `Bearer ${token}` };
        const a = await fetch(addrUrl, { headers: h }); setMeAddresses(await a.json().catch(()=>({})));
        const bb = await fetch(balUrl, { headers: h }); setMeBalances(await bb.json().catch(()=>({})));
        const t = await fetch(txUrl, { headers: h }); setMeTx(await t.json().catch(()=>({})));
      } catch (e:any) {
        setLogs(l => [`error: ${String(e?.message||e)}`, ...l]);
      }
    })();
  }, []);

  return (
    <ThemedView style={{ flex: 1, padding: 16 }}>
      <ThemedText style={{ fontWeight: '800', fontSize: 16, marginBottom: 8 }}>Sync Debug</ThemedText>
      <ThemedText>uid: {currentUser?.uid || '—'}</ThemedText>
      <ThemedText>base: {base || '—'}</ThemedText>
      <ScrollView style={{ marginTop: 12 }}>
        <ThemedText style={{ fontWeight: '800', marginBottom: 4 }}>me/addresses</ThemedText>
        <ThemedText selectable>{JSON.stringify(meAddresses, null, 2)}</ThemedText>
        <ThemedText style={{ fontWeight: '800', marginVertical: 4 }}>me/balances</ThemedText>
        <ThemedText selectable>{JSON.stringify(meBalances, null, 2)}</ThemedText>
        <ThemedText style={{ fontWeight: '800', marginVertical: 4 }}>me/transactions</ThemedText>
        <ThemedText selectable>{JSON.stringify(meTx, null, 2)}</ThemedText>
        <ThemedText style={{ fontWeight: '800', marginVertical: 4 }}>logs</ThemedText>
        {logs.map((x, i) => (<ThemedText key={i}>{x}</ThemedText>))}
      </ScrollView>
    </ThemedView>
  );
}

