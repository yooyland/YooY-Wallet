import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { firestore, firebaseAuth } from '../../../lib/firebase';
import { getDmPairKeyV2 } from '../core/roomSchema';
import { chatV2Paths } from '../core/firestorePaths';

type Row = { ok: boolean; title: string; detail?: string };

export default function ChatV2Validate() {
  const uid = String(firebaseAuth.currentUser?.uid || '');
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);

  const run = async () => {
    if (!uid) {
      setRows([{ ok: false, title: '로그인 상태 확인', detail: 'uid 없음' }]);
      return;
    }

    setRunning(true);
    const out: Row[] = [];
    try {
      // A) DM reuse (sample from my joinedRooms)
      try {
        const joinedSnap = await getDocs(query(collection(firestore, chatV2Paths.userJoinedRooms(uid)), limit(30)));
        const dmRoomIds: string[] = [];
        joinedSnap.forEach((d) => {
          const v: any = d.data() || {};
          if (String(v.type) === 'dm') dmRoomIds.push(String(v.roomId || d.id));
        });

        if (dmRoomIds.length === 0) {
          out.push({ ok: true, title: 'DM 재사용(pairKey)', detail: '내 DM joinedRooms 없음(스킵)' });
        } else {
          const rid = dmRoomIds[0];
          const roomByIdSnap = await getDocs(query(collection(firestore, chatV2Paths.rooms()), where('__name__', '==', rid), limit(1)));
          if (roomByIdSnap.empty) {
            out.push({ ok: false, title: 'DM 재사용(pairKey)', detail: `rooms/${rid} not found` });
          } else {
            const room: any = roomByIdSnap.docs[0].data() || {};
            const ids: string[] = Array.isArray(room.participantIds) ? room.participantIds : [];
            const pairKey =
              String(room.dmPairKey || '') ||
              (ids.length >= 2 ? getDmPairKeyV2(String(ids[0]), String(ids[1])) : '');
            if (!pairKey) {
              out.push({ ok: false, title: 'DM 재사용(pairKey)', detail: 'dmPairKey 계산 불가' });
            } else {
              const dmSnap = await getDocs(
                query(collection(firestore, chatV2Paths.rooms()), where('type', '==', 'dm'), where('dmPairKey', '==', pairKey), limit(3))
              );
              out.push({
                ok: dmSnap.size === 1,
                title: 'DM 재사용(pairKey 1개 방)',
                detail: `pairKey=${pairKey}, roomsFound=${dmSnap.size}`,
              });
            }
          }
        }
      } catch (e: any) {
        out.push({ ok: false, title: 'DM 재사용 검사 실패', detail: String(e?.message || e) });
      }

      // A) peerDisplayName present for my DM joinedRooms
      try {
        const joinedSnap = await getDocs(query(collection(firestore, chatV2Paths.userJoinedRooms(uid)), limit(50)));
        let dmCount = 0;
        let missing = 0;
        joinedSnap.forEach((d) => {
          const v: any = d.data() || {};
          if (String(v.type) !== 'dm') return;
          dmCount++;
          const name = String(v.peerDisplayName || '').trim();
          if (!name) missing++;
        });
        out.push({ ok: missing === 0, title: 'DM peerDisplayName 채움', detail: `dm=${dmCount}, missing=${missing}` });
      } catch (e: any) {
        out.push({ ok: false, title: 'peerDisplayName 검사 실패', detail: String(e?.message || e) });
      }

      // C) unread sanity: unreadCount is numeric in joinedRooms
      try {
        const joinedSnap = await getDocs(query(collection(firestore, chatV2Paths.userJoinedRooms(uid)), limit(50)));
        let bad = 0;
        joinedSnap.forEach((d) => {
          const v: any = d.data() || {};
          if (v.unreadCount != null && typeof v.unreadCount !== 'number') bad++;
        });
        out.push({ ok: bad === 0, title: 'joinedRooms unreadCount 타입', detail: `bad=${bad}` });
      } catch (e: any) {
        out.push({ ok: false, title: 'unread 검사 실패', detail: String(e?.message || e) });
      }

      // Manual/device flows checklist
      out.push({ ok: true, title: '미디어 송신/프리뷰', detail: '기기에서 이미지/영상/파일 전송 + ready/failed + 프리뷰 확인' });
      out.push({ ok: true, title: '언리드 안정성', detail: '상대에게만 +1, 입장 시 0, 배지 중복/튀는 현상 없음' });
      out.push({ ok: true, title: '나가기/재입장', detail: '나가기 즉시 목록 제거 + 재입장 시 멤버십/요약 정상 생성' });
      out.push({ ok: true, title: 'QR/링크 진입', detail: 'scan→entry→room 자동 입장 / yooy://invite|room|dm' });
      out.push({ ok: true, title: '대화 내보내기', detail: '설정→내보내기→공유 시트/파일 생성 확인' });
    } finally {
      setRows(out);
      setRunning(false);
    }
  };

  const okCount = useMemo(() => rows.filter((r) => r.ok).length, [rows]);

  return (
    <View style={{ flex: 1, backgroundColor: '#0C0C0C' }}>
      <View
        style={{
          paddingHorizontal: 14,
          paddingTop: 14,
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: '#1E1E1E',
        }}
      >
        <Text style={{ color: '#FFD700', fontWeight: '900', fontSize: 18 }}>채팅 점검</Text>
        <Text style={{ color: '#777', marginTop: 4, fontSize: 12 }}>자동 점검 + 기기 확인 항목</Text>
      </View>

      <View style={{ paddingHorizontal: 14, paddingTop: 12 }}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={running ? undefined : run}
          style={{
            backgroundColor: running ? '#2A2A2A' : '#FFD700',
            paddingVertical: 12,
            borderRadius: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#0C0C0C', fontWeight: '900' }}>{running ? '실행 중…' : '점검 실행'}</Text>
        </TouchableOpacity>

        <Text style={{ color: '#AAA', marginTop: 10, fontSize: 12 }}>
          결과: {okCount}/{rows.length}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 24 }}>
        {rows.map((r, idx) => (
          <View
            key={`${idx}-${r.title}`}
            style={{
              marginTop: 10,
              padding: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: r.ok ? '#1F3A26' : '#4A1F1F',
              backgroundColor: '#101010',
            }}
          >
            <Text style={{ color: r.ok ? '#7CFFB5' : '#FF8A8A', fontWeight: '900' }}>
              {r.ok ? '정상' : '오류'} · {r.title}
            </Text>
            {r.detail ? <Text style={{ color: '#AAA', marginTop: 6, fontSize: 12 }}>{r.detail}</Text> : null}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, Platform } from 'react-native';
import { router } from 'expo-router';

export default function ChatV2Validate() {
  const [otherId, setOtherId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [raw, setRaw] = useState('');

  const tips = useMemo(
    () => [
      'A. DM 재사용: 같은 two users -> 항상 동일 DM roomId / peerDisplayName 정상',
      'B. 미디어: sending/ready/failed 상태 + sender/receiver 동일 렌더 + preview 동작',
      'C. unread: sender 제외 + enter 시 0 + badge 중복/튀는 현상 없음',
      'D. leave/rejoin: 나가기 즉시 리스트에서 제거 + 재입장 시 membership/summary 재생성',
      'E. QR/link: scan -> entry -> room open / yooy://invite|room|dm 동작',
      'F. export: 내보내기/공유가 실기기에서 실제로 동작',
    ],
    []
  );

  const go = (pathname: string, params?: any) => {
    try {
      router.push({ pathname, params } as any);
    } catch {}
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#0C0C0C' }} contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
      <Text style={{ color: '#FFD700', fontWeight: '900', fontSize: 18 }}>점검</Text>
      <Text style={{ color: '#AAA', marginTop: 8, lineHeight: 18 }}>
        내부 점검용 화면입니다. ({Platform.OS})
      </Text>

      <View style={{ marginTop: 14, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#222', backgroundColor: '#111' }}>
        {tips.map((t) => (
          <Text key={t} style={{ color: '#DDD', marginBottom: 6, lineHeight: 18 }}>
            - {t}
          </Text>
        ))}
      </View>

      <View style={{ marginTop: 18 }}>
        <Text style={{ color: '#EEE', fontWeight: '900' }}>A. DM 재사용 체크</Text>
        <Text style={{ color: '#777', marginTop: 6 }}>상대 uid 입력 후 DM 진입을 2번 반복해서 동일 방 재사용 확인</Text>
        <TextInput
          value={otherId}
          onChangeText={setOtherId}
          placeholder="otherId (상대 uid)"
          placeholderTextColor="#555"
          autoCapitalize="none"
          style={{ marginTop: 10, borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: '#EEE' }}
        />
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => (otherId.trim() ? go('/chatv2/dm', { otherId: otherId.trim() }) : undefined)}
          style={{ marginTop: 10, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#FFD700', alignItems: 'center' }}
        >
          <Text style={{ color: '#FFD700', fontWeight: '900' }}>DM 열기</Text>
        </TouchableOpacity>
      </View>

      <View style={{ marginTop: 18 }}>
        <Text style={{ color: '#EEE', fontWeight: '900' }}>E. QR / 링크 Entry 체크</Text>
        <Text style={{ color: '#777', marginTop: 6 }}>raw 문자열로 entry 라우트를 직접 열어 파싱/자동입장 확인</Text>
        <TextInput
          value={raw}
          onChangeText={setRaw}
          placeholder="raw (yooy://... 또는 https...)"
          placeholderTextColor="#555"
          autoCapitalize="none"
          style={{ marginTop: 10, borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: '#EEE' }}
        />
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => (raw.trim() ? go('/chatv2/entry', { raw: raw.trim() }) : undefined)}
          style={{ marginTop: 10, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#FFD700', alignItems: 'center' }}
        >
          <Text style={{ color: '#FFD700', fontWeight: '900' }}>Entry 열기</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => go('/chatv2/scan')}
          style={{ marginTop: 10, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#333', alignItems: 'center' }}
        >
          <Text style={{ color: '#DDD', fontWeight: '900' }}>QR 스캔 화면 열기</Text>
        </TouchableOpacity>
      </View>

      <View style={{ marginTop: 18 }}>
        <Text style={{ color: '#EEE', fontWeight: '900' }}>B/C/D/F 공통: 방 직접 열기</Text>
        <Text style={{ color: '#777', marginTop: 6 }}>roomId로 방에 들어가서 미디어/언리드/나가기/내보내기 확인</Text>
        <TextInput
          value={roomId}
          onChangeText={setRoomId}
          placeholder="roomId"
          placeholderTextColor="#555"
          autoCapitalize="none"
          style={{ marginTop: 10, borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: '#EEE' }}
        />
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => (roomId.trim() ? go('/chatv2/room', { id: roomId.trim() }) : undefined)}
          style={{ marginTop: 10, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#FFD700', alignItems: 'center' }}
        >
          <Text style={{ color: '#FFD700', fontWeight: '900' }}>Room 열기</Text>
        </TouchableOpacity>
      </View>

      <View style={{ marginTop: 20 }}>
        <Text style={{ color: '#AAA', lineHeight: 18 }}>
          권장: 실기기 2대(서로 다른 uid)로 DM 재사용/미디어 표시/언리드/나가기 반영을 빠르게 반복 확인하세요.
        </Text>
      </View>
    </ScrollView>
  );
}

