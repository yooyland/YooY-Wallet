import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

export const LoadingOverlay: React.FC<{ visible: boolean; message?: string }> = ({ visible, message }) => {
  if (!visible) return null;
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <ActivityIndicator size="large" color="#D4AF37" />
        <Text style={styles.title}>YooY Land</Text>
        <Text style={styles.subtitle}>{message || 'Loading...'}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  card: {
    backgroundColor: '#121212',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#262626',
    paddingHorizontal: 24,
    paddingVertical: 20,
    alignItems: 'center',
  },
  title: {
    marginTop: 10,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#D4AF37',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: '#B8B8B8',
  },
});







