import { useAuth } from '@/contexts/AuthContext';
import { Redirect } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Button, Platform, StyleSheet, TextInput, View } from 'react-native';

export default function LoginScreen() {
  const { isAuthenticated, isLoading, signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <View style={styles.container}>
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
      <Button
        title="Sign In"
        onPress={async () => {
          setSubmitting(true);
          try {
            await signIn({ username, password });
          } finally {
            setSubmitting(false);
          }
        }}
        disabled={!username || !password || submitting}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#444',
    padding: Platform.select({ web: 12, default: 10 }) as number,
    marginBottom: 12,
    borderRadius: 8,
    color: '#fff',
  },
});


