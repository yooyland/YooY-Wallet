import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { firebaseAuth, firestore } from '@/lib/firebase';
import { useChatV2Store } from '../store/chatv2.store';
import { refreshDmPeerDisplayNameV2 } from '../services/roomListService';

function Btn(props: { label: string; onPress: () => void; tone?: 'gold' | 'gray' }) {
  const tone = props.tone || 'gold';
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={props.onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: tone === 'gold' ? '#FFD700' : '#333',
        backgroundColor: 'transparent',
      }}
    >
      <Text style={{ color: tone === 'gold' ? '#FFD700' : '#AAA', fontWeight: '900' }}>{props.label}</Text>
    </TouchableOpacity>
  );
}

export default function ChatValidateV2() {
  const uid = String(firebaseAuth.currentUser?.uid || '');
  const roomIds = useChatV2Store((s) => s.roomIds);
  const roomsById = useChatV2Store((s) => s.roomsById);
  const resetAll = useChatV2Store((s) => s.resetAll);

  const [note, setNote] = useState<string>('');

  const dmRoomIds = useMemo(() => {
    return (roomIds || []).filter((rid) => String(roomsById[rid]?.type || '') === 'dm');
  }, [roomIds, roomsById]);

  return (
    <View style={{ flex: 1, backgroundColor: '#0C0C0C' }}>
      <View style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#1E1E1E' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
            <Text style={{ color: '#FFD700', fontWeight: '900', fontSize: 18 }}>채팅 점검</Text>
            <Text style={{ color: '#777', marginTop: 4, fontSize: 12 }} numberOfLines={2}>
              uid={uid || '(none)'} · 디바이스에서 아래 체크 순서대로 실행
            </Text>
          </View>
          <Btn label="뒤로" tone="gray" onPress={() => { try { router.back(); } catch {} }} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, gap: 16, paddingBottom: 24 }}>
        {!!note ? (
          <View style={{ borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 12, padding: 12 }}>
            <Text style={{ color: '#AAA' }}>{note}</Text>
          </View>
        ) : null}

        <View style={{ borderWidth: 1, borderColor: '#1E1E1E', borderRadius: 12, padding: 12, gap: 10 }}>
          <Text style={{ color: '#EEE', fontWeight: '900' }}>A. DM 재사용</Text>
          <Text style={{ color: '#777', fontSize: 12, lineHeight: 16 }}>
            - 같은 두 유저: 항상 같은 DM room 재사용{'\n'}- DM 제목: 상대방 이름(또는 uid) 유지{'\n'}- 필요 시 아래 버튼으로 peerDisplayName 강제 갱신
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Btn
              label="DM 목록으로"
              onPress={() => { try { router.push('/chatv2'); } catch {} }}
            />
            <Btn
              label="DM peer 이름 갱신"
              onPress={async () => {
                try {
                  if (!uid) return;
                  const targets = dmRoomIds.slice(0, 25);
                  await Promise.all(targets.map((rid) => refreshDmPeerDisplayNameV2({ firestore, uid, roomId: rid })));
                  setNote(`DM peerDisplayName 갱신 요청: ${targets.length}개`);
                } catch {
                  setNote('DM peerDisplayName 갱신 실패');
                }
              }}
            />
          </View>
        </View>

        <View style={{ borderWidth: 1, borderColor: '#1E1E1E', borderRadius: 12, padding: 12, gap: 10 }}>
          <Text style={{ color: '#EEE', fontWeight: '900' }}>B. 미디어 전송/미리보기</Text>
          <Text style={{ color: '#777', fontSize: 12, lineHeight: 16 }}>
            - 이미지/영상/파일 전송{'\n'}- sending→ready / failed{'\n'}- 수신자도 동일 렌더링{'\n'}- failed는 (보낸 사람만) “재시도” 버튼 노출
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Btn label="채팅방으로 이동(리스트에서 선택)" onPress={() => { try { router.push('/chatv2'); } catch {} }} />
          </View>
        </View>

        <View style={{ borderWidth: 1, borderColor: '#1E1E1E', borderRadius: 12, padding: 12, gap: 10 }}>
          <Text style={{ color: '#EEE', fontWeight: '900' }}>C. 언리드 안정성</Text>
          <Text style={{ color: '#777', fontSize: 12, lineHeight: 16 }}>
            - 발신자 unread 증가 금지{'\n'}- 수신자만 +1{'\n'}- 방 입장 시 즉시 0{'\n'}- 현재 방에서는 로컬 알림/배지 중복이 없어야 함
          </Text>
        </View>

        <View style={{ borderWidth: 1, borderColor: '#1E1E1E', borderRadius: 12, padding: 12, gap: 10 }}>
          <Text style={{ color: '#EEE', fontWeight: '900' }}>D. 나가기/재입장</Text>
          <Text style={{ color: '#777', fontSize: 12, lineHeight: 16 }}>
            - 나가기 즉시 리스트에서 사라짐{'\n'}- 재입장 시 membership/summary 재생성{'\n'}- leave/rejoin 후 unread 이상 없음
          </Text>
        </View>

        <View style={{ borderWidth: 1, borderColor: '#1E1E1E', borderRadius: 12, padding: 12, gap: 10 }}>
          <Text style={{ color: '#EEE', fontWeight: '900' }}>E. QR/링크 진입</Text>
          <Text style={{ color: '#777', fontSize: 12, lineHeight: 16 }}>
            - QR 스캔 → entry → room 오픈{'\n'}- yooy://invite, yooy://room, yooy://dm{'\n'}- 스캔 처리 중 멈추면 상단 “다시”로 재스캔 가능
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Btn label="QR코드 흐름으로" onPress={() => { try { router.push('/chatv2/qr'); } catch {} }} />
          </View>
        </View>

        <View style={{ borderWidth: 1, borderColor: '#1E1E1E', borderRadius: 12, padding: 12, gap: 10 }}>
          <Text style={{ color: '#EEE', fontWeight: '900' }}>F. 내보내기(export)</Text>
          <Text style={{ color: '#777', fontSize: 12, lineHeight: 16 }}>
            - 방 설정 &gt; 대화 내보내기{'\n'}- 공유 시트/저장 동작 실제 확인
          </Text>
        </View>

        <View style={{ borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 12, padding: 12, gap: 10 }}>
          <Text style={{ color: '#EEE', fontWeight: '900' }}>유틸</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Btn
              label="로컬 스토어 리셋"
              tone="gray"
              onPress={() => {
                try {
                  resetAll();
                  setNote('로컬 스토어 resetAll() 완료');
                } catch {
                  setNote('로컬 스토어 resetAll() 실패');
                }
              }}
            />
          </View>
          <Text style={{ color: '#666', fontSize: 12, lineHeight: 16 }}>
            ※ 이 화면은 점검용 안내입니다. 정상 사용자 동선에는 노출하지 않는 것을 권장합니다.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

