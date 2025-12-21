import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { router } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { usePreferences } from '@/contexts/PreferencesContext';
import { t } from '@/i18n';
import { firebaseAuth, firestore } from '@/lib/firebase';
// Firestore 함수는 동적 임포트로 사용(네이티브/웹 번들 호환성 개선)

export default function ProfileUsernameScreen() {
  const { language } = usePreferences();
  const [username, setUsername] = useState('');
  const [saving, setSaving] = useState(false);

  const save = useCallback(async () => {
    try {
      const uid = firebaseAuth.currentUser?.uid;
      if (!uid) { Alert.alert(t('alertSettings', language), t('loginRequired', language)); return; }
      const raw = (username || '').trim();
      if (!raw) { Alert.alert('안내','아이디를 입력해 주세요.'); return; }
      if (!/^[a-z0-9_.-]{3,20}$/i.test(raw)) { Alert.alert('안내','아이디는 3~20자 영문/숫자/_.- 만 가능합니다.'); return; }
      setSaving(true);
      const lower = raw.toLowerCase();
      // 동적 임포트
      const { doc, serverTimestamp, runTransaction, getDoc, setDoc } = await import('firebase/firestore');
      // 유니크 보장: usernames/{lower} 문서에 소유 uid 기록 (트랜잭션)
      const nameRef = doc(firestore, 'usernames', lower);
      const userRef = doc(firestore, 'users', uid);
      try {
        await runTransaction(firestore, async (tx) => {
          const cur = await tx.get(nameRef);
          if (cur.exists() && (cur.data() as any)?.uid && (cur.data() as any).uid !== uid) {
            throw Object.assign(new Error('duplicate'), { code: 'duplicate' });
          }
          tx.set(nameRef, { uid, updatedAt: serverTimestamp() } as any, { merge: true } as any);
          tx.set(userRef, { username: raw, usernameLower: lower, updatedAt: serverTimestamp() } as any, { merge: true } as any);
        });
      } catch (e: any) {
        // 트랜잭션 실패 시(네트워크 등), 중복만 별도 메시지
        if (e?.code === 'duplicate') {
          Alert.alert('안내','이미 사용 중인 아이디입니다.');
          setSaving(false);
          return;
        }
        // 폴백: 최후 수단으로 nameRef 존재 재확인 후 setDoc 시도
        try {
          const cur = await getDoc(nameRef);
          if (cur.exists() && (cur.data() as any)?.uid && (cur.data() as any).uid !== uid) {
            Alert.alert('안내','이미 사용 중인 아이디입니다.');
            setSaving(false);
            return;
          }
          await setDoc(nameRef, { uid, updatedAt: serverTimestamp() } as any, { merge: true } as any);
          await setDoc(userRef, { username: raw, usernameLower: lower, updatedAt: serverTimestamp() } as any, { merge: true } as any);
        } catch (e2: any) {
          const code = String(e2?.code || e2?.message || '');
          if (code.includes('permission') || code.includes('denied')) {
            Alert.alert('권한 오류','데이터베이스 권한 오류입니다. 관리자에게 문의하세요.');
          } else if (code.includes('unavailable') || code.includes('network') || code.includes('deadline')) {
            Alert.alert('네트워크 오류','네트워크 상태가 불안정합니다. 잠시 후 다시 시도해 주세요.');
          } else {
            Alert.alert('오류','아이디 저장에 실패했습니다.');
          }
          setSaving(false);
          return;
        }
      }
      Alert.alert('완료','아이디가 저장되었습니다.');
      try { router.back(); } catch {}
    } catch {
      Alert.alert('오류','아이디 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }, [username, language]);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ThemedText style={{ color:'#FFD700', fontSize: 16, fontWeight:'800' }}>←</ThemedText>
        </TouchableOpacity>
        <ThemedText style={styles.title}>{t('userId', language)}</ThemedText>
        <View style={{ width: 40 }} />
      </View>
      <View style={{ padding: 12 }}>
        <ThemedText style={styles.label}>{t('userId', language)}</ThemedText>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          placeholder={t('enterUserId', language)}
          placeholderTextColor="#777"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
        />
        <ThemedText style={styles.hint}>{'영문/숫자/_.- 가능 · 3~20자'}</ThemedText>
        <TouchableOpacity disabled={saving} onPress={save} style={styles.btn}>
          <ThemedText style={styles.btnText}>{saving ? t('processing', language) : t('save', language)}</ThemedText>
        </TouchableOpacity>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0C0C0C' },
  header: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#D4AF37' },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#F6F6F6', fontSize: 16, fontWeight: '700' },
  label: { color:'#B8B8B8', marginTop: 8 },
  input: { marginTop:6, borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: '#EDEDED', backgroundColor: '#141414' },
  hint: { color:'#777', fontSize:12, marginTop:6 },
  btn: { marginTop: 12, paddingHorizontal: 12, height: 40, borderRadius: 8, backgroundColor: '#D4AF37', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FFD700' },
  btnText: { color: '#0C0C0C', fontWeight: '900' },
});

