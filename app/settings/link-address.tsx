import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getEthMonitorHttp } from '@/lib/config';
import { firebaseAuth } from '@/lib/firebase';

export default function LinkAddress() {
  const [addr, setAddr] = useState('');
  const [log, setLog] = useState<string>('');
  const [ok, setOk] = useState<boolean | null>(null);

  const onRegister = async () => {
    setOk(null);
    try {
      const base = await getEthMonitorHttp();
      const u = (firebaseAuth as any)?.currentUser;
      const token = u ? await u.getIdToken(true) : null;
      if (!token) throw new Error('로그인이 필요합니다');
      const url = `${base}/me/addresses`;
      setLog(prev => `POST ${url}\n${prev}`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr.trim() })
      });
      const text = await res.text();
      setLog(prev => `status=${res.status}\n${text}\n${prev}`);
      setOk(res.ok);
    } catch (e:any) {
      setLog(prev => `error=${String(e?.message||e)}\n${prev}`);
      setOk(false);
    }
  };

  return (
    <ThemedView style={{ flex:1, padding:16 }}>
      <ThemedText style={{ fontWeight:'800', fontSize:16, marginBottom:8 }}>Link Wallet Address</ThemedText>
      <TextInput
        style={{ backgroundColor:'#111', color:'#fff', borderWidth:1, borderColor:'#333', borderRadius:8, padding:10, marginBottom:8 }}
        value={addr}
        onChangeText={setAddr}
        placeholder="0x..."
        placeholderTextColor="#666"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TouchableOpacity onPress={onRegister} style={{ backgroundColor:'#FFD700', borderRadius:8, padding:12, alignItems:'center', marginBottom:12 }}>
        <ThemedText style={{ color:'#000', fontWeight:'900' }}>Register Address</ThemedText>
      </TouchableOpacity>
      {ok !== null && (
        <ThemedText style={{ color: ok ? '#22C55E' : '#EF4444', marginBottom:8 }}>
          {ok ? '등록 성공' : '등록 실패'}
        </ThemedText>
      )}
      <ThemedText selectable>{log}</ThemedText>
    </ThemedView>
  );
}

