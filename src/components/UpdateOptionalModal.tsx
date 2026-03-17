/**
 * Optional update modal: user can dismiss (나중에) or go to store (업데이트).
 * KakaoTalk-style: clean modal, YooY Land branding.
 * Dismissal is cached by the hook (e.g. 24h) to avoid spamming.
 */

import React from 'react';
import { Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { VersionConfig } from '@/src/services/versionCheck';

const STORE_URL_ANDROID = 'https://play.google.com/store/apps/details?id=com.yooyland.wallet';

function openStore(url?: string) {
  const link = url || STORE_URL_ANDROID;
  try {
    Linking.openURL(link);
  } catch {}
}

export interface UpdateOptionalModalProps {
  visible: boolean;
  config: VersionConfig | null;
  onDismiss: () => void;
}

export default function UpdateOptionalModal({ visible, config, onDismiss }: UpdateOptionalModalProps) {
  const onUpdate = () => openStore(config?.storeUrl);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Text style={styles.icon}>✨</Text>
          </View>
          <Text style={styles.title}>새로운 버전이 있습니다</Text>
          <Text style={styles.message}>
            더 안정적인 YooY Land 사용을 위해 최신 버전으로 업데이트해 주세요.
          </Text>
          {config?.updateMessage ? (
            <Text style={styles.subMessage}>{config.updateMessage}</Text>
          ) : null}
          <View style={styles.buttons}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={onDismiss}
              activeOpacity={0.85}
            >
              <Text style={styles.secondaryButtonText}>나중에</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={onUpdate}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>업데이트</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(212, 175, 55, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  icon: {
    fontSize: 28,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F6F6F6',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    color: '#B0B0B0',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 8,
  },
  subMessage: {
    fontSize: 13,
    color: '#D4AF37',
    marginBottom: 24,
    textAlign: 'center',
  },
  buttons: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: '#444',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#B0B0B0',
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#D4AF37',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0C0C0C',
  },
});
