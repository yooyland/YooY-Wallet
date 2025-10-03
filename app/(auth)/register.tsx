import { useAuth } from '@/contexts/AuthContext';
import { Link, Redirect } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Button, Platform, StyleSheet, TextInput, View } from 'react-native';

export default function RegisterScreen() {
  const { isAuthenticated, isLoading, signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <View style={styles.container}>
      {(isLoading || submitting) ? <ActivityIndicator /> : null}
      <TextInput style={styles.input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
      <Button title="Create Account" onPress={async () => { setSubmitting(true); try { await signUp({ email, password }); } finally { setSubmitting(false); } }} disabled={!email || !password || submitting} />
      <View style={{ height: 8 }} />
      <Link href="/(auth)/login">Back to Sign In</Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#D4AF37',
    padding: Platform.select({ web: 12, default: 10 }) as number,
    marginBottom: 12,
    borderRadius: 8,
    color: '#fff',
    backgroundColor: 'rgba(212,175,55,0.08)'
  },
});


