import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { setDoc } from 'firebase/firestore';
import { getRoomDocRef } from '../firebase/roomRefs';
import { firebaseAuth, firestore, firebaseStorage } from '@/lib/firebase';
import {
  createRoomV2,
  normalizeRoomTags,
  uploadRoomCoverPhotoV2,
} from '../services/roomService';
import type { ChatRoomTypeV2 } from '../core/roomSchema';
import { logYyRoom } from '../core/roomLog';
import * as ImagePicker from 'expo-image-picker';

/** UI에서 선택하는 타입 (1:1 → dm) */
type UiRoomKind = 'group' | 'dm' | 'secret' | 'ttl' | 'notice';

const KIND_TO_TYPE: Record<UiRoomKind, ChatRoomTypeV2> = {
  group: 'group',
  dm: 'dm',
  secret: 'secret',
  ttl: 'ttl',
  notice: 'notice',
};

const MAX_ROOM_TTL_SEC = 365 * 86400;

function parseBoundedInt(raw: string, min: number, max: number): number {
  const n = Math.floor(Number(String(raw ?? '').replace(/[^\d]/g, '') || '0'));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/** 일·시·분·초 → 총 TTL 초 (최소 60초, 최대 365일) */
function ttlTotalSecFromParts(days: string, hours: string, minutes: string, seconds: string): number {
  const d = parseBoundedInt(days, 0, 365);
  const h = parseBoundedInt(hours, 0, 23);
  const m = parseBoundedInt(minutes, 0, 59);
  const s = parseBoundedInt(seconds, 0, 59);
  let totalSec = d * 86400 + h * 3600 + m * 60 + s;
  if (totalSec < 60) totalSec = 60;
  if (totalSec > MAX_ROOM_TTL_SEC) totalSec = MAX_ROOM_TTL_SEC;
  return totalSec;
}

/** 일·시·분·초 → 폭파 시각(ms). 최소 60초, 최대 365일 */
function ttlExplodeFromParts(days: string, hours: string, minutes: string, seconds: string): number {
  return Date.now() + ttlTotalSecFromParts(days, hours, minutes, seconds) * 1000;
}

/** TTL 방 생성 비용(요청 스펙): 24h 이하 3 YOY, 24h 초과~90일 30 YOY */
function ttlCreateCostYoy(totalSec: number): number {
  if (totalSec <= 86400) return 3;
  if (totalSec <= 86400 * 90) return 30;
  return 30;
}

export default function ChatCreateRoomV2() {
  const uid = String(firebaseAuth.currentUser?.uid || '');
  const params = useLocalSearchParams<{ peerId?: string }>();
  const peerFromRoute = String(params?.peerId || '').trim();
  const insets = useSafeAreaInsets();

  const [kind, setKind] = useState<UiRoomKind>('group');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tagsStr, setTagsStr] = useState('');
  const [maxParticipantsStr, setMaxParticipantsStr] = useState('100');
  const [peerId, setPeerId] = useState(peerFromRoute);
  const [ttlDays, setTtlDays] = useState('0');
  const [ttlHours, setTtlHours] = useState('24');
  const [ttlMinutes, setTtlMinutes] = useState('0');
  const [ttlSeconds, setTtlSeconds] = useState('0');
  const [msgExpireSec, setMsgExpireSec] = useState('0');
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [keyboardPad, setKeyboardPad] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const roomType = KIND_TO_TYPE[kind];

  useEffect(() => {
    const onShow = (e: any) => {
      setKeyboardPad(Math.max(0, Number(e?.endCoordinates?.height || 0)));
    };
    const onHide = () => setKeyboardPad(0);
    const subShow = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', onShow);
    const subHide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', onHide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  const canCreate = useMemo(() => {
    if (!uid || !String(title || '').trim()) return false;
    if (kind === 'dm') {
      const p = String(peerId || '').trim();
      return p.length > 0 && p !== uid;
    }
    return true;
  }, [uid, title, kind, peerId]);

  const pickCover = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: false,
        quality: 0.85,
      });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      setLocalPhotoUri(String(res.assets[0].uri));
    } catch {
      /* noop */
    }
  };

  const onCreate = async () => {
    if (!canCreate || busy) return;
    const t = String(title || '').trim();
    if (!t) {
      Alert.alert('알림', '방 제목을 입력해 주세요.');
      return;
    }

    const tags = normalizeRoomTags(tagsStr);
    const maxP = Math.max(2, Math.min(500, parseInt(String(maxParticipantsStr || '100'), 10) || 100));

    let participantIds: string[] = [uid];
    if (kind === 'dm') {
      const other = String(peerId).trim();
      participantIds = Array.from(new Set([uid, other])).filter(Boolean);
      if (participantIds.length !== 2) {
        Alert.alert('알림', '1:1 방은 서로 다른 두 명의 UID가 필요합니다.');
        return;
      }
    }

    setBusy(true);
    try {
      if (roomType === 'ttl') {
        const sec = ttlTotalSecFromParts(ttlDays, ttlHours, ttlMinutes, ttlSeconds);
        const cost = ttlCreateCostYoy(sec);
        Alert.alert(
          'TTL 방 생성 비용',
          `선택한 기간 기준 약 ${cost} YOY가 소요됩니다. (지갑 연동 후 자동 차감)\n· 24시간 이하: 3 YOY\n· 24시간 초과 ~ 90일 이내: 30 YOY`
        );
      }
      const ttl =
        roomType === 'ttl'
          ? {
              enabled: true,
              explodeRoomAt: ttlExplodeFromParts(ttlDays, ttlHours, ttlMinutes, ttlSeconds),
              messageExpireSeconds: (() => {
                const n = Math.max(0, Math.min(3600 * 24 * 365, Number(msgExpireSec || 0)));
                return n > 0 ? n : null;
              })(),
            }
          : undefined;

      const room = await createRoomV2(firestore, {
        type: roomType,
        createdBy: uid,
        participantIds,
        title: t,
        description: String(description || '').trim() || undefined,
        tags: tags.length ? tags : undefined,
        maxParticipants: kind === 'dm' ? 2 : maxP,
        ttl: ttl as any,
      });

      if (localPhotoUri) {
        try {
          const url = await uploadRoomCoverPhotoV2({
            storage: firebaseStorage,
            roomId: room.id,
            localUri: localPhotoUri,
          });
          await setDoc(
            getRoomDocRef(firestore, room.id),
            { photoURL: url, avatarUrl: url, updatedAt: Date.now() } as any,
            { merge: true }
          );
        } catch (e: any) {
          logYyRoom('room.photo.upload.fail', { roomId: room.id, phase: 'after_create', error: String(e?.message || e) });
        }
      }

      router.replace({ pathname: '/chatv2/room', params: { id: String(room.id), openSettings: '1' } } as any);
    } catch (e: any) {
      logYyRoom('room.create.fail', { error: String(e?.message || e), kind });
      Alert.alert('생성 실패', String(e?.message || e || '알 수 없는 오류'));
    } finally {
      setBusy(false);
    }
  };

  const footerPad = Math.max(insets.bottom, 10) + keyboardPad;

  const ttlField = (label: string, value: string, setVal: (s: string) => void, flex: number) => (
    <View style={{ flex, minWidth: 72 }}>
      <Text style={{ color: '#888', fontSize: 11, marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={(txt) => setVal(txt.replace(/[^\d]/g, ''))}
        keyboardType="number-pad"
        placeholder="0"
        placeholderTextColor="#666"
        onFocus={() => {
          requestAnimationFrame(() => {
            try {
              scrollRef.current?.scrollToEnd({ animated: true });
            } catch {}
          });
        }}
        style={{
          borderWidth: 1,
          borderColor: '#333',
          borderRadius: 10,
          paddingHorizontal: 10,
          paddingVertical: 10,
          color: '#EEE',
          backgroundColor: '#111',
          fontWeight: '800',
        }}
      />
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0C0C0C' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? Math.max(0, insets.top) + 56 : 0}
    >
      <View style={{ flex: 1 }}>
      <View style={{ height: 56, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#D4AF37' }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={{ color: '#FFD700', fontWeight: '900' }}>←</Text>
        </TouchableOpacity>
        <Text style={{ color: '#EEE', fontWeight: '900' }}>방 만들기</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
        contentContainerStyle={{ padding: 14, paddingBottom: keyboardPad > 0 ? 40 : 24 }}
        showsVerticalScrollIndicator
      >
        <Text style={{ color: '#AAA', marginTop: 6 }}>타입</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {(
            [
              { k: 'group' as const, label: '그룹' },
              { k: 'dm' as const, label: '1:1' },
              { k: 'secret' as const, label: 'Secret' },
              { k: 'ttl' as const, label: 'TTL' },
              { k: 'notice' as const, label: '공지' },
            ] as const
          ).map((x) => {
            const active = kind === x.k;
            return (
              <TouchableOpacity key={x.k} onPress={() => setKind(x.k)} style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: active ? '#FFD700' : '#333' }}>
                <Text style={{ color: active ? '#FFD700' : '#AAA', fontWeight: '900' }}>{x.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {kind === 'dm' ? (
          <Text style={{ color: '#777', marginTop: 10, fontSize: 12 }}>
            상대 UID(또는 친구 화면에서 전달된 peerId). 본인과 같으면 안 됩니다.
          </Text>
        ) : null}

        {kind === 'dm' ? (
          <>
            <Text style={{ color: '#AAA', marginTop: 12 }}>상대방 UID</Text>
            <TextInput
              value={peerId}
              onChangeText={setPeerId}
              placeholder="상대 uid"
              placeholderTextColor="#666"
              autoCapitalize="none"
              style={{ marginTop: 8, borderWidth: 1, borderColor: '#333', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, color: '#EEE', backgroundColor: '#111', fontWeight: '800' }}
            />
          </>
        ) : null}

        <Text style={{ color: '#AAA', marginTop: 14 }}>방 이름 (필수)</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="방 이름을 입력하세요"
          placeholderTextColor="#666"
          style={{ marginTop: 8, borderWidth: 1, borderColor: '#333', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, color: '#EEE', backgroundColor: '#111', fontWeight: '800' }}
        />

        <Text style={{ color: '#AAA', marginTop: 14 }}>설명</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="선택"
          placeholderTextColor="#666"
          multiline
          style={{ marginTop: 8, minHeight: 72, borderWidth: 1, borderColor: '#333', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, color: '#EEE', backgroundColor: '#111' }}
        />

        <Text style={{ color: '#AAA', marginTop: 14 }}>대표 이미지 (선택)</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <View style={{ width: 64, height: 64, borderRadius: 10, overflow: 'hidden', backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' }}>
            {localPhotoUri ? <Image source={{ uri: localPhotoUri }} style={{ width: 64, height: 64 }} /> : <Text style={{ color: '#666' }}>없음</Text>}
          </View>
          <TouchableOpacity onPress={pickCover} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#FFD700' }}>
            <Text style={{ color: '#FFD700', fontWeight: '800' }}>사진 선택</Text>
          </TouchableOpacity>
        </View>

        <Text style={{ color: '#AAA', marginTop: 14 }}>태그 (쉼표·공백 구분, 최대 10개)</Text>
        <TextInput
          value={tagsStr}
          onChangeText={setTagsStr}
          placeholder="예: 프로젝트, 팀, 공지"
          placeholderTextColor="#666"
          style={{ marginTop: 8, borderWidth: 1, borderColor: '#333', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, color: '#EEE', backgroundColor: '#111' }}
        />

        {kind !== 'dm' ? (
          <>
            <Text style={{ color: '#AAA', marginTop: 14 }}>참여 인원 상한 (maxParticipants)</Text>
            <TextInput
              value={maxParticipantsStr}
              onChangeText={setMaxParticipantsStr}
              keyboardType="number-pad"
              placeholder="100"
              placeholderTextColor="#666"
              style={{ marginTop: 8, borderWidth: 1, borderColor: '#333', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, color: '#EEE', backgroundColor: '#111', fontWeight: '800' }}
            />
            <Text style={{ color: '#666', marginTop: 6, fontSize: 12 }}>선택된 숫자는 최대 참가자 수로 저장됩니다 (2~500).</Text>
          </>
        ) : (
          <Text style={{ color: '#666', marginTop: 10, fontSize: 12 }}>1:1 방은 인원 2명으로 고정됩니다.</Text>
        )}

        {kind === 'ttl' ? (
          <>
            <Text style={{ color: '#AAA', marginTop: 14 }}>방 폭파까지 (일 · 시 · 분 · 초)</Text>
            <Text style={{ color: '#666', marginTop: 6, fontSize: 12 }}>
              각 칸에 숫자만 입력합니다. 합계 최소 60초, 최대 365일입니다. (기본 0일 24시간 0분 0초)
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {ttlField('일', ttlDays, setTtlDays, 1)}
              {ttlField('시간', ttlHours, setTtlHours, 1)}
              {ttlField('분', ttlMinutes, setTtlMinutes, 1)}
              {ttlField('초', ttlSeconds, setTtlSeconds, 1)}
            </View>
            <Text style={{ color: '#AAA', marginTop: 14 }}>메시지 만료(초, 0=없음)</Text>
            <TextInput
              value={msgExpireSec}
              onChangeText={setMsgExpireSec}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor="#666"
              onFocus={() => {
                requestAnimationFrame(() => {
                  try {
                    scrollRef.current?.scrollToEnd({ animated: true });
                  } catch {}
                });
              }}
              style={{ marginTop: 8, borderWidth: 1, borderColor: '#333', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, color: '#EEE', backgroundColor: '#111', fontWeight: '800' }}
            />
          </>
        ) : null}
      </ScrollView>

      <View
        style={{
          paddingHorizontal: 14,
          paddingTop: 10,
          paddingBottom: footerPad,
          borderTopWidth: 1,
          borderTopColor: '#222',
          backgroundColor: '#0C0C0C',
        }}
      >
        <TouchableOpacity
          disabled={!canCreate || busy}
          onPress={onCreate}
          activeOpacity={0.85}
          style={{ paddingVertical: 14, borderRadius: 12, backgroundColor: canCreate ? '#D4AF37' : '#333', alignItems: 'center' }}
        >
          <Text style={{ color: '#0C0C0C', fontWeight: '900' }}>{busy ? '생성 중…' : 'Create Room'}</Text>
        </TouchableOpacity>
      </View>
      </View>
    </KeyboardAvoidingView>
  );
}
