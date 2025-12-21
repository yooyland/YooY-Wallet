import ChatBottomBar from '@/components/ChatBottomBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useKakaoRoomsStore } from '@/src/features/chat/store/kakao-rooms.store';
import { router, Stack } from 'expo-router';
import { firebaseAuth } from '@/lib/firebase';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePreferences } from '@/contexts/PreferencesContext';
import { t } from '@/i18n';
import * as ImagePicker from 'expo-image-picker';
import { Image as EImage } from 'expo-image';
import { firebaseStorage, ensureAppCheckReady, ensureAuthedUid } from '@/lib/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { signInAnonymously } from 'firebase/auth';
import { useChatSettingsStore } from '@/src/features/chat/store/chat-settings.store';
import { useChatProfileStore } from '@/src/features/chat/store/chat-profile.store';

export default function CreateRoomScreen() {
  const { language } = usePreferences();
  const insets = useSafeAreaInsets();
  const rooms = useKakaoRoomsStore();
  const chatSettings = useChatSettingsStore();
  const { currentProfile } = useChatProfileStore();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'dm'|'group'|'secret'|'ttl'|'notice'>(chatSettings.ttlDefault ? 'ttl' : 'group');
  const meEmail = String((firebaseAuth.currentUser?.email || (currentProfile as any)?.email || '')).toLowerCase();
  const canNotice = ['admin@yooyland.com','jch4389@gmail.com','landyooy@gmail.com'].includes(meEmail);
  // 방 폭파 시간(만료) 입력: 일/시/분/초
  const [expD, setExpD] = useState('0');
  const [expH, setExpH] = useState('0');
  const [expM, setExpM] = useState('0');
  const [expS, setExpS] = useState('0');
  const [ttlH, setTtlH] = useState('0');
  const [ttlM, setTtlM] = useState('3');
  const [ttlS, setTtlS] = useState('0');
  const [tags, setTags] = useState('');
  // 대표이미지는 방 설정에서 등록하도록 변경됨
  // 대표 이미지 임시 미리보기 URI
  const [avatarUri, setAvatarUri] = useState<string>('');
  // 1:1 친구 선택(간단히 사용자 ID/이메일 입력)
  const [dmFriend, setDmFriend] = useState('');
  // 참가 인원 제한(그룹/비밀)
  const [memberLimit, setMemberLimit] = useState('');
  // 비밀방 비밀번호
  const [secretPwd, setSecretPwd] = useState('');

  

  const onCreate = async () => {
    const name = title.trim();
    if (!name) {
      Alert.alert('오류', '방 제목을 입력해 주세요.');
      return;
    }
    // 대표이미지 업로드는 방 생성 직후 백그라운드로 진행
    let uploadedAvatarUrl: string | undefined = undefined;
    let expiresAt: number | undefined = undefined;
    if (type === 'ttl') {
      // 방 폭파 시간 = expD/expH/expM/expS 조합
      const days = Math.max(0, Number(expD)||0);
      const h = Math.max(0, Number(expH)||0);
      const m = Math.max(0, Number(expM)||0);
      const s = Math.max(0, Number(expS)||0);
      const durMs = (((days*24 + h)*60 + m)*60 + s) * 1000;
      if (durMs <= 0) {
        Alert.alert('오류','TTL 시간을 설정해 주세요.');
        return;
      }
      expiresAt = Date.now() + durMs;
      // 개설 비용 안내
      const fee = (days*24 + h) <= 24 ? 5 : 30; // 24시간 이하는 5 YOY, 초과~90일 이내 30 YOY
      if (days > 90) { Alert.alert('오류','방 유지 일수는 90일 이내여야 합니다.'); return; }
      Alert.alert('안내', `개설 비용: ${fee} YOY`);
    }

    // 메시지 TTL은 시/분/초 입력을 합산. TTL 방에서 미입력 시 기본 3분
    let ttlSeconds = ((Number(ttlH)||0)*3600 + (Number(ttlM)||0)*60 + (Number(ttlS)||0));
    if (type === 'ttl' && ttlSeconds <= 0) ttlSeconds = 180;
    const messageTtlMs = type === 'ttl' && ttlSeconds > 0 ? ttlSeconds * 1000 : undefined as any;
    const tagArr = (tags||'').split(/[\s,]+/).map((t)=>t.trim().toLowerCase()).filter(Boolean);
    let myUid = firebaseAuth.currentUser?.uid || '';
    try { myUid = myUid || await ensureAuthedUid(); } catch {}
    myUid = myUid || 'me';
    const members = (type === 'dm' && dmFriend.trim()) ? [myUid, dmFriend.trim()] : [myUid];
    const lim = parseInt(memberLimit||'') || 0;
    // 방 생성 전에 인증 보장 (웹/네이티브 공통)
    try { if (!firebaseAuth.currentUser) { await signInAnonymously(firebaseAuth); } } catch {}
    const room = rooms.createRoom(
      name,
      members,
      type,
      expiresAt,
      messageTtlMs,
      tagArr,
      undefined,
      type === 'secret' ? (secretPwd || undefined) : undefined,
      lim > 0 ? lim : undefined,
    );
    if (expiresAt) { rooms.setRoomTTL(room.id, expiresAt); }
    // 대표이미지 선택 시 즉시 로컬 반영(미리보기 URI로) → 업로드 후 실제 URL로 교체됨
    try {
      if (avatarUri) {
        (useKakaoRoomsStore as any).setState((s: any) => ({
          rooms: (s.rooms||[]).map((r: any) => r.id === room.id ? { ...r, avatarUrl: avatarUri } : r),
          roomSettings: {
            ...(s.roomSettings || {}),
            [room.id]: {
              ...(s.roomSettings?.[room.id] || {}),
              basic: {
                ...(s.roomSettings?.[room.id]?.basic || {}),
                thumbnailUrl: avatarUri,
              },
            },
          },
        }));
      }
    } catch {}
    // 즉시 방으로 이동 (바로 적용)
    try { router.replace(`/chat/room/${room.id}` as any); } catch {}
    // 백그라운드로 대표이미지/설정 저장
    (async () => {
      try {
        if (avatarUri) {
          try { await ensureAppCheckReady(); } catch {}
          try { if (!firebaseAuth.currentUser) { await signInAnonymously(firebaseAuth); } } catch {}
          let uid = firebaseAuth.currentUser?.uid || '';
          try { uid = uid || await ensureAuthedUid(); } catch {}
          uid = uid || 'me';
          const resp = await fetch(avatarUri);
          const blob = await resp.blob();
          const r = storageRef(firebaseStorage, `rooms/${uid}/${Date.now()}-avatar`);
          await uploadBytes(r, blob as any);
          uploadedAvatarUrl = await getDownloadURL(r);
          await rooms.updateRoomMeta(room.id, { avatarUrl: uploadedAvatarUrl });
          await rooms.saveRoomSettings(room.id, { basic: { thumbnailUrl: uploadedAvatarUrl } as any });
        }
      } catch {}
      try {
        if (type === 'secret') {
          await rooms.saveRoomSettings(room.id, { basic: { isPublic: false } as any, security: { passwordLock: String(secretPwd||'') } as any });
        }
        // 설명(description)에 기록하지 않고, 설정과 메타의 participantLimit만 사용
        await rooms.saveRoomSettings(room.id, { basic: { participantLimit: lim > 0 ? lim : null } as any });
      } catch {}
    })();
  };

  return (
    <>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={insets.top + 56}
      >
      <ThemedView style={styles.container}>
        <View style={[styles.header, { paddingTop: 12 + insets.top }]}>
          <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>←</Text></TouchableOpacity>
          <ThemedText style={styles.title}>{t('createRoom', language)}</ThemedText>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          style={styles.form}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 140 }}
          showsVerticalScrollIndicator
        >
          <ThemedText style={styles.label}>{t('titleLabel', language)}</ThemedText>
          <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder={t('titleLabel', language)} placeholderTextColor="#777" />

          <ThemedText style={[styles.label,{ marginTop: 12 }]}>{t('type', language)}</ThemedText>
          <View style={styles.pills}>
            {(['group','dm','secret','ttl', ...(canNotice ? (['notice'] as const) : ([] as any))] as const).map((key) => (
              <TouchableOpacity key={key} style={[styles.pill, type===key && styles.pillActive]} onPress={() => setType(key)}>
                <Text style={[styles.pillText, type===key && styles.pillTextActive]}>
                  {key==='group' ? t('group', language)
                    : key==='dm' ? t('dm', language)
                    : key==='secret' ? t('secret', language)
                    : key==='ttl' ? t('ttl', language)
                    : t('notice', language)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* 대표 이미지 미리보기 + 등록 */}
          <ThemedText style={[styles.label,{ marginTop: 10 }]}>{t('photo', language)}</ThemedText>
          <View style={{ flexDirection:'row', alignItems:'center', gap:12 }}>
            {avatarUri ? (
              <EImage source={{ uri: avatarUri }} style={styles.previewBox} contentFit="cover" />
            ) : (
              <View style={styles.previewBox}><Text style={styles.previewHint}>{t('preview', language) || 'Preview'}</Text></View>
            )}
            <TouchableOpacity style={[styles.pill,{ paddingHorizontal:12, paddingVertical:10 }]} onPress={async ()=>{
              try {
                const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, quality: 0.8 });
                if (!res.canceled && res.assets?.length) {
                  setAvatarUri(res.assets[0].uri);
                }
              } catch {}
            }}>
              <Text style={{ color:'#FFD700', fontWeight:'700' }}>{avatarUri? t('change', language): t('register', language)}</Text>
            </TouchableOpacity>
          </View>

          {/* 태그 입력: 라벨 바로 아래 입력창 */}
          <ThemedText style={[styles.label,{ marginTop: 10 }]}>{t('tags', language)}</ThemedText>
          <TextInput
            style={styles.input}
            value={tags}
            onChangeText={setTags}
            placeholder={t('tagsPlaceholder', language)}
            placeholderTextColor="#777"
            onKeyPress={(e:any)=>{
              const key = e?.nativeEvent?.key;
              if (key === 'Enter') {
                setTags((prev) => prev.endsWith(',') ? prev : (prev.trim().length ? prev + ', ' : prev));
              }
            }}
          />

          {(type==='group' || type==='secret') && (
            <>
              <ThemedText style={[styles.label,{ marginTop: 10 }]}>{t('selectedCount', language)}</ThemedText>
              <TextInput style={styles.input} value={memberLimit} onChangeText={setMemberLimit} placeholder={'50'} placeholderTextColor="#777" keyboardType="number-pad" />
            </>
          )}

          {type==='dm' && (
            <>
              <ThemedText style={[styles.label,{ marginTop: 10 }]}>{t('addById', language)}</ThemedText>
              <TextInput style={styles.input} value={dmFriend} onChangeText={setDmFriend} placeholder={t('friendIdOrEmail', language)} placeholderTextColor="#777" />
            </>
          )}

          {type==='secret' && (
            <>
              <ThemedText style={[styles.label,{ marginTop: 10 }]}>{t('passwordLabel', language)}</ThemedText>
              <TextInput style={styles.input} value={secretPwd} onChangeText={setSecretPwd} placeholder={t('passwordLabel', language)} placeholderTextColor="#777" secureTextEntry />
            </>
          )}

          {type==='ttl' && (
            <>
              <ThemedText style={styles.label}>{`TTL (${t('days', language)} : ${t('hours', language)} : ${t('minutes', language)} : ${t('seconds', language)})`}</ThemedText>
              <View style={styles.ttlRow}>
                <TextInput style={styles.inputTtl} value={expD} onChangeText={setExpD} placeholder={t('days', language)} placeholderTextColor="#777" keyboardType="number-pad" />
                <Text style={styles.colon}>:</Text>
                <TextInput style={styles.inputTtl} value={expH} onChangeText={setExpH} placeholder={t('hours', language)} placeholderTextColor="#777" keyboardType="number-pad" />
                <Text style={styles.colon}>:</Text>
                <TextInput style={styles.inputTtl} value={expM} onChangeText={setExpM} placeholder={t('minutes', language)} placeholderTextColor="#777" keyboardType="number-pad" />
                <Text style={styles.colon}>:</Text>
                <TextInput style={styles.inputTtl} value={expS} onChangeText={setExpS} placeholder={t('seconds', language)} placeholderTextColor="#777" keyboardType="number-pad" />
              </View>
              <ThemedText style={[styles.label,{ marginTop: 10 }]}>{`Message TTL (${t('hours', language)} : ${t('minutes', language)} : ${t('seconds', language)})`}</ThemedText>
              <View style={styles.ttlRow}>
                <TextInput style={styles.inputTtl} value={ttlH} onChangeText={setTtlH} placeholder={t('hours', language)} placeholderTextColor="#777" keyboardType="number-pad" />
                <Text style={styles.colon}>:</Text>
                <TextInput style={styles.inputTtl} value={ttlM} onChangeText={setTtlM} placeholder={t('minutes', language)} placeholderTextColor="#777" keyboardType="number-pad" />
                <Text style={styles.colon}>:</Text>
                <TextInput style={styles.inputTtl} value={ttlS} onChangeText={setTtlS} placeholder={t('seconds', language)} placeholderTextColor="#777" keyboardType="number-pad" />
              </View>
            </>
          )}

          <TouchableOpacity style={styles.createBtn} onPress={onCreate}>
            <Text style={styles.createText}>{t('createRoom', language)}</Text>
          </TouchableOpacity>

          {type==='ttl' && (
            <View style={styles.policyBox}>
              <ThemedText style={styles.policyTitle}>TTL 비용정책 및 이용규칙</ThemedText>
              <ThemedText style={styles.policyText}>- 24시간 이하는 개설비용 5 YOY</ThemedText>
              <ThemedText style={styles.policyText}>- 24시간 초과 ~ 90일 이내는 개설비용 30 YOY</ThemedText>
              <ThemedText style={styles.policyText}>- TTL(시간:분:초)은 사라지는 초를 의미합니다</ThemedText>
              <ThemedText style={styles.policyText}>- 면책: TTL 만료/삭제로 인한 대화·파일 소실 및 손해에 대해 회사는 책임을 지지 않습니다(법령상 책임 제외).</ThemedText>
            </View>
          )}
        </ScrollView>
      </ThemedView>
      </KeyboardAvoidingView>
      <ChatBottomBar active="chat" />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0C0C0C' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: '#D4AF37'
  },
  back: { fontSize: 20, color: '#D4AF37', fontWeight: 'bold' },
  title: { fontSize: 16, fontWeight: 'bold', color: '#F6F6F6' },
  form: { padding: 16 },
  label: { color: '#F6F6F6', marginBottom: 6, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: '#F6F6F6', backgroundColor: '#1A1A1A' },
  pills: { flexDirection: 'row', gap: 8, marginBottom: 8, marginTop: 4 },
  pill: { borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  pillActive: { borderColor: '#FFD700', backgroundColor: '#2A2A2A' },
  pillText: { color: '#B8B8B8' },
  pillTextActive: { color: '#FFD700', fontWeight: '700' },
  ttlRow: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%' },
  inputTtl: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 6, color: '#F6F6F6', backgroundColor: '#1A1A1A', textAlign: 'center' },
  colon: { color: '#777', paddingHorizontal: 0, fontWeight: '700' },
  createBtn: { marginTop: 16, backgroundColor: '#D4AF37', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  createText: { color: '#0C0C0C', fontWeight: '800' },
  policyBox: { marginTop: 16, borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 10, padding: 12, backgroundColor: '#0F0F0F' },
  policyTitle: { color: '#FFD700', fontWeight: '700', marginBottom: 6 },
  policyText: { color: '#9BA1A6', fontSize: 12, marginTop: 2 },
  previewBox: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    marginTop: 8,
    marginBottom: 12,
  },
  previewHint: { color: '#777', fontSize: 12 },
});
















