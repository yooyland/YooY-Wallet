import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Button, Platform, StyleSheet, TextInput, View, Alert } from 'react-native';

export default function ForgotScreen() {
  const { isLoading, requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  return (
    <View style={styles.container}>
      {(isLoading || submitting) ? <ActivityIndicator /> : null}
      <TextInput style={styles.input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <Button title="Send reset email" onPress={async () => { setSubmitting(true); try { await requestPasswordReset({ email }); Alert.alert('Sent', 'If the email exists, a reset email has been sent.'); } finally { setSubmitting(false); } }} disabled={!email || submitting} />
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


