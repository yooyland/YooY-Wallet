import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, Image, StyleSheet, ScrollView, TextInput, Alert, Share, Platform } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firebaseAuth, firestore } from '@/lib/firebase';
import { useChatProfileStore } from '@/src/features/chat/store/chat-profile.store';
import { collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { getOrCreateDmRoomIdForUsersV2 } from '../services/dmEntryService';
import { resolveChatDisplayNameFromUserDoc } from '../core/chatDisplayName';
import ChatBottomBar from '@/components/ChatBottomBar';

type FriendRow = {
  friendId: string; // uid
  name: string;
  avatarUrl: string;
  status?: string;
};

type CombinedRow =
  | { kind: 'section'; id: string; title: string }
  | { kind: 'empty'; id: string; title: string }
  | { kind: 'friend'; id: string; friend: FriendRow };

export default function ChatFriendsV2() {
  const uid = String(firebaseAuth.currentUser?.uid || '');
  const { currentProfile, initialize } = useChatProfileStore();

  const [friendsDocs, setFriendsDocs] = useState<any[]>([]);
  const [q, setQ] = useState('');

  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [peerCache, setPeerCache] = useState<Record<string, { name: string; avatarUrl: string }>>({});
  /** true = Firestore users/{id} 존재(가입·앱 사용자), false = 없음, undefined = 아직 조회 전 */
  const [friendHasUserDoc, setFriendHasUserDoc] = useState<Record<string, boolean | undefined>>({});

  const inviteStoreUrl = useMemo(() => {
    const androidId = String(process.env.EXPO_PUBLIC_ANDROID_PACKAGE_ID || 'com.yooyland.wallet');
    const iosUrl = String(process.env.EXPO_PUBLIC_IOS_APPSTORE_URL || '').trim();
    const play = `https://play.google.com/store/apps/details?id=${encodeURIComponent(androidId)}`;
    if (Platform.OS === 'ios' && iosUrl) return iosUrl;
    return play;
  }, []);

  useEffect(() => {
    try { initialize?.(); } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      if (!uid) return;
      const ref = query(collection(firestore, 'users', uid, 'friends'), orderBy('createdAt', 'desc'));
      const unsub = onSnapshot(
        ref,
        (snap) => {
          const next = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
          setFriendsDocs(next);
        },
        () => {}
      );
      return () => {
        try { unsub?.(); } catch {}
      };
    } catch {}
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(`u:${uid}:chat.friendsFavorites`);
        if (raw) setFavorites(JSON.parse(raw));
      } catch {}
    })();
  }, [uid]);

  const myFriendsHeaderName = useMemo(() => {
    if (!uid) return '';
    return resolveChatDisplayNameFromUserDoc(uid, (currentProfile || {}) as Record<string, unknown>).trim();
  }, [uid, currentProfile]);

  const toggleFavorite = useCallback(
    async (friendId: string) => {
      if (!uid) return;
      setFavorites((prev) => {
        const next = { ...prev, [friendId]: !prev[friendId] };
        void AsyncStorage.setItem(`u:${uid}:chat.friendsFavorites`, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [uid]
  );

  const friendsAll = useMemo<FriendRow[]>(() => {
    const base = (friendsDocs || [])
      .map((r: any) => {
        const friendId = String(r.userId || r.uid || r.id || '').trim();
        const cached = friendId ? peerCache[friendId] : undefined;
        const name = String(cached?.name || r.chatName || r.displayName || r.name || friendId || '친구').trim();
        const avatarUrl = String(cached?.avatarUrl || r.avatarUrl || r.avatar || r.photoURL || '').trim();
        const status = String(r.status || '').trim();
        return { friendId, name, avatarUrl, status };
      })
      .filter((f: FriendRow) => !!f.friendId)
      .sort((a: FriendRow, b: FriendRow) => a.name.localeCompare(b.name, 'ko'));

    const query = String(q || '').trim().toLowerCase();
    if (!query) return base;
    return base.filter((f) => `${f.name}`.toLowerCase().includes(query));
  }, [friendsDocs, q, peerCache]);

  // 친구 프로필 아바타/이름 보강: users/{friendId}에서 1회 조회(가벼운 캐시)
  useEffect(() => {
    let alive = true;
    const ids = Array.from(
      new Set(
        (friendsDocs || [])
          .map((r: any) => String(r.userId || r.uid || r.id || '').trim())
          .filter(Boolean)
      )
    );
    const missing = ids.filter((id) => !peerCache[id]);
    if (missing.length === 0) return;
    // 너무 무겁지 않게 상단 일부만 먼저 채움(스크롤 시 다시 effect가 돌아도 캐시가 막아줌)
    const slice = missing.slice(0, 24);
    (async () => {
      try {
        const res = await Promise.allSettled(slice.map((pid) => getDoc(doc(firestore, 'users', pid))));
        if (!alive) return;
        const next: Record<string, { name: string; avatarUrl: string }> = {};
        res.forEach((r, idx) => {
          const pid = slice[idx];
          if (r.status !== 'fulfilled') return;
          const snap = r.value;
          if (!snap.exists()) return;
          const d = snap.data() as any;
          const name = resolveChatDisplayNameFromUserDoc(pid, d as Record<string, unknown>).trim();
          const avatarUrl = String(d?.avatar || d?.photoURL || d?.profileImageUrl || '').trim();
          next[pid] = { name, avatarUrl };
        });
        if (Object.keys(next).length > 0) {
          setPeerCache((prev) => ({ ...prev, ...next }));
        }
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, [friendsDocs, peerCache]);

  useEffect(() => {
    let alive = true;
    const ids = friendsAll.map((f) => f.friendId).filter(Boolean);
    if (ids.length === 0) {
      setFriendHasUserDoc({});
      return () => {
        alive = false;
      };
    }
    void (async () => {
      const unique = Array.from(new Set(ids));
      const next: Record<string, boolean | undefined> = {};
      for (let i = 0; i < unique.length; i += 30) {
        const chunk = unique.slice(i, i + 30);
        const snaps = await Promise.allSettled(chunk.map((id) => getDoc(doc(firestore, 'users', id))));
        if (!alive) return;
        snaps.forEach((r, j) => {
          const id = chunk[j];
          next[id] = r.status === 'fulfilled' && r.value.exists();
        });
      }
      if (!alive) return;
      setFriendHasUserDoc((prev) => ({ ...prev, ...next }));
    })();
    return () => {
      alive = false;
    };
  }, [friendsAll]);

  const showInviteForFriend = useCallback((f: FriendRow) => {
    if (String(f.status || '').toLowerCase() === 'linked') return false;
    const reg = friendHasUserDoc[f.friendId];
    if (reg === true) return false;
    if (reg === undefined) return false;
    return true;
  }, [friendHasUserDoc]);

  const friendsFav = useMemo(() => friendsAll.filter((f) => !!favorites[f.friendId]), [friendsAll, favorites]);
  const friendsNonFav = useMemo(() => friendsAll.filter((f) => !favorites[f.friendId]), [friendsAll, favorites]);

  const combined = useMemo<CombinedRow[]>(() => {
    const out: CombinedRow[] = [];
    out.push({ kind: 'section', id: 'sec_me', title: '내 프로필' });
    out.push({ kind: 'empty', id: 'me_row', title: 'me_row' }); // render as special row

    out.push({ kind: 'section', id: 'sec_fav', title: '즐겨찾기' });
    if (friendsFav.length === 0) out.push({ kind: 'empty', id: 'empty_fav', title: '즐겨찾기가 없습니다' });
    for (const f of friendsFav) out.push({ kind: 'friend', id: `fav_${f.friendId}`, friend: f });
    out.push({ kind: 'section', id: 'sec_all', title: '전체 친구' });
    if (friendsNonFav.length === 0) out.push({ kind: 'empty', id: 'empty_all', title: '친구가 없습니다' });
    for (const f of friendsNonFav) out.push({ kind: 'friend', id: `all_${f.friendId}`, friend: f });
    return out;
  }, [friendsFav, friendsNonFav]);

  const onChat = useCallback(async (friendId: string) => {
    try {
      if (!uid || !friendId) return;
      const roomId = await getOrCreateDmRoomIdForUsersV2(firestore as any, uid, friendId);
      router.push({ pathname: '/chatv2/room', params: { id: roomId } } as any);
    } catch {}
  }, [uid]);

  const onInvite = useCallback(
    async (f: FriendRow) => {
      try {
        const name = String(f.name || '친구').trim();
        const msg = `${name}에게 YooYLand 앱을 초대합니다.\n아래 링크로 설치/업데이트 후 대화에서 연결해요.\n${inviteStoreUrl}`;
        await Share.share({ message: msg, title: '초대' });
      } catch (e: any) {
        Alert.alert('초대 실패', String(e?.message || e || 'error'));
      }
    },
    [inviteStoreUrl]
  );

  const openChatProfile = useCallback(
    (friendId: string, name: string, avatarUrl: string) => {
      try {
        if (!friendId) return;
        router.push({
          pathname: '/chatv2/friend-profile',
          params: { id: friendId, userId: friendId, name: name || '', avatar: avatarUrl || '' },
        } as any);
      } catch {}
    },
    []
  );

  const onDelete = useCallback(
    async (f: FriendRow) => {
      try {
        if (!uid) return;
        await deleteDoc(doc(firestore, 'users', uid, 'friends', f.friendId));
        // reciprocal best-effort
        try { await deleteDoc(doc(firestore, 'users', f.friendId, 'friends', uid)); } catch {}
        setFavorites((prev) => {
          if (!prev[f.friendId]) return prev;
          const { [f.friendId]: _omit, ...rest } = prev;
          return rest;
        });
      } catch (e: any) {
        Alert.alert('삭제 실패', String(e?.message || e || 'error'));
      }
    },
    [uid]
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#0C0C0C' }}>
      {/* 상단 프로필 영역 + 우측 아이콘 */}
      <View style={[styles.header, { paddingTop: 10 }]}>
        <TouchableOpacity
          style={styles.profileButton}
          onPress={() => {
            if (!uid) return;
            try {
              router.push('/chatv2/profile-settings' as any);
            } catch {}
          }}
          activeOpacity={0.85}
        >
          <View style={styles.profileImage}>
            {currentProfile?.avatar ? (
              <Image source={{ uri: currentProfile.avatar }} style={styles.profileImagePlaceholder} resizeMode="cover" />
            ) : (
              <Text style={styles.profileText}>👤</Text>
            )}
          </View>
          {myFriendsHeaderName ? (
            <View style={styles.profilePreview}>
              <Text style={styles.profilePreviewName} numberOfLines={1}>
                {myFriendsHeaderName}
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>

        <View style={styles.headerIcons}>
          <TouchableOpacity style={styles.headerIcon} onPress={() => router.push('/settings/notifications')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.iconText}>🔔</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIcon} onPress={() => router.push('/chatv2/friends')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.iconText}>👥</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIcon} onPress={() => router.push('/chatv2/rooms')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.iconText}>💬</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIcon} onPress={() => router.push('/chatv2/settings' as any)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.iconText}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 상단 메뉴줄 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionRow}>
        <TouchableOpacity onPress={() => router.push('/chatv2/qr')} style={styles.actionBtn} activeOpacity={0.85}>
          <Text style={styles.actionIcon}>▦</Text>
          <Text style={styles.actionLabel}>QR코드</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push('/chatv2/add-friend-contacts' as any)}
          style={styles.actionBtn}
          activeOpacity={0.85}
        >
          <Text style={styles.actionIcon}>📇</Text>
          <Text style={styles.actionLabel}>연락처</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push('/chatv2/add-friend-contacts?manual=1' as any)}
          style={styles.actionBtn}
          activeOpacity={0.85}
        >
          <Text style={styles.actionIcon}>＋</Text>
          <Text style={styles.actionLabel}>연락처 추가</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/chatv2/add-friend-id' as any)} style={styles.actionBtn} activeOpacity={0.85}>
          <Text style={styles.actionIcon}>🆔</Text>
          <Text style={styles.actionLabel}>ID 추가</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push('/chatv2/add-friend-recommended' as any)}
          style={styles.actionBtn}
          activeOpacity={0.85}
        >
          <Text style={styles.actionIcon}>★</Text>
          <Text style={styles.actionLabel}>추천친구</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => {}} style={styles.actionBtn} activeOpacity={0.85}>
          <Text style={styles.actionIcon}>🔎</Text>
          <Text style={styles.actionLabel}>검색</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* 검색창 */}
      <View style={{ paddingHorizontal: 14, paddingTop: 8, paddingBottom: 10 }}>
        <View style={styles.searchBox}>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="친구 검색"
            placeholderTextColor="#666"
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </View>

      {/* 친구 Row 리스트 */}
      <FlatList
        data={combined}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 90 }}
        ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: '#2A2A2A' }} />}
        ListEmptyComponent={
          <View style={{ paddingTop: 40, alignItems: 'center' }}>
            <Text style={{ color: '#777' }}>친구가 없습니다</Text>
          </View>
        }
        renderItem={({ item }) => {
          if (item.kind === 'section') {
            return (
              <View style={{ paddingTop: 10, paddingBottom: 8 }}>
                <Text style={styles.sectionTitle}>{item.title}</Text>
              </View>
            );
          }
          if (item.kind === 'empty') {
            if (item.id === 'me_row') {
              const meName = myFriendsHeaderName || '내 프로필';
              const meStatus = String((currentProfile as any)?.customStatus || '');
              return (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    if (!uid) return;
                    openChatProfile(uid, meName, String(currentProfile?.avatar || ''));
                  }}
                  style={{ paddingVertical: 10 }}
                >
                  <View style={styles.meRow}>
                    <View style={styles.avatar}>
                      {currentProfile?.avatar ? (
                        <Image source={{ uri: currentProfile.avatar }} style={styles.avatarImg} />
                      ) : (
                        <Text style={styles.avatarText}>{String(meName || 'M').charAt(0)}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.friendName} numberOfLines={1}>{meName}</Text>
                      <Text style={[styles.lastMessage, { marginTop: 2 }]} numberOfLines={1}>{meStatus}</Text>
                    </View>
                    <View style={{ width: 70, alignItems: 'flex-end' }}>
                      <Text style={{ color: '#777', fontWeight: '800' }}>편집</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }
            return (
              <View style={{ paddingVertical: 14 }}>
                <Text style={{ color: '#777', fontWeight: '800' }}>{item.title}</Text>
              </View>
            );
          }

          const f = item.friend;
          const isFav = !!favorites[f.friendId];
          const avatarInitial = String(f.name || 'F').charAt(0);

          return (
            <View style={{ paddingVertical: 10 }}>
              <View style={styles.friendRow}>
                <View style={styles.friendMain}>
                  <TouchableOpacity
                    onPress={() => openChatProfile(f.friendId, f.name, f.avatarUrl)}
                    activeOpacity={0.85}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    style={styles.avatar}
                  >
                    {f.avatarUrl ? (
                      <Image source={{ uri: f.avatarUrl }} style={styles.avatarImg} />
                    ) : (
                      <Text style={styles.avatarText}>{avatarInitial}</Text>
                    )}
                  </TouchableOpacity>

                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <TouchableOpacity
                        onPress={() => openChatProfile(f.friendId, f.name, f.avatarUrl)}
                        activeOpacity={0.85}
                        hitSlop={{ top: 4, bottom: 4 }}
                        style={{ flex: 1, minWidth: 0 }}
                      >
                        <Text style={styles.friendName} numberOfLines={1}>
                          {f.name}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {!!f.status ? (
                      <Text style={styles.lastMessage} numberOfLines={1}>
                        {f.status}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <View style={styles.friendActions}>
                  <TouchableOpacity
                    onPress={() => toggleFavorite(f.friendId)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    style={styles.actionChip}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.actionStar, isFav && styles.actionStarOn]}>{isFav ? '★' : '☆'}</Text>
                  </TouchableOpacity>
                  {showInviteForFriend(f) ? (
                    <TouchableOpacity
                      onPress={() => onInvite(f)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      style={styles.actionChip}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.actionText}>초대</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    onPress={() => { void onChat(f.friendId); }}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    style={styles.actionChip}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.actionText}>대화</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() =>
                      Alert.alert('삭제', `${f.name}과의 대화를 나가시겠습니까?`, [
                        { text: '취소' },
                        { text: '삭제', style: 'destructive', onPress: () => onDelete(f) },
                      ])
                    }
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    style={[styles.actionChip, styles.actionChipDanger]}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.actionText, styles.actionTextDanger]}>삭제</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* 친구 목록: 시간/마지막메시지는 DM 요약이 아닌 친구 관계 기반이므로 표시 생략(구버전처럼 '상태' 위주) */}
            </View>
          );
        }}
      />

      {/* 친구 목록/대화방 목록 전용 하단바 */}
      <ChatBottomBar active="chat" />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  profileButton: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, gap: 10 },
  profileImage: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center' },
  profileImagePlaceholder: { width: 44, height: 44 },
  profileText: { color: '#D4AF37', fontWeight: '900' },
  profilePreview: { flex: 1, minWidth: 0 },
  profilePreviewName: { color: '#F6F6F6', fontWeight: '900', fontSize: 15 },

  headerIcons: { flexDirection: 'row', gap: 10 },
  headerIcon: { paddingHorizontal: 4, paddingVertical: 6 },
  iconText: { color: '#FFD700', fontWeight: '900', fontSize: 17 },

  actionRow: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 4, gap: 12 },
  actionBtn: { alignItems: 'center', justifyContent: 'center', width: 66 },
  actionIcon: { color: '#FFD700', fontWeight: '900', fontSize: 17 },
  actionLabel: { color: '#CFCFCF', fontSize: 11, marginTop: 4, fontWeight: '800' },

  searchBox: { borderWidth: 1, borderColor: '#333', borderRadius: 12, backgroundColor: '#111', paddingHorizontal: 12 },
  searchInput: { color: '#EEE', paddingVertical: 9, fontWeight: '800' },

  sectionTitle: { color: '#F6F6F6', fontWeight: '900', fontSize: 14 },

  friendRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  friendMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 44, height: 44 },
  avatarText: { color: '#D4AF37', fontWeight: '900' },
  friendName: { color: '#F6F6F6', fontWeight: '900', fontSize: 15, flex: 1, paddingRight: 8 },
  lastMessage: { color: '#9BA1A6', fontSize: 12, marginTop: 3 },
  unreadBadge: { minWidth: 22, paddingHorizontal: 6, height: 22, borderRadius: 11, backgroundColor: '#FF5252', alignItems: 'center', justifyContent: 'center' },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '900' },

  // 구버전 느낌: Row 우측에 작은 액션 칩들을 가로로 정렬
  friendActions: { width: 156, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 6, paddingTop: 1 },
  actionChip: { paddingHorizontal: 8, height: 24, borderRadius: 999, borderWidth: 1, borderColor: '#2A2A2A', backgroundColor: '#0C0C0C', alignItems: 'center', justifyContent: 'center' },
  actionChipDanger: { borderColor: 'rgba(255,107,107,0.35)' },
  actionStar: { color: '#FFFFFF', fontWeight: '900', fontSize: 13, marginTop: -1 },
  actionStarOn: { color: '#FFD700' },
  actionText: { color: '#FFD700', fontWeight: '900', fontSize: 11 },
  actionTextDanger: { color: '#FF6B6B' },
  timeText: { color: '#777', fontSize: 10, marginTop: 5, marginLeft: 54 },

  meRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});

