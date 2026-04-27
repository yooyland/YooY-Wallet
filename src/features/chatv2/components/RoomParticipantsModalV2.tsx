import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import type { Firestore } from 'firebase/firestore';
import { doc, getDoc, getDocs } from 'firebase/firestore';
import type { ChatRoomV2 } from '../core/roomSchema';
import { getRoomDocRef, getRoomMembersColRef, getUserJoinedRoomDocRef } from '../firebase/roomRefs';
import { ensureMyRoomMemberDocV2, healRoomParticipantIdsIfEmptyV2, kickMemberFromRoomV2, setRoomMemberAdminV2 } from '../services/roomService';
import { isRoomModeratorV2, resolveRoomOwnerUidV2 } from '../core/roomPermissions';
import { usePreferences } from '@/contexts/PreferencesContext';
import { resolveChatDisplayNameFromUserDoc } from '../core/chatDisplayName';

type Row = {
  id: string;
  label: string;
  photo: string;
  section: 'owner' | 'vice' | 'member';
  isOwner: boolean;
  isAdmin: boolean;
};

export default function RoomParticipantsModalV2(props: {
  visible: boolean;
  onClose: () => void;
  firestore: Firestore;
  room: ChatRoomV2;
  uid: string;
}) {
  const { visible, onClose, firestore, room, uid } = props;
  const { language } = usePreferences();
  const tr = useMemo(
    () =>
      (ko: string, en: string, ja?: string, zh?: string) => {
        if (language === 'ko') return ko;
        if (language === 'ja') return ja || en;
        if (language === 'zh') return zh || en;
        return en;
      },
    [language]
  );
  const [names, setNames] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<Record<string, string>>({});
  /** 익명(ID만) 모드 — 프로필 화면으로 이동하지 않음 */
  const [anonymousById, setAnonymousById] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [idsView, setIdsView] = useState<string[]>([]);

  const createdBy = resolveRoomOwnerUidV2(room);
  const adminSet = useMemo(() => {
    const a = Array.isArray(room.adminIds) ? room.adminIds.map((x) => String(x)) : [];
    return new Set(a);
  }, [room.adminIds]);
  const participantIdsBase = useMemo(() => {
    const p = Array.isArray(room.participantIds) ? room.participantIds.map((x) => String(x)).filter(Boolean) : [];
    const m = Array.isArray(room.memberIds) ? room.memberIds.map((x) => String(x)).filter(Boolean) : [];
    const o = Array.isArray(room.ownerIds) ? room.ownerIds.map((x) => String(x)).filter(Boolean) : [];
    const a = Array.isArray(room.adminIds) ? room.adminIds.map((x) => String(x)).filter(Boolean) : [];
    const merged = [...p, ...m, ...o, ...a];
    const legacyMem = (room as any)?.members;
    if (legacyMem && typeof legacyMem === 'object' && !Array.isArray(legacyMem)) {
      for (const k of Object.keys(legacyMem)) {
        const v = legacyMem[k];
        if (v !== true && v !== 'true' && v !== 1) continue;
        const id = String(k).trim();
        if (id) merged.push(id);
      }
    }
    if (createdBy && !p.includes(createdBy)) p.push(createdBy);
    if (uid && !p.includes(uid)) p.push(uid);
    return Array.from(new Set([...merged, ...p]));
  }, [room.participantIds, room.memberIds, room.ownerIds, room.adminIds, createdBy, uid, room]);

  const actorIsAdmin = useMemo(() => {
    if (isRoomModeratorV2(room, uid)) return true;
    if (createdBy && uid === createdBy) return true;
    return adminSet.has(uid);
  }, [room, createdBy, uid, adminSet]);

  const isDm = String(room.type) === 'dm';

  const participantIds = useMemo(() => {
    if (idsView.length) return idsView;
    return participantIdsBase;
  }, [idsView, participantIdsBase]);

  const rankBySelfThenName = (arr: string[]) => {
    return [...arr].sort((a, b) => {
      if (a === uid && b !== uid) return -1;
      if (b === uid && a !== uid) return 1;
      return (names[a] || a).localeCompare(names[b] || b, 'ko');
    });
  };

  const { ownerRows, viceRows, memberRows } = useMemo(() => {
    if (isDm) {
      const uniqDm = rankBySelfThenName(Array.from(new Set(participantIds.filter(Boolean))));
      const dmRows: Row[] = uniqDm.map((id) => ({
        id,
        label: names[id] || id,
        photo: photos[id] || '',
        section: 'owner',
        isOwner: true,
        isAdmin: true,
      }));
      return { ownerRows: dmRows, viceRows: [], memberRows: [] };
    }
    const ownerFromRoom =
      createdBy && participantIds.includes(createdBy)
        ? createdBy
        : Array.isArray(room.ownerIds) && room.ownerIds[0] && participantIds.includes(String(room.ownerIds[0]))
          ? String(room.ownerIds[0])
          : participantIds[0] || '';
    const viceIds = rankBySelfThenName(participantIds.filter((id) => id && id !== ownerFromRoom && adminSet.has(id)));
    const viceSet = new Set(viceIds);
    const memberIds = rankBySelfThenName(
      participantIds.filter((id) => id && id !== ownerFromRoom && !viceSet.has(id))
    );
    const o: Row[] = [];
    const v: Row[] = [];
    const m: Row[] = [];
    if (ownerFromRoom) {
      o.push({
        id: ownerFromRoom,
        label: names[ownerFromRoom] || ownerFromRoom,
        photo: photos[ownerFromRoom] || '',
        section: 'owner',
        isOwner: true,
        isAdmin: true,
      });
    }
    for (const id of viceIds) {
      v.push({
        id,
        label: names[id] || id,
        photo: photos[id] || '',
        section: 'vice',
        isOwner: false,
        isAdmin: true,
      });
    }
    for (const id of memberIds) {
      m.push({
        id,
        label: names[id] || id,
        photo: photos[id] || '',
        section: 'member',
        isOwner: id === ownerFromRoom,
        isAdmin: adminSet.has(id),
      });
    }
    return { ownerRows: o, viceRows: v, memberRows: m };
  }, [participantIds, createdBy, room.ownerIds, names, photos, adminSet, uid, isDm]);

  useEffect(() => {
    if (!visible) {
      setIdsView([]);
      return;
    }
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        try {
          await healRoomParticipantIdsIfEmptyV2({ firestore, roomId: room.id });
        } catch {}
        try {
          await ensureMyRoomMemberDocV2({ firestore, roomId: room.id, uid });
        } catch {}

        const roomSnap = await getDoc(getRoomDocRef(firestore, room.id));
        const rd = roomSnap.exists() ? (roomSnap.data() as any) : {};
        let ids: string[] = [];
        const add = (x: string) => {
          const id = String(x || '').trim();
          if (id && !ids.includes(id)) ids.push(id);
        };
        if (Array.isArray(rd?.participantIds)) rd.participantIds.forEach((x: any) => add(String(x)));
        if (Array.isArray(rd?.memberIds)) rd.memberIds.forEach((x: any) => add(String(x)));
        if (Array.isArray(rd?.members)) rd.members.forEach((x: any) => add(String(x)));
        if (rd?.members && typeof rd.members === 'object' && !Array.isArray(rd.members)) {
          for (const k of Object.keys(rd.members)) {
            const v = rd.members[k];
            if (v !== true && v !== 'true' && v !== 1) continue;
            add(k);
          }
        }
        add(String(rd?.createdBy || ''));
        if (String(rd?.type) === 'dm' && uid) {
          try {
            const jr = await getDoc(getUserJoinedRoomDocRef(firestore, uid, room.id));
            add(String((jr.data() as any)?.peerId || ''));
          } catch {}
        }
        for (const x of participantIdsBase) add(x);

        try {
          const ms = await getDocs(getRoomMembersColRef(firestore, room.id));
          ms.docs.forEach((d) => add(String(d.id || '')));
        } catch {}

        if (uid) add(uid);

        if (!alive) return;
        setIdsView(Array.from(new Set(ids.filter(Boolean))));
        const nextN: Record<string, string> = {};
        const nextP: Record<string, string> = {};
        const nextA: Record<string, boolean> = {};
        await Promise.all(
          ids.filter(Boolean).map(async (id) => {
            try {
              const s = await getDoc(doc(firestore, 'users', id));
              const d = s.exists() ? (s.data() as any) : {};
              const n = resolveChatDisplayNameFromUserDoc(id, d as Record<string, unknown>).trim();
              const p = String(d?.photoURL || d?.avatar || d?.profileImageUrl || '').trim();
              nextN[id] = n || id;
              nextP[id] = p;
              nextA[id] = d?.useHashInChat === true;
            } catch {
              nextN[id] = id;
              nextP[id] = '';
              nextA[id] = false;
            }
          })
        );
        if (!alive) return;
        setNames(nextN);
        setPhotos(nextP);
        setAnonymousById(nextA);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [visible, firestore, room.id, participantIdsBase.join('|'), uid]);

  const openProfile = (targetId: string) => {
    if (!targetId || targetId === uid) return;
    if (anonymousById[targetId]) return;
    try {
      router.push({ pathname: '/chatv2/friend-profile', params: { id: String(targetId), userId: String(targetId) } } as any);
    } catch {}
    onClose();
  };

  const longPressMember = (row: Row) => {
    if (isDm || !actorIsAdmin) return;
    if (row.id === uid) return;
    if (row.isOwner) {
      Alert.alert(
        tr('방장', 'Owner', 'オーナー', '房主'),
        tr('방장은 부방장 변경·보내기 대상이 아닙니다.', 'Owner cannot be changed or removed.', 'オーナーは変更・退室対象にできません。', '房主不可变更或移出。')
      );
      return;
    }
    const opts: { text: string; style?: 'destructive' | 'cancel'; onPress?: () => void }[] = [];
    if (!row.isAdmin) {
      opts.push({
        text: tr('부방장(관리자) 임명', 'Promote to co-admin', '副管理者に任命', '设为副管理员'),
        onPress: () =>
          setRoomMemberAdminV2({ firestore, roomId: room.id, actorUid: uid, targetUid: row.id, asAdmin: true }).catch((e) =>
            Alert.alert(tr('오류', 'Error', 'エラー', '错误'), String(e?.message || e))
          ),
      });
    } else {
      opts.push({
        text: tr('부방장(관리자) 해제', 'Remove co-admin', '副管理者を解除', '解除副管理员'),
        onPress: () =>
          setRoomMemberAdminV2({ firestore, roomId: room.id, actorUid: uid, targetUid: row.id, asAdmin: false }).catch((e) =>
            Alert.alert(tr('오류', 'Error', 'エラー', '错误'), String(e?.message || e))
          ),
      });
    }
    opts.push({
      text: tr('보내기', 'Remove', '退室', '移出'),
      style: 'destructive',
      onPress: () => {
        Alert.alert(tr('보내기', 'Remove', '退室', '移出'), tr(`${row.label} 님을 방에서보낼까요?`, `Remove ${row.label} from this room?`, `${row.label} をこのルームから外しますか？`, `要将 ${row.label} 移出该房间吗？`), [
          { text: tr('취소', 'Cancel', 'キャンセル', '取消'), style: 'cancel' },
          {
            text: tr('보내기', 'Remove', '退室', '移出'),
            style: 'destructive',
            onPress: () =>
              kickMemberFromRoomV2({ firestore, roomId: room.id, actorUid: uid, targetUid: row.id }).catch((e) =>
                Alert.alert(tr('오류', 'Error', 'エラー', '错误'), String(e?.message || e))
              ),
          },
        ]);
      },
    });
    opts.push({ text: tr('취소', 'Cancel', 'キャンセル', '取消'), style: 'cancel' });
    Alert.alert(row.label, tr('관리 작업', 'Management', '管理操作', '管理操作'), opts);
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View
          style={{
            maxHeight: '72%',
            backgroundColor: '#121212',
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            borderTopWidth: 2,
            borderColor: '#D4AF37',
            paddingBottom: 20,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#222' }}>
            <Text style={{ color: '#EEE', fontWeight: '900', fontSize: 16 }}>{tr('참석자', 'Participants', '参加者', '参与者')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={{ color: '#AAA', fontWeight: '800' }}>{tr('닫기', 'Close', '閉じる', '关闭')}</Text>
            </TouchableOpacity>
          </View>
          {loading ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <ActivityIndicator color="#FFD700" />
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 8, paddingBottom: 24 }}>
              {isDm ? (
                <Text style={{ color: '#777', fontSize: 12, marginBottom: 10 }}>
                  {tr('1:1 방 — 참여자만 표시됩니다.', '1:1 room - only participants are shown.', '1:1ルーム - 参加者のみ表示されます。', '1:1房间 - 仅显示参与者。')}
                </Text>
              ) : null}
              {ownerRows.length ? (
                <>
                  <Text style={{ color: '#D4AF37', fontWeight: '900', fontSize: 12, marginTop: 6, marginBottom: 8 }}>{tr('방장', 'Owner', 'オーナー', '房主')}</Text>
                  {ownerRows.map((row) => (
                    <ParticipantRow
                      key={row.id}
                      row={row}
                      selfUid={uid}
                      tr={tr}
                      canLongPress={false}
                      onPress={() => openProfile(row.id)}
                      onLongPress={() => longPressMember(row)}
                    />
                  ))}
                </>
              ) : null}
              {viceRows.length ? (
                <>
                  <Text style={{ color: '#D4AF37', fontWeight: '900', fontSize: 12, marginTop: 14, marginBottom: 8 }}>{tr('부방장', 'Co-admin', '副管理者', '副管理员')}</Text>
                  {viceRows.map((row) => (
                    <ParticipantRow
                      key={`vice-${row.id}`}
                      row={row}
                      selfUid={uid}
                      tr={tr}
                      canLongPress={!isDm && actorIsAdmin && row.id !== uid && !row.isOwner}
                      onPress={() => openProfile(row.id)}
                      onLongPress={() => longPressMember(row)}
                    />
                  ))}
                </>
              ) : null}
              {memberRows.length ? (
                <>
                  <Text style={{ color: '#D4AF37', fontWeight: '900', fontSize: 12, marginTop: 14, marginBottom: 8 }}>{tr('참석자', 'Participants', '参加者', '参与者')}</Text>
                  {memberRows.map((row) => (
                    <ParticipantRow
                      key={`member-${row.id}-${row.section}`}
                      row={row}
                      selfUid={uid}
                      tr={tr}
                      canLongPress={!isDm && actorIsAdmin && row.id !== uid && !row.isOwner}
                      onPress={() => openProfile(row.id)}
                      onLongPress={() => longPressMember(row)}
                    />
                  ))}
                </>
              ) : null}
              {!ownerRows.length && !viceRows.length && !memberRows.length ? (
                <Text style={{ color: '#777', marginTop: 20, textAlign: 'center' }}>{tr('참가자 정보가 없습니다.', 'No participant information.', '参加者情報がありません。', '暂无参与者信息。')}</Text>
              ) : null}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function ParticipantRow(props: {
  row: Row;
  selfUid: string;
  tr: (ko: string, en: string, ja?: string, zh?: string) => string;
  canLongPress: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { row, selfUid, tr, canLongPress, onPress, onLongPress } = props;
  const isSelf = row.id === selfUid;
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#1A1A1A', marginBottom: 8, borderWidth: 1, borderColor: '#2A2A2A' }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, overflow: 'hidden', backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center' }}>
        {row.photo ? (
          <Image source={{ uri: row.photo }} style={{ width: 40, height: 40 }} />
        ) : (
          <Text style={{ color: '#D4AF37', fontWeight: '900' }}>{row.label.charAt(0)}</Text>
        )}
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ color: '#EEE', fontWeight: '800' }} numberOfLines={1}>
          {row.label}
          {isSelf ? tr(' (나)', ' (me)', '（自分）', '（我）') : ''}
        </Text>
        {row.isAdmin && !row.isOwner ? <Text style={{ color: '#888', fontSize: 11, marginTop: 2 }}>{tr('부방장', 'Co-admin', '副管理者', '副管理员')}</Text> : null}
        {row.isOwner ? <Text style={{ color: '#888', fontSize: 11, marginTop: 2 }}>{tr('방장', 'Owner', 'オーナー', '房主')}</Text> : null}
        {canLongPress ? <Text style={{ color: '#555', fontSize: 10, marginTop: 4 }}>{tr('길게 눌러 관리', 'Long press to manage', '長押しで管理', '长按管理')}</Text> : null}
      </View>
    </View>
  );

  if (canLongPress) {
    return (
      <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={380}>
        {content}
      </Pressable>
    );
  }
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      {content}
    </TouchableOpacity>
  );
}
