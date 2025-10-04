import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { firebaseAuth } from '@/lib/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { onAuthStateChanged } from 'firebase/auth';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSaved?: (uri: string | null) => void;
};

const PHOTO_KEY = 'profile.photoUri';
const INFO_KEY = 'profile.info';

export default function ProfileSheet({ visible, onClose, onSaved }: Props) {
  const slide = useRef(new Animated.Value(0)).current; // 0 hidden, 1 shown
  const { currentUser } = useAuth();
  const { language, currency, setLanguage, setCurrency } = usePreferences();
  const [useHash, setUseHash] = useState(true);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [email, setEmail] = useState<string>('');
  const [firstName, setFirstName] = useState<string>('');
  const [lastName, setLastName] = useState<string>('');
  const [username, setUsername] = useState<string>('');

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
      const saved = await AsyncStorage.getItem(PHOTO_KEY);
      if (saved) setPhotoUri(saved);
      const savedInfo = await AsyncStorage.getItem(INFO_KEY);
      if (savedInfo) {
        try {
          const parsed = JSON.parse(savedInfo);
          if (parsed.firstName) setFirstName(parsed.firstName);
          if (parsed.lastName) setLastName(parsed.lastName);
          if (parsed.username) setUsername(parsed.username);
        } catch {}
      }
      const currentEmail = currentUser?.email || firebaseAuth.currentUser?.email || (await AsyncStorage.getItem('user.email')) || 'admin@yooyland.com';
      setEmail(currentEmail);
      if (!savedInfo) deriveFromEmail(currentEmail);
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
    const ImagePicker = await import('expo-image-picker');
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      const uri = asset.base64
        ? `data:${asset.type ?? 'image/jpeg'};base64,${asset.base64}`
        : asset.uri;
      setPhotoUri(uri);
    }
  };

  const handleDone = async () => {
    if (photoUri) {
      await AsyncStorage.setItem(PHOTO_KEY, photoUri);
    }
    const info = { firstName, lastName, username };
    await AsyncStorage.setItem(INFO_KEY, JSON.stringify(info));
    onSaved?.(photoUri ?? null);
    onClose();
  };

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}> 
        <Pressable style={styles.triangle} onPress={onClose} />
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Profile</Text>
          </View>

          <View style={[styles.card, { alignItems: 'center' }]}> 
            <Image source={photoUri ? { uri: photoUri } : require('@/assets/images/default-avatar.png')} style={styles.profilePhoto} contentFit="cover" />
            <TouchableOpacity style={styles.photoBtn} onPress={pickImage}><Text style={styles.photoBtnText}>Change Photo</Text></TouchableOpacity>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Account</Text>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.valueText}>{email}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Basic Info</Text>
            <View style={styles.row2}>
              <View style={styles.inputHalfWrap}>
                <Text style={styles.label}>First Name</Text>
                <TextInput style={styles.input} placeholder="First name" placeholderTextColor="#9BA1A6" value={firstName} onChangeText={setFirstName} />
              </View>
              <View style={styles.inputHalfWrap}>
                <Text style={styles.label}>Last Name</Text>
                <TextInput style={styles.input} placeholder="Last name" placeholderTextColor="#9BA1A6" value={lastName} onChangeText={setLastName} />
              </View>
            </View>
            <Text style={styles.label}>Username</Text>
            <TextInput style={styles.input} placeholder="username" placeholderTextColor="#9BA1A6" value={username} onChangeText={setUsername} />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Preferences</Text>
            <Text style={styles.label}>Language</Text>
            <View style={styles.pillRow}>
              {(['en','ko','ja','zh'] as const).map((l) => (
                <Pressable key={l} onPress={() => setLanguage(l)} style={[styles.pill, language===l && styles.pillActive]}>
                  <Text style={[styles.pillText, language===l && styles.pillTextActive]}>{l.toUpperCase()}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.label,{ marginTop:8 }]}>Currency</Text>
            <View style={styles.pillRow}>
              {(['USD','KRW'] as const).map((c) => (
                <Pressable key={c} onPress={() => setCurrency(c as any)} style={[styles.pill, currency===c && styles.pillActive]}>
                  <Text style={[styles.pillText, currency===c && styles.pillTextActive]}>{c}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Chat</Text>
            <Text style={styles.label}>Chat Nickname</Text>
            <TextInput style={styles.input} placeholder="YOOY-JCH" placeholderTextColor="#9BA1A6" />
            <View style={styles.rowBetween}>
              <Text style={styles.label}>Use hash in chat</Text>
              <Switch value={useHash} onValueChange={setUseHash} thumbColor={useHash ? GOLD : '#666'} trackColor={{ true: 'rgba(212,175,55,0.5)', false: '#333' }} />
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Contact Us</Text>
            <View style={styles.row2}>
              <View style={styles.inputHalfWrap}>
                <Text style={styles.label}>Phone</Text>
                <TextInput style={styles.input} placeholder="+82 10-1234-5678" placeholderTextColor="#9BA1A6" keyboardType="phone-pad" />
              </View>
              <View style={styles.inputHalfWrap}>
                <Text style={styles.label}>Website</Text>
                <TextInput style={styles.input} placeholder="https://" placeholderTextColor="#9BA1A6" autoCapitalize="none" />
              </View>
            </View>
          </View>

          <Pressable onPress={handleDone} style={styles.closeBtn}><Text style={styles.closeText}>Done</Text></Pressable>
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
});


