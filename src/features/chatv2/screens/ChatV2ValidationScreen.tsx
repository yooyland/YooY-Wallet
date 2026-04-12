import React, { useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';

type Verdict = 'unmarked' | 'pass' | 'fail';

type ChecklistItem = {
  id: string;
  title: string;
  howTo?: string;
};

type ChecklistSection = {
  id: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  title: string;
  items: ChecklistItem[];
};

function VerdictPill(props: { value: Verdict; onChange: (v: Verdict) => void }) {
  const mkBtn = (label: string, v: Verdict) => {
    const active = props.value === v;
    const bg = active ? (v === 'pass' ? '#1F3A26' : v === 'fail' ? '#4A1F1F' : '#2A2A2A') : '#111';
    const border = active ? (v === 'pass' ? '#2EA043' : v === 'fail' ? '#FF6B6B' : '#555') : '#222';
    const fg = active ? (v === 'pass' ? '#7CFFB5' : v === 'fail' ? '#FF8A8A' : '#DDD') : '#AAA';
    return (
      <TouchableOpacity
        key={v}
        activeOpacity={0.85}
        onPress={() => props.onChange(v)}
        style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: border, backgroundColor: bg }}
      >
        <Text style={{ color: fg, fontWeight: '900', fontSize: 12 }}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {mkBtn('미확인', 'unmarked')}
      {mkBtn('완료', 'pass')}
      {mkBtn('문제', 'fail')}
    </View>
  );
}

export default function ChatV2ValidationScreen() {
  const sections: ChecklistSection[] = useMemo(
    () => [
      {
        id: 'A',
        title: 'DM 재사용',
        items: [
          { id: 'A1', title: '같은 두 유저는 항상 같은 DM을 재사용' },
          { id: 'A2', title: 'peerDisplayName이 비거나 틀리지 않음' },
        ],
      },
      {
        id: 'B',
        title: '미디어 전송 / 미리보기',
        items: [
          { id: 'B1', title: '이미지/영상/파일 전송 가능', howTo: '두 기기로 각각 보내보기 (이미지 1장 / 동영상 1개 / 파일 1개)' },
          { id: 'B2', title: 'ready/failed 상태가 정상', howTo: '네트워크 끊기/복구 등으로 실패 케이스도 확인' },
          { id: 'B3', title: '송신/수신 렌더가 동일', howTo: '수신자 기기에서도 동일 타입/미리보기/상태로 보이는지 확인' },
          { id: 'B4', title: '미리보기 동작 정상', howTo: 'ready 상태에서 탭 → 이미지/영상은 인앱 미리보기, 파일은 외부 열기(또는 미리보기) 확인' },
        ],
      },
      {
        id: 'C',
        title: '언리드 안정성',
        items: [
          { id: 'C1', title: 'unread는 상대에게만 증가(발신자 제외)' },
          { id: 'C2', title: '방 입장 시 unread 0으로 클리어' },
          { id: 'C3', title: '배지 중복/이상 증가 없음', howTo: '같은 메시지로 배지가 2번 증가하거나 튀는 현상이 없는지 확인' },
        ],
      },
      {
        id: 'D',
        title: '나가기 / 재입장',
        items: [
          { id: 'D1', title: '나가기 즉시 방 목록에서 제거' },
          { id: 'D2', title: '재입장 시 membership/summary가 정상 재생성' },
        ],
      },
      {
        id: 'E',
        title: 'QR / 링크 진입',
        items: [
          { id: 'E1', title: 'QR 스캔 → entry → 방 오픈', howTo: 'QR 스캔 화면에서 스캔 후 자동으로 방으로 진입되는지 확인' },
          { id: 'E2', title: 'yooy invite/room/dm 링크가 정상 오픈', howTo: 'yooy://invite?roomId= / yooy://room?id= / yooy://dm?otherId= 확인' },
        ],
      },
      {
        id: 'F',
        title: '내보내기(export)',
        items: [{ id: 'F1', title: 'export/share가 실기기에서 실제로 동작', howTo: '방 설정 → 내보내기 → 공유 시트/파일 생성 확인' }],
      },
    ],
    []
  );

  const allItemIds = useMemo(() => sections.flatMap((s) => s.items.map((i) => i.id)), [sections]);
  const [verdictById, setVerdictById] = useState<Record<string, Verdict>>(() =>
    Object.fromEntries(allItemIds.map((id) => [id, 'unmarked']))
  );

  const counts = useMemo(() => {
    const vals = Object.values(verdictById);
    const pass = vals.filter((v) => v === 'pass').length;
    const fail = vals.filter((v) => v === 'fail').length;
    const unmarked = vals.filter((v) => v === 'unmarked').length;
    return { pass, fail, unmarked, total: vals.length };
  }, [verdictById]);

  const setVerdict = (id: string, v: Verdict) => setVerdictById((prev) => ({ ...prev, [id]: v }));
  const resetAll = () => setVerdictById(Object.fromEntries(allItemIds.map((id) => [id, 'unmarked'])));

  return (
    <View style={{ flex: 1, backgroundColor: '#0C0C0C' }}>
      <View style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#1E1E1E' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: '#FFD700', fontWeight: '900', fontSize: 18 }}>체크리스트</Text>
            <Text style={{ color: '#777', marginTop: 4, fontSize: 12 }}>
              완료 {counts.pass} · 문제 {counts.fail} · 미확인 {counts.unmarked} / {counts.total}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                try {
                  router.back();
                } catch {}
              }}
              style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#333' }}
            >
              <Text style={{ color: '#AAA', fontWeight: '900', fontSize: 12 }}>뒤로</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={resetAll}
              style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#FFD700' }}
            >
              <Text style={{ color: '#FFD700', fontWeight: '900', fontSize: 12 }}>리셋</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 28, gap: 14 }}>
        <View style={{ borderWidth: 1, borderColor: '#1E1E1E', borderRadius: 12, padding: 12, backgroundColor: '#101010' }}>
          <Text style={{ color: '#AAA', fontSize: 12, lineHeight: 16 }}>
            각 항목을 확인한 뒤 상태를 선택하세요. (체크 상태는 이 화면의 로컬 상태로만 유지됩니다.)
          </Text>
        </View>

        {sections.map((sec) => (
          <View key={sec.id} style={{ borderWidth: 1, borderColor: '#1E1E1E', borderRadius: 12, padding: 12, gap: 10 }}>
            <Text style={{ color: '#EEE', fontWeight: '900' }}>
              {sec.id}. {sec.title}
            </Text>

            {sec.items.map((it) => (
              <View key={it.id} style={{ borderWidth: 1, borderColor: '#222', borderRadius: 12, padding: 12, backgroundColor: '#0F0F0F' }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: '#DDD', fontWeight: '800' }}>
                      {it.id}. {it.title}
                    </Text>
                    {it.howTo ? <Text style={{ color: '#777', marginTop: 6, fontSize: 12, lineHeight: 16 }}>{it.howTo}</Text> : null}
                  </View>
                  <VerdictPill value={verdictById[it.id] || 'unmarked'} onChange={(v) => setVerdict(it.id, v)} />
                </View>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

