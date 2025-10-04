import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { t } from '@/i18n/index';
import { AntDesign, Ionicons } from '@expo/vector-icons';
import { Link, Redirect } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function RegisterScreen() {
  const { isAuthenticated, isLoading, signUp, signInWithGoogle } = useAuth();
  const { language } = usePreferences();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  const canSubmit = email && password && confirm && password === confirm && !submitting;

  return (
    <View style={styles.container}>
      <View style={styles.contentShift}>
        <View style={styles.topArea}>
          <Text style={styles.sloganLarge}>{t('slogan', language as any)}</Text>
        </View>

        <View style={styles.formArea}>
          <Image source={require('@/assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
          {(isLoading || submitting) ? <ActivityIndicator /> : null}

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#9BA1A6"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <View style={styles.inputRow}>
            <TextInput
              style={styles.inputRowField}
              placeholder="Password"
              placeholderTextColor="#9BA1A6"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn}>
              <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color="#D4AF37" />
            </TouchableOpacity>
          </View>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.inputRowField}
              placeholder="Confirm Password"
              placeholderTextColor="#9BA1A6"
              secureTextEntry={!showConfirm}
              value={confirm}
              onChangeText={setConfirm}
            />
            <TouchableOpacity onPress={() => setShowConfirm((v) => !v)} style={styles.eyeBtn}>
              <Ionicons name={showConfirm ? 'eye-off' : 'eye'} size={20} color="#D4AF37" />
            </TouchableOpacity>
          </View>

          {error ? (
            <View style={styles.error}>
              <Text style={{ color: '#ff6b6b' }}>{String(error)}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.ctaButton, (!canSubmit) && { opacity: 0.6 }]}
            disabled={!canSubmit}
            onPress={async () => {
              setSubmitting(true);
              setError(null);
              try {
                if (password !== confirm) throw new Error('Passwords do not match');
                await signUp({ email, password });
              } catch (e: any) {
                setError(e?.message ?? 'Sign up failed');
              } finally {
                setSubmitting(false);
              }
            }}>
            <Text style={styles.ctaText}>Create Account</Text>
          </TouchableOpacity>

          <View style={{ height: 8 }} />
          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={{ color: '#9BA1A6', marginHorizontal: 8 }}>Or</Text>
            <View style={styles.divider} />
          </View>

          <View style={styles.providersRow}>
            <TouchableOpacity style={[styles.providerCircle, { backgroundColor: '#fff' }]} onPress={async () => { try { await signInWithGoogle(); } catch (e) {} }}>
              <AntDesign name="google" size={20} color="#DB4437" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.providerCircle, { backgroundColor: '#000' }]} onPress={() => {}}>
              <Ionicons name="logo-apple" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.providerCircle, { backgroundColor: '#1DA1F2' }]} onPress={() => {}}>
              <AntDesign name="twitter" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.providerCircle, { backgroundColor: '#FEE500', overflow: 'hidden' }]} onPress={() => {}}>
              <Image source={{ uri: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQnOACrRJyk-4693gXNbbpXfQ4OVXSWm3sl5g&s' }} style={{ width: '100%', height: '100%', borderRadius: 22 }} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.providerCircle, { backgroundColor: '#1877F2', overflow: 'hidden' }]} onPress={() => {}}>
              <Image source={{ uri: 'https://img.freepik.com/premium-vector/facebook-illustration_1073073-2143.jpg?semt=ais_hybrid&w=740&q=80' }} style={{ width: '100%', height: '100%', borderRadius: 22 }} />
            </TouchableOpacity>
          </View>

          <View style={{ height: 12 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ color: '#9BA1A6' }}>Already have an account? </Text>
            <Link href="/(auth)/login" style={styles.link}>Sign In</Link>
          </View>
        </View>
      </View>

      <Text style={styles.copyright}>© YooY Land. All rights reserved.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#000000',
  },
  contentShift: { flex: 1, transform: [{ translateY: -70 }] },
  topArea: { paddingTop: 24, alignItems: 'center' },
  sloganLarge: { color: '#ffffff', textAlign: 'center', marginTop: 100, marginBottom: 0, fontSize: 25, lineHeight: 30, fontWeight: '700' },
  logo: { width: 160, height: 80, marginTop: 0, marginBottom: 20, alignSelf: 'center' },
  formArea: { flex: 1, justifyContent: 'center' },
  input: {
    borderWidth: 1,
    borderColor: '#D4AF37',
    padding: Platform.select({ web: 12, default: 10 }) as number,
    marginBottom: 12,
    borderRadius: 8,
    color: '#fff',
    backgroundColor: 'rgba(212,175,55,0.08)'
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#D4AF37', borderRadius: 8, backgroundColor: 'rgba(212,175,55,0.08)', marginBottom: 12 },
  inputRowField: { flex: 1, padding: Platform.select({ web: 12, default: 10 }) as number, color: '#fff' },
  eyeBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  error: { marginBottom: 12, padding: 8, borderRadius: 6, backgroundColor: 'rgba(255,0,0,0.12)' },
  link: { color: '#D4AF37', fontWeight: '600' },
  ctaButton: { backgroundColor: '#00ffff', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  ctaText: { color: '#000000', fontWeight: '700' },
  providersRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12 },
  providerCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#333' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 12 },
  divider: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#2a2a2a' },
  copyright: { textAlign: 'center', color: '#555', fontSize: 12, paddingBottom: 8 },
});


