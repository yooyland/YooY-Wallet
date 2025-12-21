import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useChatStore } from '@/src/features/chat/store/chat.store';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack } from 'expo-router';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function CreateChannelScreen() {
  const { currentServer, createChannel } = useChatStore();
  const [channelName, setChannelName] = useState('');
  const [channelType, setChannelType] = useState<'text' | 'voice' | 'secret' | 'ttl'>('text');
  const [topic, setTopic] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [channelColor, setChannelColor] = useState('#FFB6C1'); // 기본 파스텔 핑크

  const availableFeatures = [
    { id: 'file-sharing', name: '파일 공유', icon: '📁', description: '파일 및 이미지 업로드' },
    { id: 'emoji-reactions', name: '이모지 반응', icon: '😀', description: '메시지에 이모지 반응' },
    { id: 'threads', name: '스레드', icon: '🧵', description: '메시지 스레드 기능' },
    { id: 'mentions', name: '멘션', icon: '@', description: '사용자 멘션 알림' },
    { id: 'pinned-messages', name: '고정 메시지', icon: '📌', description: '중요 메시지 고정' },
    { id: 'voice-messages', name: '음성 메시지', icon: '🎵', description: '음성 메시지 전송' },
    { id: 'screen-sharing', name: '화면 공유', icon: '🖥️', description: '화면 공유 기능' },
    { id: 'bot-commands', name: '봇 명령어', icon: '🤖', description: '봇 명령어 사용' },
  ];

  const pastelColors = [
    '#FFB6C1', // 파스텔 핑크
    '#FFE4E1', // 미스트 로즈
    '#E6E6FA', // 라벤더
    '#F0E68C', // 카키
    '#98FB98', // 페일 그린
    '#F5DEB3', // 휘트
    '#FFEFD5', // 파파야 휘프
    '#E0FFFF', // 라이트 시안
    '#F0F8FF', // 앨리스 블루
    '#FFF8DC', // 코른실크
  ];

  const toggleFeature = (featureId: string) => {
    setSelectedFeatures(prev => 
      prev.includes(featureId) 
        ? prev.filter(id => id !== featureId)
        : [...prev, featureId]
    );
  };

  const handleCreateChannel = async () => {
    if (!channelName.trim()) {
      Alert.alert('오류', '채널 이름을 입력해주세요.');
      return;
    }

    if (!currentServer) {
      Alert.alert('오류', '서버를 선택해주세요.');
      return;
    }

    setIsCreating(true);
    
    try {
      const channel = await createChannel({
        name: channelName.trim(),
        type: channelType,
        topic: topic.trim(),
        color: channelColor,
        features: selectedFeatures,
        serverId: currentServer.id,
      });

      Alert.alert('성공', `${channelName} 채널이 생성되었습니다!`);
      router.back();
    } catch (error) {
      Alert.alert('오류', '채널 생성에 실패했습니다.');
      console.error('Channel creation failed:', error);
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
          <ThemedText style={styles.headerTitle}>채널 만들기</ThemedText>
          <View style={{ width: 30 }} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={true}>
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>채널 이름</ThemedText>
              <TextInput
                style={styles.input}
                value={channelName}
                onChangeText={setChannelName}
                placeholder="채널 이름을 입력하세요"
                placeholderTextColor="#666"
                maxLength={50}
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>채널 설명 (선택사항)</ThemedText>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={topic}
                onChangeText={setTopic}
                placeholder="채널에 대한 설명을 입력하세요"
                placeholderTextColor="#666"
                multiline
                numberOfLines={3}
                maxLength={200}
              />
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>채널 타입</ThemedText>
              <View style={styles.typeContainer}>
                {(['text', 'voice', 'secret', 'ttl'] as const).map(type => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.typeButton, channelType === type && styles.activeTypeButton]}
                    onPress={() => setChannelType(type)}
                  >
                    <ThemedText style={[styles.typeButtonText, channelType === type && styles.activeTypeButtonText]}>
                      {type === 'text' && '텍스트'}
                      {type === 'voice' && '음성'}
                      {type === 'secret' && '비밀'}
                      {type === 'ttl' && 'TTL'}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>채널 색상</ThemedText>
              <View style={styles.colorContainer}>
                {pastelColors.map((color, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.colorButton,
                      { backgroundColor: color },
                      channelColor === color && styles.selectedColorButton
                    ]}
                    onPress={() => setChannelColor(color)}
                  />
                ))}
              </View>
            </View>

            <View style={styles.features}>
              <ThemedText style={styles.featuresTitle}>포함시킬 기능</ThemedText>
              <View style={styles.featureList}>
                {availableFeatures.map((feature) => (
                  <TouchableOpacity
                    key={feature.id}
                    style={[
                      styles.featureItem,
                      selectedFeatures.includes(feature.id) && styles.selectedFeatureItem
                    ]}
                    onPress={() => toggleFeature(feature.id)}
                  >
                    <Text style={styles.featureIcon}>{feature.icon}</Text>
                    <ThemedText style={styles.featureText}>{feature.name}</ThemedText>
                    <ThemedText style={styles.featureDescription}>{feature.description}</ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={styles.createButton}
              onPress={handleCreateChannel}
              disabled={isCreating}
            >
              <LinearGradient
                colors={['#D4AF37', '#B9972C']}
                style={styles.createButtonGradient}
              >
                <ThemedText style={styles.createButtonText}>
                  {isCreating ? '생성 중...' : '채널 만들기'}
                </ThemedText>
            </LinearGradient>
          </TouchableOpacity>
        </View>
        </ScrollView>
      </ThemedView>
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
    borderBottomColor: '#D4AF37',
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
    padding: 16,
  },
  form: {
    flex: 1,
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#F6F6F6',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#1A1A1A',
    color: '#F6F6F6',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  typeContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
  },
  activeTypeButton: {
    backgroundColor: '#D4AF37',
    borderColor: '#FFD700',
  },
  typeButtonText: {
    fontSize: 14,
    color: '#B8B8B8',
  },
  activeTypeButtonText: {
    color: '#0C0C0C',
    fontWeight: 'bold',
  },
  colorContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  colorButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedColorButton: {
    borderColor: '#D4AF37',
    borderWidth: 3,
  },
  features: {
    marginBottom: 32,
  },
  featuresTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F6F6F6',
    marginBottom: 16,
  },
  featureList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  featureItem: {
    width: '48%',
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 12,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#2A2A2A',
    alignItems: 'center',
  },
  selectedFeatureItem: {
    backgroundColor: '#2A2A2A',
    borderColor: '#FFD700',
  },
  featureIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  featureText: {
    fontSize: 14,
    color: '#F6F6F6',
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
  },
  featureDescription: {
    fontSize: 11,
    color: '#B8B8B8',
    textAlign: 'center',
    lineHeight: 14,
  },
  createButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  createButtonGradient: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0C0C0C',
  },
});