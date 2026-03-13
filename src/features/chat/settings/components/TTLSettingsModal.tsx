import React from 'react';
import { Modal, View, Text, TouchableOpacity, TextInput, Switch, Alert, ScrollView, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import type { RoomType } from '../types';

export interface TTLSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  onLeave?: () => Promise<void>;
  roomType: RoomType; // 'TTL' only, but 타입 유지
  expiresAtMs: number;
  messageTtlMs: number;
  onSetRoomTTL: (targetExpiresAtMs: number) => Promise<void>;
  onSetMessageTTL: (ttlMs: number) => Promise<void>;
  // 보안 설정은 관리자/운영진만 수정 가능
  canEditSecurity: boolean;
  security: {
    allowImageUpload: boolean;
    allowImageDownload: boolean;
    allowCapture: boolean;
    allowExternalShare: boolean;
  };
  onSaveSecurity: (sec: TTLSettingsModalProps['security']) => Promise<void>;
}

function toMs(d: string, h: string, m: string, s: string) {
  const dd = Math.max(0, Number(d || 0));
  const hh = Math.max(0, Number(h || 0));
  const mm = Math.max(0, Number(m || 0));
  const ss = Math.max(0, Number(s || 0));
  return (((dd * 24 + hh) * 60 + mm) * 60 + ss) * 1000;
}

function TTLSettingsModal(props: TTLSettingsModalProps) {
  const { visible, onClose, roomType, expiresAtMs, messageTtlMs, canEditSecurity } = props;
  const [d, setD] = React.useState('0');
  const [h, setH] = React.useState('0');
  const [m, setM] = React.useState('0');
  const [s, setS] = React.useState('0');
  const [mh, setMH] = React.useState('0');
  const [mm, setMM] = React.useState('0');
  const [ms, setMS] = React.useState('10');
  const [sec, setSec] = React.useState(props.security);
  const [isEditing, setIsEditing] = React.useState(false);
  // 키보드 높이 추적(저장 버튼이 가려지지 않게 padding 확보)
  const [keyboardHeight, setKeyboardHeight] = React.useState(0);
  React.useEffect(() => {
    const onShow = Keyboard.addListener('keyboardDidShow', (e: any) => {
      try { setKeyboardHeight(Number(e?.endCoordinates?.height || 0)); } catch { setKeyboardHeight(0); }
    });
    const onHide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { try { onShow.remove(); onHide.remove(); } catch {} };
  }, []);
  // 입력 포커스 유지용 ref (Android에서 키보드 내려감 방지)
  const msgHourRef = React.useRef<TextInput>(null);
  const msgMinRef = React.useRef<TextInput>(null);
  const msgSecRef = React.useRef<TextInput>(null);
  const dayRef = React.useRef<TextInput>(null);
  const hourRef = React.useRef<TextInput>(null);
  const minRef = React.useRef<TextInput>(null);
  const secRef = React.useRef<TextInput>(null);
  // 자동 포커스는 "처음 열릴 때 1회"만 적용하여 키보드가 다시 올라오는 문제 방지
  const [autoFocusArmed, setAutoFocusArmed] = React.useState(false);

  React.useEffect(() => {
    // 편집 중에는 외부 보안 토글 변경이 입력칸 포커스를 건드리지 않도록 무시
    if (isEditing) return;
    setSec(props.security);
  }, [props.security, isEditing]);

  // 모달을 열 때 현재 남은 TTL/메시지 TTL을 입력 칸에 1회 채워 넣는다 (열려있는 동안에는 사용자가 입력한 값 유지)
  React.useEffect(() => {
    if (!visible) return;
    const nowLocal = Date.now();
    const remain = Math.max(0, (expiresAtMs || 0) - nowLocal);
    const totalSec = Math.floor(remain / 1000);
    const dd = Math.floor(totalSec / (24 * 3600));
    const hh = Math.floor((totalSec % (24 * 3600)) / 3600);
    const mi = Math.floor((totalSec % 3600) / 60);
    const ss = totalSec % 60;
    setD(String(dd)); setH(String(hh)); setM(String(mi)); setS(String(ss));
    let msgSec = Math.max(0, Math.floor((messageTtlMs || 0) / 1000));
    // 기본값: 0이면 30초로 프리필(사용자가 변경 가능)
    if (msgSec === 0) msgSec = 30;
    const mmh = Math.floor(msgSec / 3600);
    const mmm = Math.floor((msgSec % 3600) / 60);
    const mss = msgSec % 60;
    setMH(String(mmh)); setMM(String(mmm)); setMS(String(mss));
    setIsEditing(false);
    // 자동 포커스는 모달이 열릴 때만 활성화
    setAutoFocusArmed(true);
  // 의도적으로 deps를 visible에만 둔다: 타이핑 중 외부 상태 변화로 값이 초기화되지 않도록
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // 모달이 열릴 때 자동 포커스로 키보드 유지
  React.useEffect(() => {
    if (!visible || !autoFocusArmed) return;
    const t = setTimeout(() => {
      try {
        // 메시지 TTL 첫 칸을 우선 포커스
        msgHourRef.current?.focus?.();
        // 1회만 적용
        setAutoFocusArmed(false);
      } catch {}
    }, 120);
    return () => { try { clearTimeout(t); } catch {} };
  }, [visible, autoFocusArmed]);

  // 모달 내부용 잔여시간 카운트다운 (입력과 무관)
  const [nowTs, setNowTs] = React.useState(Date.now());
  React.useEffect(() => {
    if (!visible || isEditing) return;
    const t = setInterval(() => { try { setNowTs(Date.now()); } catch {} }, 1000);
    return () => { try { clearInterval(t); } catch {} };
  }, [visible, isEditing]);
  const remainMs = Math.max(0, (expiresAtMs || 0) - nowTs);
  const days30Ms = 30 * 24 * 60 * 60 * 1000;
  const canExtend = remainMs <= days30Ms;
  const formattedRemain = (() => {
    const totalSec = Math.floor(remainMs / 1000);
    const dd = Math.floor(totalSec / (24 * 3600));
    const hh = Math.floor((totalSec % (24 * 3600)) / 3600);
    const mi = Math.floor((totalSec % 3600) / 60);
    const ss = totalSec % 60;
    return `${String(dd).padStart(2, '0')} | ${String(hh).padStart(2, '0')}:${String(mi).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  })();

  const onReduce = async () => {
    try {
      const targetMs = toMs(d, h, m, s);
      if (!targetMs) { Alert.alert('안내','유효한 TTL 시간을 입력하세요'); return; }
      const target = Date.now() + targetMs;
      if (expiresAtMs && target >= expiresAtMs) { Alert.alert('안내','감소(수정)는 현재 설정 이하로만 가능합니다'); return; }
      await props.onSetRoomTTL(target);
      onClose();
    } catch {}
  };

  const onExtend = async () => {
    try {
      const addMs = toMs(d, h, m, s);
      if (!addMs) { Alert.alert('안내','연장 시간을 입력하세요'); return; }
      // 규칙 1: 현재 잔여시간이 30일을 초과하면 연장 불가
      if (!canExtend) { Alert.alert('안내','현재 잔여시간이 30일을 초과하여 연장할 수 없습니다'); return; }
      // 규칙 2: 연장 값은 최대 30일까지만 허용
      const clampedAdd = Math.min(addMs, days30Ms);
      const nowLocal = Date.now();
      const base = (expiresAtMs && expiresAtMs > nowLocal) ? expiresAtMs : nowLocal;
      const next = base + clampedAdd;
      await props.onSetRoomTTL(next);
      onClose();
    } catch {}
  };

  const onSaveMsgTTL = async () => {
    try {
      const ttl = toMs('0', mh, mm, ms);
      await props.onSetMessageTTL(ttl);
      onClose();
    } catch {}
  };
  // 보안 설정은 토글 시 500ms 디바운스로 자동 저장
  React.useEffect(() => {
    if (!visible || !canEditSecurity || isEditing) return;
    const id = setTimeout(() => { try { void props.onSaveSecurity(sec); } catch {} }, 700);
    return () => { try { clearTimeout(id); } catch {} };
  }, [sec, visible, canEditSecurity, isEditing]);

  const InputBox = React.forwardRef<TextInput, {
    value: string;
    onChangeText: (v: string) => void;
    placeholder?: string;
    autoFocus?: boolean;
    maxLen?: number;
    nextRef?: React.RefObject<TextInput>;
    prevRef?: React.RefObject<TextInput>;
    returnKeyType?: 'next' | 'done';
  }>((props, ref) => {
    const { value, onChangeText, placeholder, autoFocus, maxLen=2, nextRef, prevRef, returnKeyType='next' } = props;
    return (
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(v)=> {
          const digits = String(v).replace(/[^0-9]/g,'');
          onChangeText(digits);
          setIsEditing(true);
          if (digits.length >= maxLen) {
            try { nextRef?.current?.focus?.(); } catch {}
          }
        }}
        placeholder={placeholder}
        placeholderTextColor="#666"
        keyboardType="number-pad"
        showSoftInputOnFocus={true}
        blurOnSubmit={false}
        autoFocus={autoFocus}
        maxLength={maxLen}
        editable
        autoCorrect={false}
        autoCapitalize="none"
        selectTextOnFocus
        importantForAutofill="no"
        returnKeyType={returnKeyType}
        onSubmitEditing={()=>{ try { if (returnKeyType==='next') nextRef?.current?.focus?.(); } catch {} }}
        onFocus={() => {
          // 포커스 시 자동포커스 루프 방지 및 편집 모드 진입
          if (autoFocusArmed) setAutoFocusArmed(false);
          setIsEditing(true);
          // 초기값 '0'이면 비워서 자연스럽게 입력 시작
          try { if (String(value) === '0') onChangeText(''); } catch {}
        }}
        onKeyPress={(e:any)=>{
          try {
            if (e?.nativeEvent?.key === 'Backspace' && String(value||'').length === 0) {
              prevRef?.current?.focus?.();
            }
          } catch {}
        }}
        // 4개 입력칸이 작은 화면에서도 모두 보이도록 너비 축소
        style={{ width:60, height:54, borderWidth:1, borderColor:'#2A2A2A', borderRadius:12, backgroundColor:'#111', color:'#F6F6F6', textAlign:'center', fontSize:18 }}
      />
    );
  });
  InputBox.displayName = 'InputBox';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.6)', alignItems:'center' }}>
        <View style={{ marginTop:60, width:340, maxWidth:'94%', backgroundColor:'#0F0F0F', borderWidth:1, borderColor:'#2A2A2A', borderRadius:14, overflow:'hidden' }}>
          <View style={{ flexDirection:'row', justifyContent:'space-between', paddingHorizontal:12, paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#1E1E1E' }}>
            <Text style={{ color:'#F6F6F6', fontWeight:'900', fontSize:18 }}>방 설정</Text>
            <TouchableOpacity onPress={onClose}><Text style={{ color:'#CFCFCF', fontSize:18 }}>닫기</Text></TouchableOpacity>
          </View>

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <ScrollView
              style={{ padding:12 }}
              contentContainerStyle={{ paddingBottom: 16 + Math.max(0, keyboardHeight) }}
              keyboardShouldPersistTaps="always"
            >
            <Text style={{ color:'#CFCFCF', fontWeight:'800' }}>TTL (일 : 시 : 분 : 초)</Text>
            <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
              <InputBox value={d} onChangeText={setD} ref={dayRef} maxLen={3} nextRef={hourRef} returnKeyType="next" />
              <Text style={{ color:'#555' }}>:</Text>
              <InputBox value={h} onChangeText={setH} ref={hourRef} maxLen={2} nextRef={minRef} prevRef={dayRef} returnKeyType="next" />
              <Text style={{ color:'#555' }}>:</Text>
              <InputBox value={m} onChangeText={setM} ref={minRef} maxLen={2} nextRef={secRef} prevRef={hourRef} returnKeyType="next" />
              <Text style={{ color:'#555' }}>:</Text>
              <InputBox value={s} onChangeText={setS} ref={secRef} maxLen={2} prevRef={minRef} returnKeyType="done" />
            </View>

            <Text style={{ color:'#CFCFCF', fontWeight:'800', marginTop:6 }}>Message TTL (시 : 분 : 초)</Text>
            <View style={{ flexDirection:'row', alignItems:'center', gap:10 }}>
              <InputBox value={mh} onChangeText={setMH} ref={msgHourRef} autoFocus={autoFocusArmed} maxLen={2} nextRef={msgMinRef} returnKeyType="next" />
              <Text style={{ color:'#555' }}>:</Text>
              <InputBox value={mm} onChangeText={setMM} ref={msgMinRef} maxLen={2} nextRef={msgSecRef} prevRef={msgHourRef} returnKeyType="next" />
              <Text style={{ color:'#555' }}>:</Text>
              <InputBox value={ms} onChangeText={setMS} ref={msgSecRef} maxLen={2} prevRef={msgMinRef} returnKeyType="done" />
              <TouchableOpacity onPress={onSaveMsgTTL} style={{ marginLeft:6, paddingHorizontal:12, paddingVertical:8, borderWidth:1, borderColor:'#FFD700', borderRadius:10 }}>
                <Text style={{ color:'#FFD700', fontWeight:'800' }}>저장</Text>
              </TouchableOpacity>
            </View>

            <Text style={{ color:'#CFCFCF', fontWeight:'800', marginTop:8 }}>TTL 잔여 시간</Text>
            <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
              <Text style={{ color:'#F6F6F6', fontSize:28, fontWeight:'900' }}>{formattedRemain}</Text>
              <View style={{ flexDirection:'row', gap:10 }}>
                <TouchableOpacity onPress={onReduce} style={{ paddingHorizontal:12, paddingVertical:8, borderWidth:1, borderColor:'#FFD700', borderRadius:8 }}><Text style={{ color:'#FFD700', fontWeight:'800' }}>수정</Text></TouchableOpacity>
                <TouchableOpacity
                  onPress={onExtend}
                  disabled={!canExtend}
                  style={{ paddingHorizontal:12, paddingVertical:8, borderWidth:1, borderColor: canExtend ? '#FFD700':'#555', borderRadius:8, opacity: canExtend ? 1 : 0.5 }}
                >
                  <Text style={{ color: canExtend ? '#FFD700':'#777', fontWeight:'800' }}>연장</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={{ color:'#CFCFCF', fontWeight:'800', marginTop:10 }}>TTL 보안 설정</Text>
            {[
              { key:'allowImageUpload', label:'이미지 등록 허용' },
              { key:'allowImageDownload', label:'이미지 다운 허용' },
              { key:'allowCapture', label:'대화방 캡처 허용' },
              { key:'allowExternalShare', label:'외부 공유 허용' },
            ].map((it) => (
              <View key={it.key} style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingVertical:6 }}>
                <Text style={{ color: canEditSecurity ? '#F6F6F6' : '#777', fontSize:18 }}>{it.label}</Text>
                <Switch
                  value={(sec as any)[it.key]}
                  onValueChange={(v)=> { if (!canEditSecurity) return; setSec(prev => ({ ...prev, [it.key]: v })); }}
                  disabled={!canEditSecurity}
                />
              </View>
            ))}

            <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginTop:8 }}>
              <TouchableOpacity onPress={async()=>{
                try {
                  // 방 TTL 저장 (입력란 기반)
                  const totalMs = toMs(d, h, m, s);
                  if (roomType === 'TTL' && totalMs > 0) {
                    await props.onSetRoomTTL(Date.now() + totalMs);
                  }
                  // 메시지 TTL 저장 (0이면 해제, 비어있을 때는 0으로 처리)
                  const msgMs = toMs('0', mh, mm, ms);
                  await props.onSetMessageTTL(msgMs);
                  if (canEditSecurity) {
                    await props.onSaveSecurity(sec);
                  }
                  Alert.alert('저장됨','TTL 설정을 저장했습니다.');
                  onClose();
                } catch {}
              }} style={{ paddingHorizontal:14, paddingVertical:10, borderWidth:1, borderColor:'#FFD700', borderRadius:10 }}>
                <Text style={{ color:'#FFD700', fontWeight:'800' }}>{canEditSecurity ? '저장' : '저장'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={async()=>{ try { if (props.onLeave) await props.onLeave(); else onClose(); } catch {} }} style={{ paddingHorizontal:14, paddingVertical:10, borderWidth:1, borderColor:'#A37D00', borderRadius:10 }}>
                <Text style={{ color:'#FFD700', fontWeight:'800' }}>나가기</Text>
              </TouchableOpacity>
            </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </View>
    </Modal>
  );
}

export default React.memo(TTLSettingsModal);
