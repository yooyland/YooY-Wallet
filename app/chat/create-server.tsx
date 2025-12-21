import ChatBottomBar from '@/components/ChatBottomBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useChatStore } from '@/src/features/chat/store/chat.store';
import { router, Stack } from 'expo-router';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Switch } from 'react-native';

export default function CreateServerScreen() {
  const { createServer, setCurrentServer, createInvite } = useChatStore() as any;
  const [serverName, setServerName] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [isOpenServer, setIsOpenServer] = useState(true); // 초대코드 없이 참여 허용
  const [autoInviteOnCreate, setAutoInviteOnCreate] = useState(false); // 생성 시 초대코드 자동 생성
  const [lastInviteCode, setLastInviteCode] = useState<string | null>(null);

  const availableFeatures = [
    { id: 'text-channels', name: '텍스트 채널', icon: '💬', description: '텍스트 메시지 전송' },
    { id: 'voice-channels', name: '음성 채널', icon: '🎤', description: '음성 통화 및 스트리밍' },
    { id: 'security-channels', name: '보안 채널', icon: '🔒', description: 'E2E 암호화된 비밀 대화' },
    { id: 'ttl-channels', name: 'TTL 채널', icon: '⏰', description: '시간 제한 메시지' },
    { id: 'role-management', name: '역할 관리', icon: '👥', description: '사용자 권한 및 역할 설정' },
    { id: 'file-sharing', name: '파일 공유', icon: '📁', description: '파일 및 이미지 공유' },
    { id: 'screen-sharing', name: '화면 공유', icon: '🖥️', description: '화면 및 화면 녹화 공유' },
    { id: 'bot-integration', name: '봇 통합', icon: '🤖', description: '봇 및 자동화 기능' },
  ];

  const toggleFeature = (featureId: string) => {
    setSelectedFeatures(prev => 
      prev.includes(featureId) 
        ? prev.filter(id => id !== featureId)
        : [...prev, featureId]
    );
  };

  const handleCreateServer = async () => {
    if (!serverName.trim()) {
      Alert.alert('오류', '서버 이름을 입력해주세요.');
      return;
    }

    setIsCreating(true);
    try {
      const server = await createServer({
        name: serverName.trim(),
        description: description.trim(),
        ownerId: (require('@/lib/firebase').firebaseAuth.currentUser?.uid) || 'anonymous',
        members: [],
        channels: [],
        roles: [],
        categories: [],
        settings: {
          verificationLevel: 'none',
          defaultNotifications: 'all',
          explicitContentFilter: 'disabled',
          mfaLevel: 'none',
          premiumTier: 'none',
          invitePolicy: isOpenServer ? 'open' : 'invite',
        } as any,
      });

      setCurrentServer(server);

      if (!isOpenServer && autoInviteOnCreate) {
        try {
          const inv = await createInvite(server.id);
          if (inv?.code) {
            setLastInviteCode(inv.code);
            Alert.alert('초대코드 생성', `코드: ${inv.code}`);
          }
        } catch {}
      }

      router.replace('/chat/server');
    } catch (error) {
      Alert.alert('오류', '서버 생성에 실패했습니다.');
      console.error('Server creation failed:', error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <ThemedText style={styles.backButton}>←</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.headerTitle}>서버 만들기</ThemedText>
          <View style={{ width: 30 }} />
        </View>

        <ScrollView style={styles.content} contentContainerStyle={{ padding: 16, paddingBottom: 120 }} showsVerticalScrollIndicator={true}>
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>서버 이름</ThemedText>
              <TextInput
                style={styles.input}
                value={serverName}
                onChangeText={setServerName}
                placeholder="서버 이름을 입력하세요"
                placeholderTextColor="#666"
                maxLength={50}
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>설명 (선택사항)</ThemedText>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="서버에 대한 설명을 입력하세요"
                placeholderTextColor="#666"
                multiline
                numberOfLines={3}
                maxLength={200}
              />
            </View>

            <View style={styles.inputGroupRow}>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>오픈 서버 (초대코드 없이 참여)</Text>
                <Switch value={isOpenServer} onValueChange={setIsOpenServer} thumbColor={isOpenServer ? '#D4AF37' : '#888'} trackColor={{ true: '#3A2A00', false: '#222' }} />
              </View>
              {!isOpenServer && (
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>생성 시 초대코드 자동 생성</Text>
                  <Switch value={autoInviteOnCreate} onValueChange={setAutoInviteOnCreate} thumbColor={autoInviteOnCreate ? '#D4AF37' : '#888'} trackColor={{ true: '#3A2A00', false: '#222' }} />
                </View>
              )}
              {lastInviteCode && (
                <Text style={styles.inviteCodeText}>최근 생성된 초대코드: {lastInviteCode}</Text>
              )}
            </View>

            <View style={styles.featuresSimple}>
              <ThemedText style={styles.featuresTitle}>포함시킬 기능</ThemedText>
              <View style={styles.featureList}>
                {availableFeatures.map((feature) => (
                  <TouchableOpacity
                    key={feature.id}
                    style={[styles.featureItem, selectedFeatures.includes(feature.id) && styles.selectedFeatureItem]}
                    onPress={() => toggleFeature(feature.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.featureIcon}>{feature.icon}</Text>
                    <ThemedText style={styles.featureText}>{feature.name}</ThemedText>
                    <ThemedText style={styles.featureDescription}>{feature.description}</ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={[styles.createButtonFlat, isCreating && { opacity: 0.7 }]}
              onPress={handleCreateServer}
              disabled={isCreating}
            >
              <ThemedText style={styles.createButtonTextFlat}>
                {isCreating ? '생성 중...' : '서버 만들기'}
              </ThemedText>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </ThemedView>
      <ChatBottomBar active="chat" />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0C0C0C',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  backButton: {
    fontSize: 24,
    color: '#D4AF37',
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F6F6F6',
  },
  content: {
    flex: 1,
  },
  form: {
    flex: 1,
  },
  inputGroup: {
    marginBottom: 18,
  },
  inputGroupRow: {
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F6F6F6',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#111',
    color: '#F6F6F6',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 8,
  },
  toggleLabel: {
    color: '#CFCFCF',
    fontSize: 13,
  },
  inviteCodeText: {
    color: '#FFD700',
    fontSize: 12,
    marginTop: 4,
  },
  featuresSimple: {
    marginTop: 8,
    marginBottom: 20,
  },
  featuresTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F6F6F6',
    marginBottom: 12,
  },
  featureList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  featureItem: {
    width: '48%',
    backgroundColor: '#111',
    paddingHorizontal: 12,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    alignItems: 'center',
  },
  selectedFeatureItem: {
    backgroundColor: '#151515',
    borderColor: '#D4AF37',
  },
  featureIcon: {
    fontSize: 20,
    marginBottom: 8,
  },
  featureText: {
    fontSize: 13,
    color: '#F6F6F6',
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
  },
  featureDescription: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 14,
  },
  createButtonFlat: {
    backgroundColor: '#D4AF37',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 8,
  },
  createButtonTextFlat: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0C0C0C',
  },
});
