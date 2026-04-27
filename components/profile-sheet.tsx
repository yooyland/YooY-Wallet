import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { firebaseApp, firebaseAuth, firestore, firebaseStorage } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp, deleteDoc, collection, getDocs, getDoc } from 'firebase/firestore';
import { ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { t } from '@/i18n';
import * as ImagePicker from 'expo-image-picker';
import { deleteUser, onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useChatProfileStore } from '@/src/features/chat/store/chat-profile.store';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSaved?: (uri: string | null) => void;
};

const basePhotoKey = (uid?: string) => uid ? `u:${uid}:profile.photoUri` : 'profile.photoUri';
const baseInfoKey = (uid?: string) => uid ? `u:${uid}:profile.info` : 'profile.info';

export default function ProfileSheet({ visible, onClose, onSaved }: Props) {
  const slide = useRef(new Animated.Value(0)).current; // 0 hidden, 1 shown
  const { currentUser, signOut } = useAuth();
  const { language, currency, setLanguage, setCurrency } = usePreferences();
  const { currentProfile, updateProfile } = useChatProfileStore();
  const [useHash, setUseHash] = useState(false);
  const [chatNick, setChatNick] = useState<string>('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [email, setEmail] = useState<string>('');
  const [firstName, setFirstName] = useState<string>('');
  const [lastName, setLastName] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [deleting, setDeleting] = useState(false);
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNext, setPwNext] = useState('');
  const [pwNext2, setPwNext2] = useState('');

  useEffect(() => {
    Animated.timing(slide, {
      toValue: visible ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible]);

  // helper to derive names from email
  function deriveFromEmail(targetEmail: string) {
    try {
      const local = targetEmail.split('@')[0] ?? '';
      const parts = local.split(/[._-]+/).filter(Boolean);
      const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : '');
      if (parts.length >= 2) {
        setFirstName(cap(parts[0]));
        setLastName(cap(parts[1]));
      } else {
        setFirstName(cap(local.slice(0, 1)));
        setLastName(cap(local.slice(1)));
      }
      setUsername(local);
    } catch {}
  }

  // Load saved photo and prefill basic info from email when sheet opens
  useEffect(() => {
    if (!visible) return;
    (async () => {
      const uid = currentUser?.uid || firebaseAuth.currentUser?.uid || undefined;
      // 1) Firestore 프로필(계정 단일 소스) 우선
      try {
        if (uid) {
          const snap = await getDoc(doc(firestore, 'users', uid));
          if (snap.exists()) {
            const d: any = snap.data() || {};
            const fsPhoto = String(d?.photoURL || d?.avatarUrl || d?.avatar || '').trim();
            const fsFirst = String(d?.firstName || '').trim();
            const fsLast = String(d?.lastName || '').trim();
            const fsUser = String(d?.username || '').trim();
            if (fsPhoto) setPhotoUri(fsPhoto);
            if (fsFirst) setFirstName(fsFirst);
            if (fsLast) setLastName(fsLast);
            if (fsUser) setUsername(fsUser);
          }
        }
      } catch {}

      // 2) 로컬 캐시(하위호환)
      const saved = await AsyncStorage.getItem(basePhotoKey(uid));
      if (saved && !photoUri) setPhotoUri(saved);
      const savedInfo = await AsyncStorage.getItem(baseInfoKey(uid));
      if (savedInfo) {
        try {
          const parsed = JSON.parse(savedInfo);
          if (parsed.firstName && !firstName) setFirstName(parsed.firstName);
          if (parsed.lastName && !lastName) setLastName(parsed.lastName);
          if (parsed.username && !username) setUsername(parsed.username);
        } catch {}
      }
      const currentEmail = currentUser?.email || firebaseAuth.currentUser?.email || '';
      setEmail(currentEmail);
      if (!savedInfo && !firstName && !lastName && !username) deriveFromEmail(currentEmail);
      try {
        const prof = useChatProfileStore.getState().currentProfile;
        setUseHash(Boolean((prof as any)?.useHashInChat));
        setChatNick(String((prof as any)?.chatName || (prof as any)?.displayName || ''));
      } catch {}
    })();
  }, [visible]);

  // Keep Account email synced with logged-in user
  useEffect(() => {
    const unsub = onAuthStateChanged(firebaseAuth, async (user) => {
      const em = user?.email || '';
      if (em) {
        setEmail(em);
        await AsyncStorage.setItem('user.email', em);
        deriveFromEmail(em);
      }
    });
    return () => unsub();
  }, []);

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [400, 0] });

  const pickImage = async () => {
    try {
      // Android Photo Picker / 시스템 선택 UI — READ_MEDIA_* 광범위 권한 없이 선택
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const uri = asset.base64
          ? `data:${asset.type ?? 'image/jpeg'};base64,${asset.base64}`
          : asset.uri;
        setPhotoUri(uri);
        await AsyncStorage.setItem(basePhotoKey(currentUser?.uid), uri);
        onSaved?.(uri);
        return;
      }

      // 선택이 없으면 카메라 권한 요청 후 촬영 선택 유도
      const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
      if (cameraStatus === 'granted') {
        const shot = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.9, base64: true });
        if (!shot.canceled && shot.assets && shot.assets.length > 0) {
          const a = shot.assets[0];
          const uri2 = a.base64 ? `data:${a.type ?? 'image/jpeg'};base64,${a.base64}` : a.uri;
          setPhotoUri(uri2);
          await AsyncStorage.setItem(basePhotoKey(currentUser?.uid), uri2);
          onSaved?.(uri2);
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('오류', '이미지를 선택하는 중 오류가 발생했습니다. 다시 시도해주세요.');
    }
  };

  const handleDone = async () => {
    try {
      const uid = currentUser?.uid || firebaseAuth.currentUser?.uid;
      if (photoUri) {
        await AsyncStorage.setItem(basePhotoKey(uid || undefined), photoUri);
        // 업로드 및 Firestore 반영: 친구목록에서도 프사가 보이도록
        try {
          if (uid) {
            let publicUrl = '';
            if (/^https?:\/\//i.test(photoUri)) {
              publicUrl = photoUri;
            } else if (/^data:/i.test(photoUri)) {
              const key = `avatars/${uid}-${Date.now()}.jpg`;
              const r = storageRef(firebaseStorage, key);
              await uploadString(r, photoUri, 'data_url');
              publicUrl = await getDownloadURL(r);
            } else {
              // file:// URI 등은 Pick 시 base64 저장을 기본으로 하므로 드물지만, 그대로 저장 시도
              publicUrl = photoUri;
            }
            if (publicUrl) {
              await setDoc(doc(firestore, 'users', uid), {
                avatarUrl: publicUrl,
                photoURL: publicUrl,
                updatedAt: serverTimestamp(),
              } as any, { merge: true });
              try { updateProfile({ avatar: publicUrl }); } catch {}
            }
          }
        } catch {}
      }
      const info = { firstName, lastName, username };
      await AsyncStorage.setItem(baseInfoKey(uid || undefined), JSON.stringify(info));
      // 계정 단일 소스: Firestore users/{uid}에도 반영 (다른 디바이스/웹에서 동일)
      try {
        if (uid) {
          await setDoc(
            doc(firestore, 'users', uid),
            {
              firstName: String(firstName || '').trim(),
              lastName: String(lastName || '').trim(),
              // username은 별도 화면(usernames 트랜잭션)에서도 설정되지만, 여기서도 안전하게 저장
              username: String(username || '').trim(),
              displayName: String(`${String(firstName || '').trim()} ${String(lastName || '').trim()}`).trim() || String(username || '').trim(),
              updatedAt: serverTimestamp(),
            } as any,
            { merge: true }
          );
        }
      } catch {}
      try {
        const nick = String(chatNick || '').trim();
        if (nick || useHash !== undefined) {
          updateProfile({ chatName: nick || (currentProfile?.chatName || currentProfile?.displayName || ''), displayName: nick || (currentProfile?.displayName || ''), useHashInChat: Boolean(useHash) });
        }
      } catch {}
      onSaved?.(photoUri ?? null);
      onClose();
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('오류', '프로필 저장 중 오류가 발생했습니다.');
    }
  };

  const handleDeleteAccount = async () => {
    if (deleting) return;
    Alert.alert(
      language === 'en' ? 'Delete account?' : '계정 삭제',
      language === 'en'
        ? 'Are you sure you want to delete your account? All data will be permanently deleted.'
        : '계정을 삭제하시겠습니까? 모든 데이터가 영구적으로 삭제됩니다.',
      [
        { text: language === 'en' ? 'Cancel' : '취소', style: 'cancel' },
        {
          text: language === 'en' ? 'Delete' : '삭제',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              // 1) Server-side deletion (preferred): deletes Auth + Firestore without recent-login issues
              try {
                const region = process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION as string | undefined;
                const fns = region ? getFunctions(firebaseApp, region) : getFunctions(firebaseApp);
                const fn = httpsCallable(fns, 'deleteMyAccountV1');
                await fn({});
              } catch (e) {
                // 2) Client-side fallback (best-effort)
                try {
                  const uid = currentUser?.uid || firebaseAuth.currentUser?.uid;
                  if (uid) {
                    // delete known user document + subcollections (best-effort)
                    try {
                      const subcols = ['friends', 'joinedRooms', 'chatRoomPrefs', 'notifications'];
                      for (const c of subcols) {
                        try {
                          const snap = await getDocs(collection(firestore, 'users', uid, c));
                          for (const d of snap.docs) {
                            try { await deleteDoc(d.ref); } catch {}
                          }
                        } catch {}
                      }
                      await deleteDoc(doc(firestore, 'users', uid)).catch(() => {});
                    } catch {}
                  }
                } catch {}
                try {
                  const u = firebaseAuth.currentUser;
                  if (u) await deleteUser(u);
                } catch {}
              }

              // 3) Local sign-out + reset (auto-login OFF is enforced in signOut())
              try { await signOut(); } catch {}
              try { await AsyncStorage.removeItem('yoo-kakao-rooms-store'); } catch {}
              try { await AsyncStorage.removeItem('yoo-chat-profile-store'); } catch {}
              try { await AsyncStorage.removeItem('yoo-chat-settings-store'); } catch {}
              try { require('expo-router').router.replace('/(auth)/login'); } catch {}
              onClose();
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  const handleChangePassword = async () => {
    if (pwBusy) return;
    const user = firebaseAuth.currentUser;
    if (!user) {
      Alert.alert('오류', '로그인이 필요합니다.');
      return;
    }
    const providerIds = ((user as any)?.providerData || []).map((p: any) => String(p?.providerId || ''));
    const isPasswordProvider = providerIds.includes('password') || !!user.email;
    if (!isPasswordProvider) {
      Alert.alert('안내', '이 계정은 비밀번호 방식이 아닙니다. (Google/Apple 등) 비밀번호 변경을 사용할 수 없습니다.');
      return;
    }
    const cur = String(pwCurrent || '');
    const n1 = String(pwNext || '');
    const n2 = String(pwNext2 || '');
    if (!cur.trim() || !n1.trim() || !n2.trim()) {
      Alert.alert('오류', '기존 비밀번호/새 비밀번호/확인 비밀번호를 모두 입력해 주세요.');
      return;
    }
    if (n1 !== n2) {
      Alert.alert('오류', '새 비밀번호와 확인 비밀번호가 일치하지 않습니다.');
      return;
    }
    if (n1.length < 6) {
      Alert.alert('오류', '새 비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }
    if (!user.email) {
      Alert.alert('오류', '이메일 계정에서만 비밀번호 변경이 가능합니다.');
      return;
    }
    setPwBusy(true);
    try {
      const cred = EmailAuthProvider.credential(user.email, cur);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, n1);
      Alert.alert('완료', '비밀번호가 변경되었습니다.');
      setPwModalOpen(false);
      setPwCurrent('');
      setPwNext('');
      setPwNext2('');
    } catch (e: any) {
      const msg = String(e?.message || e || '');
      if (msg.toLowerCase().includes('wrong-password') || msg.toLowerCase().includes('invalid-credential')) {
        Alert.alert('오류', '기존 비밀번호가 올바르지 않습니다.');
      } else if (msg.toLowerCase().includes('requires-recent-login')) {
        Alert.alert('오류', '보안을 위해 다시 로그인 후 시도해 주세요.');
      } else {
        Alert.alert('오류', msg || '비밀번호 변경에 실패했습니다.');
      }
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}> 
        <Pressable style={styles.triangle} onPress={onClose} />
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{t('profile', language)}</Text>
          </View>

          <View style={[styles.card, { alignItems: 'center' }]}> 
            <View style={{ width: 112, alignItems:'center' }}>
              <View style={{ width: 96, height: 96, borderRadius: 48, overflow: 'hidden', borderWidth: 2, borderColor: GOLD }}>
                <Image source={photoUri ? { uri: photoUri } : require('@/assets/images/default-avatar.png')} style={{ width:'100%', height:'100%' }} contentFit="cover" />
                {/* 가독성 오버레이: 하단 그라데이션 + 텍스트 대비 자동 */}
                <View style={{ position:'absolute', left:0, right:0, bottom:0, height: 28, backgroundColor:'rgba(0,0,0,0.35)' }} />
              </View>
              <TouchableOpacity style={[styles.photoBtn,{ zIndex: 2, marginTop: 8 }]} onPress={pickImage} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.photoBtnText}>{t('changePhoto', language)}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.card, styles.cardAccount]}>
            <View style={styles.accountInfo}>
              <Text style={styles.cardTitle}>{t('account', language)}</Text>
              <Text style={styles.label}>{t('username', language)}</Text>
              <Text style={styles.valueText}>{username || email.split('@')[0]}</Text>
              <Text style={styles.label}>{t('email', language)}</Text>
              <Text style={styles.valueText}>{email}</Text>
            </View>
            <View style={styles.accountActions}>
              <View style={{ alignItems: 'flex-end' }}>
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => setPwModalOpen(true)}
                  style={[styles.logoutBtn, { marginBottom: 6, backgroundColor: '#1A1A1A', borderColor: GOLD }]}
                >
                  <Text style={styles.logoutBtnText}>비밀번호 변경</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={async () => {
                    try { await signOut(); } catch {}
                    try { await AsyncStorage.removeItem('yoo-kakao-rooms-store'); } catch {}
                    try { await AsyncStorage.removeItem('yoo-chat-profile-store'); } catch {}
                    try { await AsyncStorage.removeItem('yoo-chat-settings-store'); } catch {}
                    try { require('expo-router').router.replace('/(auth)/login'); } catch {}
                    onClose();
                  }}
                  style={[styles.logoutBtn, { marginBottom: 6 }]}
                >
                  <Text style={styles.logoutBtnText}>{t('logout', language)}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={async () => {
                    try { await signOut(); } catch {}
                    try { await AsyncStorage.removeItem('yoo-kakao-rooms-store'); } catch {}
                    try { await AsyncStorage.removeItem('yoo-chat-profile-store'); } catch {}
                    try { await AsyncStorage.removeItem('yoo-chat-settings-store'); } catch {}
                    try { require('expo-router').router.replace('/(auth)/login'); } catch {}
                    onClose();
                  }}
                  style={styles.logoutBtn}
                >
                  <Text style={styles.logoutBtnText}>{t('switchAccount', language)}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <Modal transparent visible={pwModalOpen} animationType="fade" onRequestClose={() => setPwModalOpen(false)}>
            <Pressable style={styles.pwBackdrop} onPress={() => setPwModalOpen(false)} />
            <View style={styles.pwModalCard}>
              <Text style={styles.pwTitle}>비밀번호 변경</Text>
              <Text style={styles.pwDesc}>기존 비밀번호로 재인증 후 새 비밀번호로 변경합니다.</Text>
              <Text style={styles.label}>기존 비밀번호</Text>
              <TextInput
                style={styles.input}
                value={pwCurrent}
                onChangeText={setPwCurrent}
                placeholder="Current password"
                placeholderTextColor="#9BA1A6"
                secureTextEntry
                autoCapitalize="none"
              />
              <Text style={[styles.label, { marginTop: 10 }]}>새 비밀번호</Text>
              <TextInput
                style={styles.input}
                value={pwNext}
                onChangeText={setPwNext}
                placeholder="New password"
                placeholderTextColor="#9BA1A6"
                secureTextEntry
                autoCapitalize="none"
              />
              <Text style={[styles.label, { marginTop: 10 }]}>새 비밀번호 확인</Text>
              <TextInput
                style={styles.input}
                value={pwNext2}
                onChangeText={setPwNext2}
                placeholder="Confirm new password"
                placeholderTextColor="#9BA1A6"
                secureTextEntry
                autoCapitalize="none"
              />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14, justifyContent: 'flex-end' }}>
                <TouchableOpacity onPress={() => setPwModalOpen(false)} style={[styles.pwBtn, { backgroundColor: '#111' }]} disabled={pwBusy}>
                  <Text style={styles.pwBtnText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleChangePassword} style={[styles.pwBtn, { backgroundColor: GOLD }]} disabled={pwBusy}>
                  <Text style={[styles.pwBtnText, { color: '#000' }]}>{pwBusy ? '변경 중...' : '변경'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('basicInfo', language)}</Text>
            <View style={styles.row2}>
              <View style={styles.inputHalfWrap}>
                <Text style={styles.label}>{t('firstName', language)}</Text>
                <TextInput style={styles.input} placeholder="First name" placeholderTextColor="#9BA1A6" value={firstName} onChangeText={setFirstName} />
              </View>
              <View style={styles.inputHalfWrap}>
                <Text style={styles.label}>{t('lastName', language)}</Text>
                <TextInput style={styles.input} placeholder="Last name" placeholderTextColor="#9BA1A6" value={lastName} onChangeText={setLastName} />
              </View>
            </View>
            <Text style={styles.label}>{t('username', language)}</Text>
            <TextInput style={styles.input} placeholder="username" placeholderTextColor="#9BA1A6" value={username} onChangeText={setUsername} />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('preferences', language)}</Text>
            <Text style={styles.label}>{t('language', language)}</Text>
            <View style={styles.pillRow}>
              {(['en','ko','ja','zh'] as const).map((l) => (
                <Pressable key={l} onPress={() => setLanguage(l)} style={[styles.pill, language===l && styles.pillActive]}>
                  <Text style={[styles.pillText, language===l && styles.pillTextActive]}>{l.toUpperCase()}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.label,{ marginTop:8 }]}>{t('currency', language)}</Text>
            <View style={styles.pillRow}>
              {(['USD','KRW'] as const).map((c) => (
                <Pressable key={c} onPress={() => setCurrency(c as any)} style={[styles.pill, currency===c && styles.pillActive]}>
                  <Text style={[styles.pillText, currency===c && styles.pillTextActive]}>{c}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('chat', language)}</Text>
            <Text style={styles.label}>{t('chatNickname', language)}</Text>
            <TextInput style={styles.input} placeholder="YOOY-JCH" placeholderTextColor="#9BA1A6" value={chatNick} onChangeText={setChatNick} />
            <View style={styles.rowBetween}>
              <Text style={styles.label}>{t('useHashInChat', language)}</Text>
              <Switch value={useHash} onValueChange={(v)=>setUseHash(Boolean(v))} thumbColor={useHash ? GOLD : '#666'} trackColor={{ true: 'rgba(212,175,55,0.5)', false: '#333' }} />
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('contactUs', language)}</Text>
            <View style={styles.row2}>
              <View style={styles.inputHalfWrap}>
                <Text style={styles.label}>{t('phone', language)}</Text>
                <TextInput style={styles.input} placeholder={`${(language||'en').startsWith('ko')?'+82':((language||'en').startsWith('ja')?'+81':((language||'en').startsWith('zh')?'+86':'+01'))} 10-1234-5678`} placeholderTextColor="#9BA1A6" keyboardType="phone-pad" />
              </View>
              <View style={styles.inputHalfWrap}>
                <Text style={styles.label}>{t('website', language)}</Text>
                <TextInput style={styles.input} placeholder="https://" placeholderTextColor="#9BA1A6" autoCapitalize="none" />
              </View>
            </View>
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            onPress={handleDeleteAccount}
            disabled={deleting}
            style={[styles.deleteBtn, deleting && { opacity: 0.6 }]}
          >
            <Text style={styles.deleteBtnText}>
              {deleting ? (language === 'en' ? 'Deleting...' : '삭제 중...') : (language === 'en' ? 'Delete Account' : '계정 삭제')}
            </Text>
          </TouchableOpacity>

          <Pressable onPress={handleDone} style={styles.closeBtn}>
            <Text style={styles.closeText}>{t('apply', language) || t('save', language)}</Text>
          </Pressable>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const GOLD = '#D4AF37';

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 56, // keep bottom tab bar visible
    top: 56, // fill from below TopBar to above TabBar
    backgroundColor: '#0A0A0A',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    borderTopWidth: 1,
    borderColor: GOLD,
  },
  triangle: {
    position: 'absolute',
    top: -1,
    left: '50%',
    marginLeft: -12,
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderTopWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: GOLD,
  },
  scrollContent: { paddingBottom: 16 },
  headerRow: { alignItems: 'center', marginTop: 6 },
  title: { color: '#fff', fontWeight: '700', fontSize: 16, marginBottom: 12 },
  row: { marginBottom: 12 },
  row2: { flexDirection: 'row', gap: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  inputHalfWrap: { flex: 1 },
  card: { borderWidth: 1, borderColor: GOLD, borderRadius: 12, padding: 12, marginBottom: 12 },
  cardAccount: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  cardTitle: { color: '#fff', fontWeight: '700', marginBottom: 8 },
  label: { color: '#9BA1A6', marginBottom: 6 },
  valueText: { color: '#fff', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: GOLD, borderRadius: 8, padding: Platform.select({ web: 12, default: 10 }) as number, color: '#fff', backgroundColor: 'rgba(212,175,55,0.08)', marginBottom: 8 },
  pillRow: { flexDirection: 'row', gap: 8 },
  pill: { borderWidth: 1, borderColor: '#555', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  pillActive: { borderColor: GOLD, backgroundColor: 'rgba(212,175,55,0.12)' },
  pillText: { color: '#9BA1A6' },
  pillTextActive: { color: GOLD, fontWeight: '700' },
  profilePhoto: { width: 96, height: 96, borderRadius: 48, borderWidth: 2, borderColor: GOLD, marginBottom: 8 },
  photoBtn: { backgroundColor: GOLD, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  photoBtnText: { color: '#000', fontWeight: '700' },
  closeBtn: { marginTop: 8, backgroundColor: GOLD, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  closeText: { color: '#000', fontWeight: '700' },
  deleteBtn: { marginTop: 8, borderWidth: 1, borderColor: '#E35D6A', backgroundColor: 'rgba(227,93,106,0.12)', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  deleteBtnText: { color: '#E35D6A', fontWeight: '800' },
  logoutBtn: { borderWidth: 1, borderColor: GOLD, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(212,175,55,0.12)' },
  logoutBtnText: { color: GOLD, fontWeight: '700' },
  accountActions: { flexDirection: 'row', alignItems: 'flex-end' },
  pwBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  pwModalCard: {
    position: 'absolute',
    left: 18,
    right: 18,
    top: '20%',
    backgroundColor: '#0A0A0A',
    borderWidth: 1,
    borderColor: GOLD,
    borderRadius: 14,
    padding: 14,
  },
  pwTitle: { color: '#fff', fontWeight: '900', fontSize: 16, marginBottom: 6 },
  pwDesc: { color: '#9BA1A6', fontSize: 12, marginBottom: 12 },
  pwBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#2A2A2A' },
  pwBtnText: { color: '#fff', fontWeight: '800' },
});


