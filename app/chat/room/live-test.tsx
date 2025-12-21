// @ts-nocheck
/* eslint-disable */
import { ThemedView } from '@/components/themed-view';
import { firebaseAuth } from '@/lib/firebase';
import { useKakaoRoomsStore } from '@/src/features/chat/store/kakao-rooms.store';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { t } from '@/i18n';
import { usePreferences } from '@/contexts/PreferencesContext';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

// 안정적인 빈 배열 레퍼런스(무한 리렌더 방지)
const EMPTY_MESSAGES: any[] = Object.freeze([]);

export default function ChatRoomLiveTest() {
  const { language } = usePreferences();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const paramRoomId = String(id || '');
  const rooms = useKakaoRoomsStore((s) => s.rooms);
  const currentRoomId = useKakaoRoomsStore((s) => s.currentRoomId);
  const roomId = React.useMemo(() => paramRoomId || currentRoomId || (rooms[0]?.id || ''), [paramRoomId, currentRoomId, rooms]);
  const title = rooms.find((r: any) => r.id === roomId)?.title || '라이브 테스트';
  const messages = useKakaoRoomsStore((s) => s.messages[roomId] ?? EMPTY_MESSAGES);
  const scrollRef = React.useRef<ScrollView | null>(null);

  React.useEffect(() => {
    try { scrollRef.current?.scrollToEnd({ animated: true }); } catch {}
  }, [messages.length]);

  // 라이브 읽기 전용 화면으로 진입 시 바로 일반 채팅 화면으로 리다이렉트
  React.useEffect(() => {
    try {
      if (roomId) {
        router.replace({ pathname: '/chat/room/[id]', params: { id: roomId } as any });
      } else {
        router.replace('/chat/rooms');
      }
    } catch {}
  }, [roomId]);

  // (호환) 잠시 표시되더라도 입력 비활성 문구는 유지되나 곧 리다이렉트됨

  return (
    <ThemedView style={{ flex: 1, backgroundColor: '#0C0C0C' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#1E1E1E' }}>
        <TouchableOpacity onPress={() => { try { router.back(); } catch {} }}>
          <Text style={{ color: '#FFD700', fontSize: 18, fontWeight: '700' }}>←</Text>
        </TouchableOpacity>
        <Text style={{ color: '#F6F6F6', fontSize: 16, fontWeight: '700', marginLeft: 8 }} numberOfLines={1}>{title} (라이브)</Text>
      </View>
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
        {messages.length === 0 ? (
          <View style={{ paddingVertical: 32, alignItems: 'center' }}>
            <Text style={{ color: '#777' }}>{t('noMessages', language)}</Text>
          </View>
        ) : (
          messages.map((m: any) => (
            <View key={m.id} style={{ alignSelf: m.senderId === (firebaseAuth.currentUser?.uid || 'me') ? 'flex-end' : 'flex-start', backgroundColor: m.senderId === (firebaseAuth.currentUser?.uid || 'me') ? '#D4AF37' : '#FFFFFF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, marginVertical: 4, maxWidth: '75%' }}>
              <Text style={{ color: '#0C0C0C' }}>{m.content || (m.imageUrl ? '[이미지]' : '')}</Text>
            </View>
          ))
        )}
      </ScrollView>
      <View style={{ padding: 10, borderTopWidth: 1, borderTopColor: '#1E1E1E', backgroundColor: '#0C0C0C' }}>
        <Text style={{ color: '#AAA', textAlign: 'center' }}>입력/전송 비활성 - 구독만 테스트</Text>
      </View>
    </ThemedView>
  );
}


