import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, Image, StyleSheet, ScrollView, TextInput, Alert, Keyboard } from 'react-native';
import { router } from 'expo-router';
import { firestore } from '@/lib/firebase';
import { firebaseAuth } from '@/lib/firebase';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { useChatV2Store } from '../store/chatv2.store';
import { subscribeJoinedRoomsV2, toRoomStubFromJoinedRowV2 } from '../services/roomListService';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { useChatProfileStore } from '@/src/features/chat/store/chat-profile.store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ChatBottomBar from '@/components/ChatBottomBar';
import { usePreferences } from '@/contexts/PreferencesContext';
import { chatTr } from '../core/chatI18n';
import { resolveChatDisplayNameFromUserDoc } from '../core/chatDisplayName';
import { isRoomExplodedV2 } from '../core/ttlEngine';
import { currentUserIsAppAdmin } from '../core/adminGhost';
import { callAdminDeleteChatRoomV2 } from '../services/adminModerationService';

type FilterKey = 'all' | 'dm' | 'group' | 'secret' | 'ttl' | 'notice';

const roomTypeKey = (item: any): string => {
  const t = String(item?.type || '').trim().toLowerCase();
  if (t) return t;
  if (item?.ttl?.enabled === true) return 'ttl';
  return 'group';
};

const DMFolderCard = React.memo(function DMFolderCard(props: { totalUnread: number; dmCount: number; onPress: () => void; language: string }) {
  const { totalUnread, dmCount, onPress, language } = props;
  return (
    <TouchableOpacity style={styles.dmFolderCard} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.dmFolderIconWrap}>
        <Text style={styles.dmFolderIcon}>💬</Text>
      </View>
      <View style={styles.dmFolderInfo}>
        <Text style={styles.dmFolderTitle}>{chatTr(language, '초대방', 'Invites', '招待', '邀请')}</Text>
        <Text style={styles.dmFolderSub}>
          {dmCount <= 0
            ? chatTr(language, '대화 없음', 'No chats', '会話なし', '暂无会话')
            : dmCount === 1
              ? chatTr(language, '1개의 초대방', '1 invite room', '招待ルーム1件', '1个邀请房间')
              : chatTr(language, `${dmCount}개의 초대방`, `${dmCount} invite rooms`, `招待ルーム${dmCount}件`, `${dmCount}个邀请房间`)}
        </Text>
      </View>
      <View style={styles.dmFolderMeta}>
        {totalUnread > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>{totalUnread > 99 ? '99+' : totalUnread}</Text>
          </View>
        )}
        <Text style={styles.dmFolderArrow}>›</Text>
      </View>
    </TouchableOpacity>
  );
});

const RoomItem = React.memo(function RoomItem(props: {
  item: any;
  onPress: () => void;
  manageMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  language: string;
  canAdminGhost?: boolean;
  onAdminGhost?: () => void;
  onAdminDeleteRoom?: () => void;
}) {
  const { item, onPress, manageMode, selected, onToggleSelect, isFavorite, onToggleFavorite, language, canAdminGhost, onAdminGhost, onAdminDeleteRoom } = props;
  const title = String(item.type) === 'dm' ? (item.title || item.peerDisplayName || item.roomId) : (item.title || item.roomId);
  const unread = Number(item.unreadCount || 0);
  const lastMessage = String(item.lastMessage || '');
  const ts = Number(item.lastMessageAt || item.updatedAt || 0);
  const timeText = ts
    ? new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    : '';
  const avatarUri = String(item.avatarUrl || '');
  const typeLabel = (() => {
    const t = roomTypeKey(item);
    if (t === 'dm') return '1:1';
    if (t === 'ttl') return 'TTL';
    if (t === 'group') return chatTr(language, '그룹', 'Group', 'グループ', '群组');
    if (t) return t.toUpperCase();
    return '';
  })();

  return (
    <TouchableOpacity
      style={styles.roomItem}
      onPress={() => {
        if (manageMode) return onToggleSelect();
        return onPress();
      }}
      activeOpacity={0.85}
      onLongPress={() => {
        if (manageMode) return;
        if (canAdminGhost && onAdminGhost) {
          Alert.alert(
            chatTr(language, '관리자', 'Admin', '管理者', '管理员'),
            chatTr(language, '입장 방식을 선택하세요.', 'Choose how to open this room.', '入室方法を選んでください。', '请选择进入方式。'),
            [
              { text: chatTr(language, '취소', 'Cancel', 'キャンセル', '取消'), style: 'cancel' },
              {
                text: chatTr(language, '유령 입장', 'Ghost entry', '幽霊入室', '幽灵进入'),
                onPress: () => {
                  try {
                    onAdminGhost();
                  } catch {}
                },
              },
              {
                text: chatTr(language, '방 삭제', 'Delete room', 'ルーム削除', '删除房间'),
                style: 'destructive',
                onPress: () => {
                  try {
                    onAdminDeleteRoom?.();
                  } catch {}
                },
              },
            ]
          );
          return;
        }
        onToggleSelect();
      }}
      delayLongPress={350}
    >
      {manageMode ? (
        <View style={styles.selectWrap}>
          <View style={[styles.selectCircle, selected && styles.selectCircleOn]}>
            {selected ? <Text style={styles.selectMark}>✔</Text> : null}
          </View>
        </View>
      ) : null}
      <View style={styles.roomAvatar}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.roomAvatarImg} />
        ) : (
          <View style={styles.roomAvatarFallback}>
            <Text style={styles.roomAvatarText}>{String(title).charAt(0)}</Text>
          </View>
        )}
      </View>
      <View style={styles.roomInfo}>
        <View style={styles.roomHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
            <Text style={styles.roomName} numberOfLines={1}>
              {title}
            </Text>
            {!!typeLabel ? (
              <View style={styles.typeBadge}>
                <Text style={styles.typeBadgeText}>{typeLabel}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.metaCol}>
            {!!timeText && <Text style={styles.timeText}>{timeText}</Text>}
            {unread > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{unread > 99 ? '99+' : unread}</Text>
              </View>
            )}
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Text style={styles.lastMessage} numberOfLines={1}>
            {lastMessage || chatTr(language, '메시지 없음', 'No messages', 'メッセージなし', '暂无消息')}
          </Text>
          <TouchableOpacity onPress={onToggleFavorite} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.starChip} activeOpacity={0.85}>
            <Text style={[styles.starIcon, isFavorite && styles.starIconOn]}>{isFavorite ? '★' : '☆'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
});

export default function ChatRoomListV2() {
  const uid = String(firebaseAuth.currentUser?.uid || '');
  const { language } = usePreferences();
  const { currentProfile, initialize } = useChatProfileStore();
  const upsertRoom = useChatV2Store((s) => s.upsertRoom);
  const setRoomIds = useChatV2Store((s) => s.setRoomIds);
  const roomsById = useChatV2Store((s) => s.roomsById);
  const currentRoomId = useChatV2Store((s) => s.currentRoomId);

  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState('');
  const prevUnreadRef = useRef<Record<string, number>>({});
  const [manageMode, setManageMode] = useState(false);
  const [selectedRoomIds, setSelectedRoomIds] = useState<Record<string, boolean>>({});
  const [roomFavorites, setRoomFavorites] = useState<Record<string, boolean>>({});
  const [discoveryRows, setDiscoveryRows] = useState<any[]>([]);
  const discoveryReqId = useRef(0);
  const isAppAdmin = currentUserIsAppAdmin();

  useEffect(() => {
    try { initialize?.(); } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!uid) {
      console.log('[YY_LOGIN_FLOW] ChatRoomListV2 mount -> uid empty, skip subscribe');
      return;
    }
    console.log('[YY_LOGIN_FLOW] ChatRoomListV2 subscribeJoinedRoomsV2 uid=', uid);
    let unsub: (() => void) | undefined;
    try {
      unsub = subscribeJoinedRoomsV2({
        firestore,
        uid,
        onRows: (next) => {
          setRows(next);
          // populate store (roomsById + roomIds) with stubs; summary is source of truth for list
          next.forEach((r) => upsertRoom(toRoomStubFromJoinedRowV2(r)));
          setRoomIds(next.map((r) => r.roomId));

          // Notification behavior: react to unread increases in room list
          try {
            const prev = prevUnreadRef.current || {};
            const nextMap: Record<string, number> = {};
            next.forEach((r: any) => {
              const rid = String(r.roomId);
              const unread = Number(r.unreadCount || 0);
              nextMap[rid] = unread;
              const before = Number(prev[rid] || 0);
              const increased = unread > before;
              const muted = !!r.muted || String(r.notifyMode || '') === 'mute';
              if (increased && !muted && currentRoomId !== rid) {
                const mode = String(r.notifyMode || 'sound');
                if (mode === 'vibrate') {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                }
                Notifications.presentNotificationAsync({
                  content: {
                    title: String(r.type).toUpperCase() === 'DM' ? String(r.peerDisplayName || 'DM') : String(r.title || chatTr(language, '채팅', 'Chat', 'チャット', '聊天')),
                    body: String(r.lastMessage || ''),
                    sound: mode === 'sound' ? 'default' : undefined,
                  },
                  trigger: null,
                }).catch(() => {});
              }
            });
            prevUnreadRef.current = nextMap;
          } catch {}
        },
      });
    } catch (e) {
      console.log('[YY_LOGIN_FLOW] ChatRoomListV2 subscribe error', String((e as any)?.message || e));
    }
    return () => {
      try { unsub?.(); } catch {}
    };
  }, [uid, upsertRoom, setRoomIds, currentRoomId, language]);

  useEffect(() => {
    if (!uid) return;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(`u:${uid}:chat.roomFavoritesV2`);
        if (raw) setRoomFavorites(JSON.parse(raw));
      } catch {}
    })();
  }, [uid]);

  const toggleRoomFavorite = useCallback(
    async (roomId: string) => {
      if (!uid) return;
      setRoomFavorites((prev) => {
        const next = { ...prev, [roomId]: !prev[roomId] };
        void AsyncStorage.setItem(`u:${uid}:chat.roomFavoritesV2`, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [uid]
  );

  const toggleSelect = useCallback((roomId: string) => {
    setSelectedRoomIds((prev) => ({ ...prev, [roomId]: !prev[roomId] }));
  }, []);

  const queryText = useMemo(() => String(q || '').trim().toLowerCase(), [q]);

  useEffect(() => {
    if (!uid || !searchOpen || !queryText) {
      setDiscoveryRows([]);
      return;
    }
       const qLower = queryText;
    const adminListAll = qLower === '**' && currentUserIsAppAdmin();
    const t = setTimeout(() => {
      const req = ++discoveryReqId.current;
      (async () => {
        try {
          const qy = adminListAll
            ? query(collection(firestore, 'rooms'), limit(500))
            : query(collection(firestore, 'rooms'), where('searchVisible', '==', true), limit(250));
          const snap = await getDocs(qy);
          if (req !== discoveryReqId.current) return;
          const out: any[] = [];
          snap.forEach((docSnap) => {
            const data = docSnap.data() as any;
            const type = String(data?.type || 'group').toLowerCase();
            if (type === 'dm') return;
            if (!adminListAll) {
              if (data?.isSecret === true || type === 'secret') return;
              const st = String(data?.roomStatus || 'active').toLowerCase();
              if (st && st !== 'active') return;
              const ttlSt = data?.ttl?.ttlStatus != null ? String(data.ttl.ttlStatus).toLowerCase() : '';
              if (ttlSt === 'expired') return;
              if (String(type).toLowerCase() === 'ttl') {
                const probe = { type: 'ttl' as const, ttl: data?.ttl, roomExpiresAt: data?.roomExpiresAt };
                if (isRoomExplodedV2(probe as any, Date.now())) return;
              }
            }
            const roomId = docSnap.id;
            const title = String(data?.title || '');
            const desc = String(data?.description || '');
            const tags = Array.isArray(data?.tags) ? data.tags.map((x: any) => String(x)).join(' ') : '';
            const hay = `${title} ${desc} ${tags} ${type} ${roomId}`.toLowerCase();
            if (!adminListAll && !hay.includes(qLower)) return;
            out.push({
              roomId,
              type: data?.type || 'group',
              title: title || roomId,
              description: desc,
              peerDisplayName: undefined,
              lastMessage: '',
              lastMessageAt: Number(data?.updatedAt ?? data?.createdAt ?? 0) || 0,
              unreadCount: 0,
              room: { id: roomId },
            });
          });
          if (req !== discoveryReqId.current) return;
          setDiscoveryRows(out);
        } catch (e) {
          console.warn('[ChatRoomListV2] discovery search', e);
          if (req === discoveryReqId.current) setDiscoveryRows([]);
        }
      })();
    }, 320);
    return () => clearTimeout(t);
  }, [uid, searchOpen, queryText, isAppAdmin]);

  const list = useMemo(() => rows.map((r) => ({ ...r, room: roomsById[r.roomId] })).filter((x) => x.room), [rows, roomsById]);
  const listFiltered = useMemo(() => {
    if (!queryText) return list;
    const joinedMatches = list.filter((it: any) => {
      const t = roomTypeKey(it);
      const title = t === 'dm' ? (it.peerDisplayName || it.title || it.roomId) : (it.title || it.roomId);
      const last = String(it.lastMessage || '');
      const desc = String(it.description || '');
      return `${title} ${last} ${desc} ${t}`.toLowerCase().includes(queryText);
    });
    const seen = new Set(joinedMatches.map((x: any) => String(x.roomId)));
    const extras = discoveryRows.filter((d: any) => !seen.has(String(d.roomId)));
    return [...joinedMatches, ...extras];
  }, [list, queryText, discoveryRows]);

  const dmRows = useMemo(() => listFiltered.filter((x) => roomTypeKey(x) === 'dm'), [listFiltered]);
  const groupRows = useMemo(() => listFiltered.filter((x) => roomTypeKey(x) === 'group'), [listFiltered]);
  const ttlRows = useMemo(() => listFiltered.filter((x) => roomTypeKey(x) === 'ttl'), [listFiltered]);
  const secretRows = useMemo(() => listFiltered.filter((x) => roomTypeKey(x) === 'secret'), [listFiltered]);
  const noticeRows = useMemo(() => listFiltered.filter((x) => roomTypeKey(x) === 'notice'), [listFiltered]);
  const visibleRows = useMemo(() => {
    if (filter === 'dm') return dmRows;
    if (filter === 'group') return groupRows;
    if (filter === 'secret') return secretRows;
    if (filter === 'ttl') return ttlRows;
    if (filter === 'notice') return noticeRows;
    return listFiltered;
  }, [filter, dmRows, groupRows, ttlRows, secretRows, noticeRows, listFiltered]);
  const dmUnreadTotal = useMemo(() => dmRows.reduce((s, r) => s + Number(r.unreadCount || 0), 0), [dmRows]);

  const myHeaderDisplayName = useMemo(() => {
    const fallback = chatTr(language, '내 프로필', 'My profile', 'マイプロフィール', '我的资料');
    if (!uid) return fallback;
    const n = resolveChatDisplayNameFromUserDoc(uid, (currentProfile || {}) as Record<string, unknown>).trim();
    return n || fallback;
  }, [uid, currentProfile, language]);

  return (
    <View style={{ flex: 1, backgroundColor: '#0C0C0C' }}>
      {/* 구버전 느낌: 상단 프로필(이름+상태) + 우측 아이콘 */}
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            try {
              router.push('/chatv2/profile-settings' as any);
            } catch {}
          }}
          style={styles.profileButton}
        >
          <View style={styles.profileAvatar}>
            {currentProfile?.avatar ? (
              <Image source={{ uri: currentProfile.avatar }} style={{ width: 44, height: 44 }} />
            ) : (
              <Text style={styles.profileAvatarText}>👤</Text>
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.profileName} numberOfLines={1}>
              {myHeaderDisplayName}
            </Text>
            {String((currentProfile as any)?.customStatus || '').trim() ? (
              <Text style={styles.profileStatus} numberOfLines={1}>
                {String((currentProfile as any)?.customStatus || '')}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>

        <View style={styles.headerIcons}>
          <TouchableOpacity style={styles.headerIcon} onPress={() => { try { router.push('/settings/notifications'); } catch {} }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.iconText}>🔔</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIcon} onPress={() => { try { router.push('/chatv2/friends'); } catch {} }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.iconText}>👥</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIcon} onPress={() => { try { router.push('/chatv2/rooms'); } catch {} }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.iconText}>💬</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIcon} onPress={() => { try { router.push('/chatv2/settings' as any); } catch {} }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.iconText}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 구버전 상단바 바로 아래 메뉴줄 — 세로로 늘어나 메인 영역을 밀지 않도록 고정 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.actionRowWrap, { flexGrow: 0, flexShrink: 0 }]}
        contentContainerStyle={styles.actionRow}
      >
        <TouchableOpacity
          onPress={() => {
            // UI 우선: 관리 모드 토글 (구버전 느낌)
            setManageMode((v) => !v);
            setSelectedRoomIds({});
          }}
          style={styles.actionBtn}
          activeOpacity={0.85}
        >
          <Text style={styles.actionIcon}>⚙</Text>
          <Text style={styles.actionLabel}>{chatTr(language, '채팅방관리', 'Manage rooms', 'ルーム管理', '房间管理')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/chatv2/qr')} style={styles.actionBtn} activeOpacity={0.85}>
          <Text style={styles.actionIcon}>▦</Text>
          <Text style={styles.actionLabel}>{chatTr(language, 'QR코드', 'QR code', 'QRコード', '二维码')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            try {
              // 방 초대장: 초대 QR/URL 인식을 위한 전용 스캔 화면으로 이동
              router.push('/chatv2/scan');
            } catch {}
          }}
          style={styles.actionBtn}
          activeOpacity={0.85}
        >
          <Text style={styles.actionIcon}>✉</Text>
          <Text style={styles.actionLabel}>{chatTr(language, '초대장', 'Invite', '招待', '邀请')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/chatv2/create-room')} style={styles.actionBtn} activeOpacity={0.85}>
          <Text style={styles.actionIcon}>＋</Text>
          <Text style={styles.actionLabel}>{chatTr(language, '방 만들기', 'Create room', 'ルーム作成', '创建房间')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            setSearchOpen((v) => !v);
            setQ('');
          }}
          style={styles.actionBtn}
          activeOpacity={0.85}
        >
          <Text style={styles.actionIcon}>🔎</Text>
          <Text style={styles.actionLabel}>{chatTr(language, '검색', 'Search', '検索', '搜索')}</Text>
        </TouchableOpacity>
      </ScrollView>

      {searchOpen ? (
        <View style={{ paddingHorizontal: 14, paddingBottom: 10 }}>
          <View style={{ borderWidth: 1, borderColor: '#333', borderRadius: 12, backgroundColor: '#111', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' }}>
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder={chatTr(language, '대화방 검색', 'Search rooms', 'ルーム検索', '搜索房间')}
              placeholderTextColor="#666"
              style={{ color: '#EEE', paddingVertical: 10, fontWeight: '800', flex: 1 }}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setQ((s) => String(s))}
              style={{ marginLeft: 8, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: '#555' }}
            >
              <Text style={{ color: '#FFD700', fontWeight: '900', fontSize: 12 }}>{chatTr(language, '검색', 'Search', '検索', '搜索')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* 필터 + 리스트: 상단(메뉴 바로 아래)부터 채우고, 짧은 목록도 중앙 정렬되지 않게 flexStart */}
      <View style={{ flex: 1, minHeight: 0 }}>
        <View style={styles.filterRow}>
          {([
            { k: 'all', label: chatTr(language, '전체', 'All', '全体', '全部') },
            { k: 'dm', label: chatTr(language, '친구', 'Friends', '友だち', '好友') },
            { k: 'group', label: chatTr(language, '그룹', 'Group', 'グループ', '群组') },
            { k: 'secret', label: chatTr(language, '비밀', 'Secret', '秘密', '私密') },
            { k: 'ttl', label: 'TTL' },
            { k: 'notice', label: chatTr(language, '공지', 'Notice', '告知', '公告') },
          ] as Array<{ k: FilterKey; label: string }>).map((x) => {
            const active = filter === x.k;
            return (
              <TouchableOpacity
                key={x.k}
                onPress={() => setFilter(x.k)}
                activeOpacity={0.85}
                style={[styles.filterPill, active && styles.filterPillActive]}
              >
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{x.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {visibleRows.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#888' }}>
              {queryText
                ? chatTr(language, '검색 결과가 없습니다', 'No results', '該当なし', '无结果')
                : chatTr(language, '대화방이 없습니다', 'No rooms', 'ルームがありません', '暂无房间')}
            </Text>
          </View>
        ) : (
          <FlatList
            style={{ flex: 1 }}
            data={visibleRows}
            keyExtractor={(it: any) => String(it.roomId)}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={() => Keyboard.dismiss()}
            ListHeaderComponent={
              ['all', 'dm'].includes(filter) ? (
                <View style={{ paddingTop: 8 }}>
                  <DMFolderCard totalUnread={dmUnreadTotal} dmCount={dmRows.length} onPress={() => setFilter('dm')} language={language} />
                </View>
              ) : (
                <View style={{ height: 8 }} />
              )
            }
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: 'flex-start',
              paddingHorizontal: 14,
              paddingBottom: 90,
            }}
            renderItem={({ item }: any) => (
              <RoomItem
                item={item}
                manageMode={manageMode}
                selected={!!selectedRoomIds[String(item.roomId)]}
                onToggleSelect={() => toggleSelect(String(item.roomId))}
                isFavorite={!!roomFavorites[String(item.roomId)]}
                onToggleFavorite={() => toggleRoomFavorite(String(item.roomId))}
                language={language}
                canAdminGhost={isAppAdmin}
                onAdminGhost={() => {
                  try {
                    router.push({ pathname: '/chatv2/room', params: { id: String(item.roomId), ghost: '1' } } as any);
                  } catch {}
                }}
                onAdminDeleteRoom={() => {
                  const rid = String(item.roomId || '').trim();
                  if (!rid) return;
                  Alert.alert(
                    chatTr(language, '방 삭제', 'Delete room', 'ルーム削除', '删除房间'),
                    chatTr(
                      language,
                      '이 방을 완전히 삭제할까요? 모든 멤버가 나가며 검색·입장이 불가능해집니다.',
                      'Permanently delete this room? All members will be removed and it will not appear in search.',
                      'このルームを完全に削除しますか？全員が退室し、検索・入室できなくなります。',
                      '将永久删除此房间？所有成员会被移出，且无法搜索或进入。'
                    ),
                    [
                      { text: chatTr(language, '취소', 'Cancel', 'キャンセル', '取消'), style: 'cancel' },
                      {
                        text: chatTr(language, '삭제', 'Delete', '削除', '删除'),
                        style: 'destructive',
                        onPress: () => {
                          void (async () => {
                            try {
                              await callAdminDeleteChatRoomV2({ roomId: rid, reason: 'admin_list_long_press' });
                              try {
                                useChatV2Store.getState().evictRoom(rid);
                              } catch {}
                              Alert.alert(
                                chatTr(language, '완료', 'Done', '完了', '完成'),
                                chatTr(language, '방이 삭제되었습니다.', 'The room was deleted.', 'ルームを削除しました。', '房间已删除。')
                              );
                            } catch (e: any) {
                              Alert.alert(
                                chatTr(language, '실패', 'Failed', '失敗', '失败'),
                                String(e?.message || e || 'delete_failed')
                              );
                            }
                          })();
                        },
                      },
                    ]
                  );
                }}
                onPress={() => {
                  try {
                    router.push({ pathname: '/chatv2/room', params: { id: String(item.roomId) } } as any);
                  } catch {}
                }}
              />
            )}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#2A2A2A' }} />}
          />
        )}
      </View>

      {/* 친구/대화방 목록 전용 하단바 */}
      <ChatBottomBar active="chat" />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { height: 56, paddingHorizontal: 14, paddingTop: 0, paddingBottom: 0, borderBottomWidth: 1, borderBottomColor: '#1E1E1E', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  profileButton: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, gap: 10 },
  profileAvatar: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center' },
  profileAvatarText: { color: '#D4AF37', fontWeight: '900' },
  profileName: { color: '#F6F6F6', fontWeight: '900', fontSize: 15 },
  profileStatus: { color: '#777', marginTop: 2, fontSize: 12 },
  headerIcons: { flexDirection: 'row', gap: 10 },
  headerIcon: { paddingHorizontal: 4, paddingVertical: 6 },
  iconText: { color: '#FFD700', fontWeight: '900', fontSize: 17 },

  actionRowWrap: { marginTop: 0 },
  actionRow: { paddingHorizontal: 14, paddingTop: 0, paddingBottom: 6, gap: 10, alignItems: 'flex-start' },
  actionBtn: { alignItems: 'center', justifyContent: 'center', width: 64, paddingVertical: 0 },
  actionIcon: { color: '#FFD700', fontWeight: '900', fontSize: 16, lineHeight: 18 },
  actionLabel: { color: '#CFCFCF', fontSize: 11, marginTop: 0, fontWeight: '800', lineHeight: 13 },

  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 0 },
  filterPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: '#333', backgroundColor: '#111' },
  filterPillActive: { borderColor: '#FFD700' },
  filterText: { color: '#AAA', fontWeight: '800', fontSize: 12 },
  filterTextActive: { color: '#FFD700' },

  selectWrap: { marginRight: 8 },
  selectCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#555', alignItems: 'center', justifyContent: 'center' },
  selectCircleOn: { borderColor: '#FFD700', backgroundColor: '#2A2A2A' },
  selectMark: { color: '#FFD700', fontSize: 12, lineHeight: 12 },

  dmFolderCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10, borderWidth: 1, borderColor: '#2A2A2A', backgroundColor: 'rgba(76, 175, 80, 0.08)', borderRadius: 12, marginBottom: 10 },
  dmFolderIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  dmFolderIcon: { fontSize: 22 },
  dmFolderInfo: { flex: 1 },
  dmFolderTitle: { color: '#F6F6F6', fontSize: 15, fontWeight: '800' },
  dmFolderSub: { color: '#9BA1A6', fontSize: 12, marginTop: 2 },
  dmFolderMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 48 },
  dmFolderArrow: { color: '#777', fontSize: 18, fontWeight: '800' },

  roomItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  roomAvatar: { width: 44, height: 44, borderRadius: 22, marginRight: 10, overflow: 'hidden', backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center' },
  roomAvatarImg: { width: 44, height: 44 },
  roomAvatarFallback: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  roomAvatarText: { color: '#D4AF37', fontWeight: '900' },
  roomInfo: { flex: 1, minWidth: 0 },
  roomHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  roomName: { color: '#F6F6F6', fontSize: 15, fontWeight: '900', flex: 1, paddingRight: 10 },
  typeBadge: { marginLeft: 6, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, borderWidth: 1, borderColor: '#2A2A2A', backgroundColor: '#0C0C0C' },
  typeBadgeText: { color: '#AAA', fontSize: 9, fontWeight: '900' },
  lastMessage: { color: '#9BA1A6', fontSize: 12, marginTop: 1, paddingRight: 6 },
  starChip: { width: 28, height: 24, borderRadius: 999, borderWidth: 1, borderColor: '#2A2A2A', backgroundColor: '#0C0C0C', alignItems: 'center', justifyContent: 'center' },
  starIcon: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  starIconOn: { color: '#FFD700' },
  metaCol: { alignItems: 'flex-end', minWidth: 54 },
  timeText: { color: '#777', fontSize: 10, marginBottom: 2 },
  unreadBadge: { minWidth: 20, paddingHorizontal: 6, height: 20, borderRadius: 10, backgroundColor: '#FF5252', alignItems: 'center', justifyContent: 'center' },
  unreadText: { color: '#fff', fontSize: 10, fontWeight: '900' },
});

