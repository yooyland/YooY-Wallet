import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useKakaoRoomsStore } from '@/src/features/chat/store/kakao-rooms.store';
import { router, Stack } from 'expo-router';
import { firebaseAuth, firestore } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { usePreferences } from '@/contexts/PreferencesContext';
import { t } from '@/i18n';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type DMRoomItemProps = {
  room: any;
  otherDisplayName: string;
  otherAvatar?: string;
  onPress: () => void;
  language: string;
};

const DMRoomRow = React.memo(({ room, otherDisplayName, otherAvatar, onPress, language, onLongPress }: DMRoomItemProps & { onLongPress?: () => void }) => {
  const unread = Math.max(0, Number(room?.unreadCount || 0));
  const lastMsg = room?.lastMessage || t('noMessages', language);
  const lastTime = room?.lastMessageAt
    ? new Date(room.lastMessageAt).toLocaleTimeString(
        language === 'ko' ? 'ko-KR' : language === 'ja' ? 'ja-JP' : language === 'zh' ? 'zh-CN' : 'en-US',
        { hour: '2-digit', minute: '2-digit' }
      )
    : '';

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} onLongPress={onLongPress} activeOpacity={0.8}>
      <View style={styles.avatar}>
        {otherAvatar ? (
          <Image source={{ uri: otherAvatar }} style={styles.avatarImg} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarLetter}>{(otherDisplayName || 'D').charAt(0)}</Text>
          </View>
        )}
      </View>
      <View style={styles.info}>
        <View style={styles.infoTop}>
          <Text style={styles.name} numberOfLines={1}>{otherDisplayName}</Text>
        </View>
        <Text style={styles.preview} numberOfLines={1}>{lastMsg}</Text>
      </View>
      <View style={styles.meta}>
        {lastTime ? <Text style={styles.time}>{lastTime}</Text> : null}
        {unread > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>{unread > 99 ? '99+' : unread}</Text>
          </View>
        )}
        {/* 오른쪽 즉시 나가기 버튼 */}
        <TouchableOpacity
          onPress={onLongPress}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          style={{ marginTop: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: '#7A1F1F' }}
        >
          <Text style={{ color: '#FF6B6B', fontSize: 11, fontWeight: '700' }}>{t('leaveRoom', language) || '나가기'}</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}, (prev, next) =>
  prev.room.id === next.room.id &&
  prev.room.lastMessage === next.room.lastMessage &&
  prev.room.lastMessageAt === next.room.lastMessageAt &&
  prev.room.unreadCount === next.room.unreadCount &&
  prev.otherDisplayName === next.otherDisplayName
);

export default function DMRoomListScreen() {
  const insets = useSafeAreaInsets();
  const { language } = usePreferences();
  const rooms = useKakaoRoomsStore((s) => s.rooms || []);
  const myUid = useMemo(() => firebaseAuth.currentUser?.uid || 'me', []);

  const dmRooms = useMemo(() => {
    const list = rooms.filter((r: any) => String(r?.type) === 'dm');
    return [...list].sort((a: any, b: any) => Number(b?.lastMessageAt || 0) - Number(a?.lastMessageAt || 0));
  }, [rooms]);

  const [profiles, setProfiles] = useState<Record<string, { displayName: string; avatar?: string }>>({});
  const otherUids = useMemo(() => {
    const set = new Set<string>();
    dmRooms.forEach((r: any) => {
      const m = r.members;
      const arr = Array.isArray(m) ? m : (m && typeof m === 'object' ? Object.keys(m) : []);
      const other = arr.find((u: string) => String(u) !== String(myUid));
      if (other) set.add(other);
    });
    return Array.from(set);
  }, [dmRooms, myUid]);

  const leaveRoomAct = useKakaoRoomsStore((s) => s.leaveRoom);
  const [roomIdForDelete, setRoomIdForDelete] = useState<string | null>(null);
  const handleLeaveSingle = useCallback(async (id: string) => {
    const uid = firebaseAuth.currentUser?.uid || 'me';
    setRoomIdForDelete(null);
    try {
      // 로컬에서 먼저 제거
      useKakaoRoomsStore.setState((s: any) => ({ rooms: (s.rooms || []).filter((r: any) => r.id !== id) }));
    } catch {}
    try {
      await leaveRoomAct(id, uid);
    } catch {}
  }, [leaveRoomAct]);

  useEffect(() => {
    let live = true;
    const load = async () => {
      const out: Record<string, { displayName: string; avatar?: string }> = {};
      for (const u of otherUids) {
        try {
          const snap = await getDoc(doc(firestore, 'users', u));
          if (!live) return;
          if (snap.exists()) {
            const d = snap.data() as any;
            const name = d?.chatName || d?.displayName || d?.username || u;
            out[u] = { displayName: name, avatar: d?.avatarUrl || d?.photoURL || d?.avatar };
          } else {
            out[u] = { displayName: u };
          }
        } catch {
          out[u] = { displayName: u };
        }
      }
      if (live) setProfiles((prev) => (Object.keys(out).length ? { ...prev, ...out } : prev));
    };
    load();
    return () => { live = false; };
  }, [otherUids.join(',')]);

  // DM 제목: room.title 저장값 사용 안 함. 항상 상대방 이름으로 동적 해석 (A는 B 이름, B는 A 이름).
  const renderItem = useCallback(
    ({ item: room }: { item: any }) => {
      const members = Array.isArray(room.members) ? room.members : (room.members && typeof room.members === 'object' ? Object.keys(room.members) : []);
      const otherId = members.find((u: string) => String(u) !== String(myUid)) || '';
      const profile = profiles[otherId];
      const displayName = profile?.displayName || otherId || t('dm', language);
      return (
        <DMRoomRow
          room={room}
          otherDisplayName={displayName}
          otherAvatar={profile?.avatar}
          onPress={() => router.push({ pathname: '/chat/room/[id]', params: { id: room.id, type: 'dm' } })}
          onLongPress={() => setRoomIdForDelete(room.id)}
          language={language}
        />
      );
    },
    [myUid, profiles, language]
  );

  const keyExtractor = useCallback((item: any) => item.id, []);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t('dm', language) || '1:1 대화',
          headerBackTitle: t('back', language) || '뒤로',
          headerStyle: { backgroundColor: '#0C0C0C' },
          headerTintColor: '#FFD700',
          headerTitleStyle: { color: '#F6F6F6', fontWeight: '700' },
        }}
      />
      <ThemedView style={[styles.container, { paddingTop: 0 }]}>
        {roomIdForDelete && (
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <TouchableOpacity
              onPress={() => handleLeaveSingle(roomIdForDelete)}
              style={{ paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#7A1F1F', alignItems: 'center', marginBottom: 4 }}
            >
              <Text style={{ color: '#FF6B6B', fontWeight: '800' }}>{t('leaveRoom', language) || '나가기'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setRoomIdForDelete(null)}
              style={{ paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#444', alignItems: 'center' }}
            >
              <Text style={{ color: '#CFCFCF', fontWeight: '600' }}>{t('cancel', language) || '취소'}</Text>
            </TouchableOpacity>
          </View>
        )}
        <FlatList
          data={dmRooms}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: Math.max(insets.bottom, 12) + 24 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <ThemedText style={styles.emptyText}>{t('noMessages', language) || '1:1 대화가 없습니다.'}</ThemedText>
            </View>
          }
        />
      </ThemedView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0C0C0C' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  avatar: { width: 48, height: 48, borderRadius: 24, marginRight: 12, overflow: 'hidden', backgroundColor: '#2A2A2A' },
  avatarImg: { width: 48, height: 48 },
  avatarFallback: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: '#D4AF37', fontSize: 18, fontWeight: '700' },
  info: { flex: 1, minWidth: 0 },
  infoTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { color: '#F6F6F6', fontSize: 15, fontWeight: '700' },
  preview: { color: '#9BA1A6', fontSize: 13, marginTop: 2 },
  meta: { alignItems: 'flex-end', minWidth: 56 },
  time: { color: '#777', fontSize: 11, marginBottom: 4 },
  unreadBadge: { minWidth: 22, paddingHorizontal: 6, height: 22, borderRadius: 11, backgroundColor: '#FF5252', alignItems: 'center', justifyContent: 'center' },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  empty: { padding: 24, alignItems: 'center' },
  emptyText: { color: '#9BA1A6' },
});
