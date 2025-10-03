import { useAuth } from '@/contexts/AuthContext';
import { Link, Redirect } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Button, Image, Platform, StyleSheet, TextInput, View } from 'react-native';

export default function LoginScreen() {
  const { isAuthenticated, isLoading, signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <View style={styles.container}>
      <Image source={require('@/assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
      {(isLoading || submitting) ? <ActivityIndicator /> : null}
      <TextInput
        style={styles.input}
        placeholder="Username"
        autoCapitalize="none"
        value={username}
        onChangeText={setUsername}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error ? <View style={styles.error}><ActivityIndicator style={{ marginRight: 8 }} /> </View> : null}
      <Button
        title="Sign In"
        onPress={async () => {
          setSubmitting(true);
          setError(null);
          try {
            await signIn({ username, password });
          } finally {
            setSubmitting(false);
          }
        }}
        disabled={!username || !password || submitting}
      />
      <View style={{ height: 8 }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Link href="/(auth)/register">Create account</Link>
        <Link href="/(auth)/forgot">Forgot password?</Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  logo: {
    width: 160,
    height: 80,
    alignSelf: 'center',
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D4AF37',
    padding: Platform.select({ web: 12, default: 10 }) as number,
    marginBottom: 12,
    borderRadius: 8,
    color: '#fff',
    backgroundColor: 'rgba(212,175,55,0.08)'
  },
  error: {
    marginBottom: 12,
    padding: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(255,0,0,0.12)'
  },
});


