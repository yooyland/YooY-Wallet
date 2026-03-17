/**
 * Forced update modal: user cannot dismiss. Must update to continue.
 * KakaoTalk-style: clean modal, YooY Land branding.
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

export interface UpdateRequiredModalProps {
  visible: boolean;
  config: VersionConfig | null;
}

export default function UpdateRequiredModal({ visible, config }: UpdateRequiredModalProps) {
  const onUpdate = () => openStore(config?.storeUrl);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {}}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Text style={styles.icon}>📲</Text>
          </View>
          <Text style={styles.title}>업데이트가 필요합니다</Text>
          <Text style={styles.message}>
            현재 버전은 더 이상 지원되지 않습니다. 계속 사용하려면 최신 버전으로 업데이트해 주세요.
          </Text>
          {config?.updateMessage ? (
            <Text style={styles.subMessage}>{config.updateMessage}</Text>
          ) : null}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={onUpdate}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>업데이트</Text>
          </TouchableOpacity>
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
  primaryButton: {
    width: '100%',
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
