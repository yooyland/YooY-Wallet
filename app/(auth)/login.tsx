import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { t } from '@/i18n/index';
import { AntDesign, Ionicons } from '@expo/vector-icons';
import { Link, Redirect, router } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import { ActivityIndicator, Image, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, KeyboardAvoidingView, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SOCIAL_LOGIN_ENABLED } from '@/lib/featureFlags';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const REMEMBER_FLAGS_KEY = 'auth.remember.flags';
const REMEMBER_USERNAME_KEY = 'auth.remember.username';
const REMEMBER_PASSWORD_KEY = 'auth.remember.password';

export default function LoginScreen() {
  const { isAuthenticated, isLoading, signIn, signInWithGoogle, signInWithApple } = useAuth();
  const { language } = usePreferences();
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  // 자동 로그인 하나로 통합(아이디/비밀번호 저장 포함)
  const [autoLogin, setAutoLogin] = useState(false);
  const triedAutoRef = useRef(false);

  // Load saved credentials (웹은 AsyncStorage — AuthContext·SecureStore 웹 이슈와 동일 키)
  useEffect(() => {
    (async () => {
      try {
        const getFlags = () =>
          Platform.OS === 'web'
            ? AsyncStorage.getItem(REMEMBER_FLAGS_KEY)
            : SecureStore.getItemAsync(REMEMBER_FLAGS_KEY);
        const getUser = () =>
          Platform.OS === 'web'
            ? AsyncStorage.getItem(REMEMBER_USERNAME_KEY)
            : SecureStore.getItemAsync(REMEMBER_USERNAME_KEY);
        const getPw = () =>
          Platform.OS === 'web'
            ? AsyncStorage.getItem(REMEMBER_PASSWORD_KEY)
            : SecureStore.getItemAsync(REMEMBER_PASSWORD_KEY);
        const flagsRaw = await getFlags();
        if (flagsRaw) { try { const f = JSON.parse(flagsRaw) as { autoLogin?: boolean }; setAutoLogin(!!f.autoLogin); } catch {} }
        const savedId = await getUser();
        const savedPw = await getPw();
        if (savedId) setUsername(savedId);
        if (savedPw) setPassword(savedPw);
      } catch {}
    })();
  }, []);

  // Auto-login once if enabled and fields present
  useEffect(() => {
    if (isAuthenticated) return;
    if (!autoLogin) return;
    if (triedAutoRef.current) return;
    if (!username || !password) return;
    triedAutoRef.current = true;
    (async () => {
      setSubmitting(true);
      setError(null);
      try { await signIn({ username, password }); } catch (e: any) { setError(e?.message ?? 'Sign in failed'); } finally { setSubmitting(false); }
    })();
  }, [autoLogin, username, password, isAuthenticated]);

  if (isAuthenticated) {
    return <Redirect href="/(tabs)/dashboard" />;
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
    >
      <View style={styles.container}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <View style={styles.content}>
            <View style={styles.topArea}>
              <Text style={[styles.sloganLarge, styles.sloganTopSpacing]}>{t('sloganLine1', language as any)}</Text>
              <Text style={[styles.sloganLarge, styles.sloganSecondLine]}>{t('sloganLine2', language as any)}</Text>
            </View>

            <View style={styles.formArea}>
              <Image source={require('@/assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
              {(Platform.OS === 'web' ? submitting : isLoading || submitting) ? <ActivityIndicator /> : null}
              <TextInput
                style={styles.input}
                placeholder={t('email', language as any)}
                placeholderTextColor="#9BA1A6"
                autoCapitalize="none"
                value={username}
                onChangeText={setUsername}
              />
              <View style={styles.labelRow}>
                <Text style={styles.label}>{t('password', language as any)}</Text>
                <Link href="/(auth)/forgot" style={styles.linkSmall}>{t('forgotPassword', language as any)}</Link>
              </View>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.inputRowField}
                  placeholder="********"
                  placeholderTextColor="#9BA1A6"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn}>
                  <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color="#D4AF37" />
                </TouchableOpacity>
              </View>
              {/* 자동 로그인 (아이디/비밀번호 저장 포함) */}
              <View style={{ marginBottom: 10, flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
                <Text style={{ color:'#9BA1A6' }}>자동 로그인</Text>
                <Switch value={autoLogin} onValueChange={setAutoLogin} thumbColor={autoLogin ? '#D4AF37' : '#666'} trackColor={{ true: '#D4AF3780', false: '#333' }} />
              </View>
              {error ? (
                <View style={styles.error}>
                  <Text style={{ color: '#ff6b6b' }}>{String(error)}</Text>
                </View>
              ) : null}
              <TouchableOpacity
                activeOpacity={0.8}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={[styles.ctaButton, (!username || !password || submitting) && { opacity: 0.6 }]}
                disabled={!username || !password || submitting}
                onPress={async () => {
                  setSubmitting(true);
                  setError(null);
                  try {
                    await signIn({ username, password });
                    // 자동 로그인 설정에 따라 자격 증명 저장/삭제
                    try {
                      if (Platform.OS === 'web') {
                        await AsyncStorage.setItem(REMEMBER_FLAGS_KEY, JSON.stringify({ autoLogin }));
                        if (autoLogin) {
                          await AsyncStorage.setItem(REMEMBER_USERNAME_KEY, username);
                          await AsyncStorage.setItem(REMEMBER_PASSWORD_KEY, password);
                        } else {
                          await AsyncStorage.multiRemove([REMEMBER_USERNAME_KEY, REMEMBER_PASSWORD_KEY]);
                        }
                      } else {
                        await SecureStore.setItemAsync(REMEMBER_FLAGS_KEY, JSON.stringify({ autoLogin }));
                        if (autoLogin) {
                          await SecureStore.setItemAsync(REMEMBER_USERNAME_KEY, username);
                          await SecureStore.setItemAsync(REMEMBER_PASSWORD_KEY, password);
                        } else {
                          await SecureStore.deleteItemAsync(REMEMBER_USERNAME_KEY);
                          await SecureStore.deleteItemAsync(REMEMBER_PASSWORD_KEY);
                        }
                      }
                    } catch {}
                  } catch (e: any) {
                    setError(e?.message ?? 'Sign in failed');
                  } finally {
                    setSubmitting(false);
                  }
                }}>
                <Text style={styles.ctaText}>{t('login', language as any)}</Text>
              </TouchableOpacity>

              <View style={{ height: 8 }} />
              <View style={styles.dividerRow}>
                <View style={styles.divider} />
                <Text style={{ color: '#9BA1A6', marginHorizontal: 8 }}>{t('or', language as any)}</Text>
                <View style={styles.divider} />
              </View>
              <View style={styles.providersRow}>
                <TouchableOpacity
                  style={[styles.providerCircle, { backgroundColor: '#fff' }]}
                  onPress={async () => {
                    setError(null);
                    setSubmitting(true);
                    try {
                      await signInWithGoogle();
                    } catch (e: any) {
                      setError(e?.message ?? 'Google 로그인에 실패했습니다.');
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                  disabled={submitting}
                >
                  <AntDesign name="google" size={20} color="#DB4437" />
                </TouchableOpacity>
                {SOCIAL_LOGIN_ENABLED && Platform.OS === 'ios' ? (
                  <TouchableOpacity style={[styles.providerCircle, { backgroundColor: '#000' }]} onPress={async () => { setError(null); setSubmitting(true); try { await signInWithApple(); } catch (e: any) { setError(e?.message ?? 'Apple 로그인에 실패했습니다.'); } finally { setSubmitting(false); } }}>
                    <Ionicons name="logo-apple" size={22} color="#fff" />
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={{ height: 12 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ color: '#9BA1A6' }}>{t('noAccountQuestion', language as any)} </Text>
                <TouchableOpacity onPress={() => router.push('/(auth)/register')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.link}>{t('signUp', language as any)}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <Text style={styles.copyright}>© YooY Land. All rights reserved.</Text>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    backgroundColor: '#000000',
  },
  // Important: In ScrollView, avoid inner flex:1 which can break centering on some Android devices.
  scrollContent: { flexGrow: 1, justifyContent: 'center' },
  content: { justifyContent: 'center' },
  topArea: { paddingTop: 12, alignItems: 'center' },
  sloganLarge: { color: '#D4AF37', textAlign: 'center', fontSize: 25, lineHeight: 28, fontWeight: '700' },
  sloganTopSpacing: { marginTop: 16 },
  sloganSecondLine: { marginTop: 6 },
  logo: { width: 160, height: 80, marginTop: 0, marginBottom: 20, alignSelf: 'center' },
  formArea: { width: '100%', maxWidth: 420, alignSelf: 'center' },
  input: {
    borderWidth: 1,
    borderColor: '#D4AF37',
    padding: Platform.select({ web: 12, default: 10 }) as number,
    marginBottom: 12,
    borderRadius: 8,
    color: '#fff',
    backgroundColor: 'rgba(212,175,55,0.08)'
  },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { color: '#9BA1A6', marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#D4AF37', borderRadius: 8, backgroundColor: 'rgba(212,175,55,0.08)', marginBottom: 12 },
  inputRowField: { flex: 1, padding: Platform.select({ web: 12, default: 10 }) as number, color: '#fff' },
  eyeBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  error: { marginBottom: 12, padding: 8, borderRadius: 6, backgroundColor: 'rgba(255,0,0,0.12)' },
  link: { color: '#D4AF37', fontWeight: '600' },
  linkSmall: { color: '#D4AF37', fontWeight: '600', fontSize: 12 },
  ctaButton: { backgroundColor: '#D4AF37', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  ctaText: { color: '#000000', fontWeight: '700' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 8 },
  divider: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#333' },
  providersRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 18 },
  providerCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#333' },
  googleBtn: { backgroundColor: '#ffffff', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  googleText: { color: '#111', fontWeight: '600' },
  copyright: { textAlign: 'center', color: '#555', fontSize: 12, paddingBottom: 8 },
});


