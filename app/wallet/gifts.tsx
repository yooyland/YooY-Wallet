import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Modal, Platform, ScrollView, TextInput, TouchableOpacity, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import TransactionDetailModal from '@/components/TransactionDetailModal';
import TopBar from '@/components/top-bar';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useAuth } from '@/contexts/AuthContext';
import { createVoucher, buildClaimUri, endVoucher, deleteVoucher, parseClaimUri, getVoucher, claimVoucher, type ClaimVoucher } from '@/lib/claims';
import { collection, onSnapshot, orderBy, query, where, deleteDoc, doc as fsDoc } from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useWallet } from '@/contexts/WalletContext';
import { useTransaction } from '@/contexts/TransactionContext';

let QRCode: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  QRCode = require('react-native-qrcode-svg').default || require('react-native-qrcode-svg');
} catch {}

export default function GiftsPage() {
  const { language } = usePreferences();
  const { currentUser } = useAuth();
  const email = currentUser?.email || '';
  const { getWalletBySymbol } = (useWallet?.() as any) || {};
  const { addTransaction } = useTransaction();

  const [mode, setMode] = useState<'per_claim'|'total'>('per_claim');
  const [symbol, setSymbol] = useState('YOY');
  const [perClaimAmount, setPerClaimAmount] = useState<string>('');
  const [claimLimit, setClaimLimit] = useState<string>('5');
  const [totalAmount, setTotalAmount] = useState<string>('');
  const [totalPolicy, setTotalPolicy] = useState<'all'|'equal'>('all');
  const [totalPeople, setTotalPeople] = useState<string>('5');
  // 기본 만료일: 오늘 기준 1년 후 (YYYY-MM-DD)
  const defaultExpiry = (() => {
    try {
      const d = new Date();
      d.setFullYear(d.getFullYear() + 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    } catch { return ''; }
  })();
  const [expiresISO, setExpiresISO] = useState<string>(defaultExpiry);
  const [maxPerUser] = useState<number>(1);
  const [creating, setCreating] = useState(false);

  const [list, setList] = useState<ClaimVoucher[]>([]);

  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrVisible, setQrVisible] = useState(false);
  const [txDetail, setTxDetail] = useState<any|null>(null);
  const [txMemoDraft, setTxMemoDraft] = useState('');

  // Gift 수령 상태
  const [claimInput, setClaimInput] = useState<string>('');
  const [pending, setPending] = useState<ClaimVoucher | null>(null);
  // scanOpen, videoRef, rafRef는 상단에서 선언됨

  useEffect(() => {
    const ref = collection(firestore, 'claim_vouchers');
    const q = query(ref, where('createdByEmail', '==', email), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const items: ClaimVoucher[] = [];
      snap.forEach((doc) => items.push(doc.data() as ClaimVoucher));
      setList(items);
    });
    // notifications
    const nref = collection(firestore, 'claim_notifications');
    const nq = query(nref, where('createdByEmail', '==', email));
    const unsubN = onSnapshot(nq, async (snap) => {
      snap.docChanges().forEach(async (ch) => {
        try {
          const data: any = ch.doc.data();
          if (ch.type === 'added' && data?.amount && data?.address) {
            Alert.alert(language==='en'?'Gift claimed':'기프트 수령', `${data.amount} YOY / ${String(data.address).slice(0,8)}...`);
            try { await deleteDoc(fsDoc(firestore, 'claim_notifications', ch.doc.id)); } catch {}
          }
        } catch {}
      });
    });
    return () => { try { unsub(); } catch {}; try { unsubN(); } catch {}; };
  }, [email]);

  const canCreate = useMemo(() => {
    if (!email) return false;
    if (mode === 'per_claim') {
      const a = Number(perClaimAmount || 0);
      const c = Math.floor(Number(claimLimit || 0));
      return a > 0 && c > 0;
    }
    const t = Number(totalAmount || 0);
    if (mode === 'total') {
      if (totalPolicy === 'equal') {
        const ppl = Math.floor(Number(totalPeople || 0));
        return t > 0 && ppl > 0;
      }
      return t > 0;
    }
    return t > 0;
  }, [email, mode, perClaimAmount, claimLimit, totalAmount, totalPolicy, totalPeople]);

  const onCreate = async () => {
    if (!canCreate) {
      Alert.alert(language==='en'?'Enter valid values':'유효한 값을 입력하세요');
      return;
    }
    setCreating(true);
    try {
      const voucher = await createVoucher({
        createdByEmail: email,
        symbol,
        mode,
        perClaimAmount: mode==='per_claim' ? Number(perClaimAmount) : (totalPolicy==='equal' ? Number(totalAmount)/Math.max(1, Math.floor(Number(totalPeople || 1))) : undefined),
        claimLimit: mode==='per_claim' ? Math.floor(Number(claimLimit)) : (totalPolicy==='equal' ? Math.floor(Number(totalPeople || 0)) : undefined),
        totalAmount: mode==='total' ? Number(totalAmount) : undefined,
        totalPolicy: mode==='total' ? totalPolicy : undefined,
        maxPerUser,
        expiresAtISO: expiresISO || null,
      });
      const url = buildClaimUri(voucher.id);
      setQrUrl(url);
      setQrVisible(true);
      // 발행자 잔액 차감 (로컬 반영)
      try {
        const storageKey = `user_balances_${email}`;
        const saved = await AsyncStorage.getItem(storageKey);
        const parsed = saved ? JSON.parse(saved) : {};
        const totalDeduct = mode==='per_claim'
          ? (Number(perClaimAmount||0) * Math.floor(Number(claimLimit||0)))
          : Number(totalAmount||0);
        parsed[symbol] = Math.max(0, (parsed[symbol] || 0) - totalDeduct);
        await AsyncStorage.setItem(storageKey, JSON.stringify(parsed));
      } catch {}
      // 거래내역 기록(보낸 사람 - 예약 차감)
      try {
        const reserved = voucher.mode==='per_claim'
          ? Math.max(0, Number(voucher.perClaimAmount || 0)) * Math.max(1, Number(voucher.claimLimit || 0))
          : Math.max(0, Number(voucher.totalAmount || 0));
        await addTransaction({
          id: `tx_gift_${voucher.id}`,
          type: 'send',
          symbol: voucher.symbol || 'YOY',
          amount: reserved,
          to: `voucher:${voucher.id}`,
          from: 'me',
          description: 'Gift created',
          status: 'completed',
          success: true,
          hash: `voucher_create_${voucher.id}`,
          blockTimestamp: new Date().toISOString(),
        } as any);
      } catch {}
      try {
        setList((prev) => {
          const exists = prev.some((v) => v.id === voucher.id);
          if (exists) return prev;
          return [voucher as any, ...prev];
        });
      } catch {}
      Alert.alert(
        language==='en'?'Gift created':'기프트 생성됨',
        mode==='per_claim'
          ? (language==='en'
            ? `Per-claim ${perClaimAmount} ${symbol}, up to ${claimLimit} people`
            : `1인당 ${perClaimAmount} ${symbol}, 최대 ${claimLimit}명`)
          : (language==='en'
            ? `Total ${totalAmount} ${symbol} (${totalPolicy === 'all' ? 'All' : `Equal / ${totalPeople} people`})`
            : `총 ${totalAmount} ${symbol} (${totalPolicy === 'all' ? '전액' : `균등 / ${totalPeople}명`})`)
      );
    } catch (e) {
      Alert.alert(
        language==='en'?'Creation failed':'생성 실패',
        language==='en'
          ? 'Failed to create an event on the server. Please try again.'
          : '서버에 이벤트를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.'
      );
    } finally {
      setCreating(false);
    }
  };

  // --- Gift 수령 로직 ---
  const loadVoucherFromData = async (raw: string) => {
    try {
      const parsed = parseClaimUri(raw);
      if (!parsed?.id) {
        Alert.alert(language==='en'?'Invalid link':'유효하지 않은 링크');
        return;
      }
      const v = await getVoucher(parsed.id);
      if (!v) {
        Alert.alert(language==='en'?'Not found':'바우처를 찾을 수 없습니다.');
        return;
      }
      setPending(v as any);
      if (v.status !== 'active') {
        const msg = v.status === 'expired' ? (language==='en'?'Expired':'만료됨')
          : v.status === 'exhausted' ? (language==='en'?'Exhausted':'소진됨')
          : (language==='en'?'Cancelled':'종료됨');
        Alert.alert(language==='en'?'Not claimable':'수령 불가', msg);
      } else {
        Alert.alert(language==='en'?'Claim available':'수령 가능', (language==='en'?'Press Claim to receive.':'아래 받기 버튼을 눌러 수령하세요.'));
      }
    } catch (e) {
      Alert.alert(language==='en'?'Error':'오류', String(e instanceof Error ? e.message : e));
    }
  };

  const handlePasteClaim = async () => {
    try {
      let text: string | null = null;
      try { const Clipboard = require('expo-clipboard'); text = await Clipboard.getStringAsync(); } catch {}
      if (!text) { try { text = await (navigator as any)?.clipboard?.readText?.(); } catch {} }
      if (text) {
        setClaimInput(text);
        await loadVoucherFromData(text);
      }
    } catch {}
  };

  const scanImageForClaim = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] as any, quality: 1, base64: true, selectionLimit: 1 } as any);
      if (res.canceled || !res.assets?.length) return;
      const asset: any = res.assets[0];
      if (Platform.OS === 'web') {
        const BarcodeDetectorAny: any = (window as any).BarcodeDetector;
        if (!BarcodeDetectorAny) {
          Alert.alert(language==='en'?'Not supported':'지원되지 않음', language==='en'?'This browser does not support image QR detection. Please paste the link instead.':'브라우저가 이미지 QR 인식을 지원하지 않습니다. 링크를 붙여넣어 주세요.');
          return;
        }
        const detector = new BarcodeDetectorAny({ formats: ['qr_code'] });
        const img = document.createElement('img');
        img.crossOrigin = 'anonymous';
        img.onload = async () => {
          try {
            const res2 = await detector.detect(img);
            const val = Array.isArray(res2) && res2[0]?.rawValue;
            if (val) {
              setClaimInput(val);
              await loadVoucherFromData(val);
            } else {
              Alert.alert(language==='en'?'Scan failed':'스캔 실패', language==='en'?'Could not detect a QR code in the image.':'이미지에서 QR을 찾을 수 없습니다.');
            }
          } catch (e) {
            Alert.alert(language==='en'?'Scan error':'스캔 오류', String(e instanceof Error ? e.message : e));
          }
        };
        img.onerror = () => {
          Alert.alert(language==='en'?'Load error':'로딩 오류', language==='en'?'Failed to load image.':'이미지를 불러올 수 없습니다.');
        };
        img.src = asset.base64 ? `data:${asset.type || 'image/png'};base64,${asset.base64}` : (asset.uri || '');
      } else {
        Alert.alert(language==='en'?'Tip':'안내', language==='en'?'On native, please paste the link for now.':'네이티브에서는 우선 링크 붙여넣기를 이용해 주세요.');
      }
    } catch (e) {
      Alert.alert(language==='en'?'Scan error':'스캔 오류', String(e instanceof Error ? e.message : e));
    }
  };

  const [scanOpen, setScanOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startCameraScan = async () => {
    try {
    if (Platform.OS !== 'web') {
        // Native: Expo Camera
        try {
          const ExpoCamera = require('expo-camera');
          const CameraView = ExpoCamera.CameraView;
          const perm = await ExpoCamera.Camera.requestCameraPermissionsAsync?.();
          if (perm?.status !== 'granted') {
            Alert.alert(language==='en'?'Camera permission required':'카메라 권한 필요');
            return;
          }
          setScanOpen(true);
          // 실제 렌더는 아래 Modal에서 CameraView로 처리
          return;
        } catch {
          Alert.alert(language==='en'?'Scanner unavailable':'스캐너를 사용할 수 없습니다');
      return;
    }
      }
      const BarcodeDetectorAny: any = (window as any).BarcodeDetector;
      if (!BarcodeDetectorAny) {
        Alert.alert(language==='en'?'Not supported':'지원되지 않음', language==='en'?'This browser does not support camera QR detection.':'브라우저가 카메라 QR 인식을 지원하지 않습니다.');
        return;
      }
      setScanOpen(true);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        (videoRef.current as any).srcObject = stream as any;
        await (videoRef.current as any).play();
      }
      const detector = new BarcodeDetectorAny({ formats: ['qr_code'] });
      const loop = async () => {
        try {
          if (!videoRef.current) return;
          const detections = await detector.detect(videoRef.current);
          const val = Array.isArray(detections) && detections[0]?.rawValue;
          if (val) {
            setScanOpen(false);
            try { (stream as any).getTracks?.().forEach((t:any)=>t.stop?.()); } catch {}
            setClaimInput(val);
            await loadVoucherFromData(val);
            return;
          }
        } catch {}
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch (e) {
      setScanOpen(false);
      Alert.alert(language==='en'?'Camera error':'카메라 오류', String(e instanceof Error ? e.message : e));
    }
  };

  const stopCamera = () => {
    setScanOpen(false);
    try {
      const v = videoRef.current;
      const stream: any = (v as any)?.srcObject;
      if (v) (v as any).srcObject = null as any;
      if (stream) stream.getTracks?.().forEach((t:any)=>t.stop?.());
    } catch {}
    try { if (rafRef.current) cancelAnimationFrame(rafRef.current); } catch {}
  };

  const onClaim = async () => {
    try {
      if (!pending) return;
      const sym = pending.symbol || 'YOY';
      const addr = getWalletBySymbol?.(sym)?.address || '';
      if (!addr) {
        Alert.alert(language==='en'?'No wallet address':'지갑 주소 없음', language==='en'?'Create wallet first.':'먼저 해당 코인 지갑을 생성하세요.');
        return;
      }
      const res = await claimVoucher({ id: pending.id, recipientAddress: addr, recipientEmail: email });
      if ('error' in res) {
        const code = String(res.error || '');
        if (code.includes('expired') || code.includes('cancelled') || code.includes('not_active')) {
          Alert.alert(language==='en'?'Event ended':'이벤트가 종료 되었습니다.');
        } else if (code.includes('exhausted')) {
          Alert.alert(language==='en'?'Event exhausted':'이벤트가 모두 소진 되었습니다.');
        } else {
          Alert.alert(language==='en'?'Claim failed':'수령 실패', code);
        }
        return;
      }
      // 수령 성공: 수신자 잔액 증가
      try {
        const storageKey = `user_balances_${email}`;
        const saved = await AsyncStorage.getItem(storageKey);
        const parsed = saved ? JSON.parse(saved) : {};
        parsed[sym] = (parsed[sym] || 0) + (res.amount || 0);
        await AsyncStorage.setItem(storageKey, JSON.stringify(parsed));
      } catch {}
      // 거래내역 기록(받은 사람 증가) + 상세 팝업
      try {
        const tx = {
          id: `tx_gift_recv_${pending.id}`,
          type: 'receive',
          symbol: sym,
          currency: sym,
          amount: res.amount || 0,
          to: addr,
          from: `voucher:${pending.id}`,
          description: 'Event receive',
          status: 'completed',
          success: true,
          hash: `voucher_claim_${pending.id}`,
          blockTimestamp: new Date().toISOString(),
          timestamp: new Date().toISOString(),
          network: sym === 'YOY' ? 'yoy' : undefined,
        } as any;
        await addTransaction(tx);
        setTxDetail(tx);
      } catch {}
      const successMsg = language==='en'
        ? `Congratulations! You received ${res.amount} ${sym}.`
        : `축하합니다! ${res.amount} ${sym}를 수령하였습니다.`;
      Alert.alert(successMsg);
      setPending(null);
    } catch (e) {
      Alert.alert(language==='en'?'Error':'오류', String(e instanceof Error ? e.message : e));
    }
  };

  return (
    <ThemedView style={{ flex: 1 }}>
      <TransactionDetailModal visible={!!txDetail} tx={txDetail} onClose={()=>setTxDetail(null)} memoDraft={txMemoDraft} setMemoDraft={setTxMemoDraft} />
      <TopBar title={language==='en'?'Gift Manager':'기프트 관리'} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        {/* 수령 섹션 */}
        <View style={{ gap: 10, padding: 12, borderWidth: 1, borderColor: '#1F2C31', borderRadius: 12, backgroundColor: '#0F171B' }}>
          <ThemedText style={{ fontSize: 16, color: '#EDEDED' }}>{language==='en'?'Event gift':'기프트 수령'}</ThemedText>
          <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
            <TextInput value={claimInput} onChangeText={setClaimInput} placeholder={language==='en'?'Paste event link (yooy://claim) here':'이벤트 링크(yooy://claim)를 붙여넣으세요'} placeholderTextColor="#666" style={{ flex:1, color:'#EDEDED', borderWidth:1, borderColor:'#2B3A3F', borderRadius:8, paddingHorizontal:12, paddingVertical:8 }} />
            <TouchableOpacity onPress={handlePasteClaim} style={{ paddingVertical:8, paddingHorizontal:12, borderWidth:1, borderColor:'#2B3A3F', borderRadius:8 }}>
              <ThemedText style={{ color:'#EDEDED' }}>{language==='en'?'Paste':'붙여넣기'}</ThemedText>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection:'row', gap:8 }}>
            <TouchableOpacity onPress={scanImageForClaim} style={{ paddingVertical:8, paddingHorizontal:12, borderWidth:1, borderColor:'#2B3A3F', borderRadius:8 }}>
              <ThemedText style={{ color:'#EDEDED' }}>{language==='en'?'Image':'이미지'}</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity onPress={startCameraScan} style={{ paddingVertical:8, paddingHorizontal:12, borderWidth:1, borderColor:'#2B3A3F', borderRadius:8 }}>
              <ThemedText style={{ color:'#EDEDED' }}>{language==='en'?'Scan':'스캔'}</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity onPress={async()=>{ if (claimInput) await loadVoucherFromData(claimInput); }} style={{ paddingVertical:8, paddingHorizontal:12, borderWidth:1, borderColor:'#2B3A3F', borderRadius:8 }}>
              <ThemedText style={{ color:'#EDEDED' }}>{language==='en'?'Check':'확인'}</ThemedText>
            </TouchableOpacity>
            {!!pending && pending.status === 'active' && (
              <TouchableOpacity onPress={onClaim} style={{ paddingVertical:8, paddingHorizontal:12, borderWidth:1, borderColor:'#FFD700', borderRadius:8, backgroundColor:'#FFD700' }}>
                <ThemedText style={{ color:'#000' }}>{language==='en'?'Claim':'받기'}</ThemedText>
              </TouchableOpacity>
            )}
          </View>
          {!!pending && (
            <View style={{ marginTop:6 }}>
              <ThemedText style={{ color:'#9AB' }}>
                {pending.symbol} • {pending.mode==='per_claim' ? (language==='en'?'Per-claim':'1인당') : (language==='en'?'Total':'총액')} • {
                  pending.status==='active' ? (language==='en'?'Active':'진행중') :
                  pending.status==='exhausted' ? (language==='en'?'Exhausted':'소진') :
                  pending.status==='expired' ? (language==='en'?'Expired':'만료') :
                  (language==='en'?'Cancelled':'종료')
                }
              </ThemedText>
            </View>
          )}
        </View>
        <View style={{ gap: 10, padding: 12, borderWidth: 1, borderColor: '#1F2C31', borderRadius: 12, backgroundColor: '#0F171B' }}>
          <ThemedText style={{ fontSize: 16, color: '#EDEDED' }}>{language==='en'?'Create gift':'기프트 생성'}</ThemedText>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={()=>setMode('per_claim')} style={{ paddingVertical: 8, paddingHorizontal:12, borderWidth:1, borderColor: mode==='per_claim' ? '#FFD700' : '#2B3A3F', borderRadius: 8 }}>
              <ThemedText style={{ color: mode==='per_claim' ? '#FFD700' : '#CFCFCF' }}>{language==='en'?'Per-claim':'1인당 고정'}</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity onPress={()=>setMode('total')} style={{ paddingVertical: 8, paddingHorizontal:12, borderWidth:1, borderColor: mode==='total' ? '#FFD700' : '#2B3A3F', borderRadius: 8 }}>
              <ThemedText style={{ color: mode==='total' ? '#FFD700' : '#CFCFCF' }}>{language==='en'?'Total':'총액'}</ThemedText>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
            <ThemedText style={{ color:'#CFCFCF', width:72 }}>{language==='en'?'Coin':'코인'}</ThemedText>
            <TouchableOpacity style={{ paddingVertical:8, paddingHorizontal:12, borderWidth:1, borderColor:'#2B3A3F', borderRadius:8 }} onPress={()=>setSymbol('YOY')}>
              <ThemedText style={{ color:'#EDEDED' }}>{symbol}</ThemedText>
            </TouchableOpacity>
          </View>
          {mode==='per_claim' ? (
            <>
              <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                <ThemedText style={{ color:'#CFCFCF', width:72 }}>{language==='en'?'Amount':'수량'}</ThemedText>
                <TextInput value={perClaimAmount} onChangeText={setPerClaimAmount} keyboardType="numeric" placeholder="10" placeholderTextColor="#666" style={{ flex:1, color:'#EDEDED', borderWidth:1, borderColor:'#2B3A3F', borderRadius:8, paddingHorizontal:12, paddingVertical:8 }} />
              </View>
              <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                <ThemedText style={{ color:'#CFCFCF', width:72 }}>{language==='en'?'People':'인원'}</ThemedText>
                <TextInput value={claimLimit} onChangeText={setClaimLimit} keyboardType="numeric" placeholder="5" placeholderTextColor="#666" style={{ flex:1, color:'#EDEDED', borderWidth:1, borderColor:'#2B3A3F', borderRadius:8, paddingHorizontal:12, paddingVertical:8 }} />
              </View>
            </>
          ) : (
            <>
              <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                <ThemedText style={{ color:'#CFCFCF', width:72 }}>{language==='en'?'Total':'총액'}</ThemedText>
                <TextInput value={totalAmount} onChangeText={setTotalAmount} keyboardType="numeric" placeholder="100" placeholderTextColor="#666" style={{ flex:1, color:'#EDEDED', borderWidth:1, borderColor:'#2B3A3F', borderRadius:8, paddingHorizontal:12, paddingVertical:8 }} />
              </View>
              <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                <ThemedText style={{ color:'#CFCFCF', width:72 }}>{language==='en'?'Policy':'정책'}</ThemedText>
                <TouchableOpacity onPress={()=>setTotalPolicy('all')} style={{ paddingVertical:8, paddingHorizontal:12, borderWidth:1, borderColor: totalPolicy==='all' ? '#FFD700' : '#2B3A3F', borderRadius:8 }}>
                  <ThemedText style={{ color: totalPolicy==='all' ? '#FFD700' : '#CFCFCF' }}>{language==='en'?'All at once':'전액'}</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity onPress={()=>setTotalPolicy('equal')} style={{ paddingVertical:8, paddingHorizontal:12, borderWidth:1, borderColor: totalPolicy==='equal' ? '#FFD700' : '#2B3A3F', borderRadius:8 }}>
                  <ThemedText style={{ color: totalPolicy==='equal' ? '#FFD700' : '#CFCFCF' }}>{language==='en'?'Equal':'균등'}</ThemedText>
                </TouchableOpacity>
              </View>
              {totalPolicy==='equal' && (
                <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                  <ThemedText style={{ color:'#CFCFCF', width:72 }}>{language==='en'?'People':'인원'}</ThemedText>
                  <TextInput value={totalPeople} onChangeText={setTotalPeople} keyboardType="numeric" placeholder="5" placeholderTextColor="#666" style={{ flex:1, color:'#EDEDED', borderWidth:1, borderColor:'#2B3A3F', borderRadius:8, paddingHorizontal:12, paddingVertical:8 }} />
                  <ThemedText style={{ color:'#9AB' }}>
                    {(() => {
                      const tot = Number(totalAmount || 0);
                      const ppl = Math.max(1, Math.floor(Number(totalPeople || 1)));
                      return ppl ? `${(tot/ppl || 0).toFixed(6)} YOY / 1인` : '';
                    })()}
                  </ThemedText>
                </View>
              )}
            </>
          )}
          <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
            <ThemedText style={{ color:'#CFCFCF', width:72 }}>{language==='en'?'Expires':'만료일'}</ThemedText>
            <TextInput value={expiresISO} onChangeText={setExpiresISO} placeholder="YYYY-MM-DD (optional)" placeholderTextColor="#666" style={{ flex:1, color:'#EDEDED', borderWidth:1, borderColor:'#2B3A3F', borderRadius:8, paddingHorizontal:12, paddingVertical:8 }} />
          </View>
          <TouchableOpacity disabled={!canCreate || creating} onPress={onCreate} style={{ alignSelf:'flex-end', backgroundColor: canCreate ? '#FFD700' : '#3A3A3A', paddingHorizontal:16, paddingVertical:10, borderRadius:10 }}>
            <ThemedText style={{ color: canCreate ? '#000' : '#999' }}>{creating ? (language==='en'?'Creating...':'생성 중...') : (language==='en'?'Create':'생성')}</ThemedText>
          </TouchableOpacity>
          <ThemedText style={{ color:'#888', fontSize:12 }}>
            {language==='en'
              ? 'You can end an event only at 0% progress or after 80% progress.'
              : '진행 0% 또는 80% 이상일 때만 이벤트를 종료할 수 있습니다.'}
          </ThemedText>
        </View>

        <View style={{ gap: 10, padding: 12, borderWidth: 1, borderColor: '#1F2C31', borderRadius: 12, backgroundColor: '#0F171B' }}>
          <ThemedText style={{ fontSize: 16, color: '#EDEDED' }}>{language==='en'?'My gifts':'내 기프트'}</ThemedText>
          {list.map(v => {
            const url = buildClaimUri(v.id);
            const progress = v.mode==='per_claim'
              ? `${v.claimedCount}/${v.claimLimit}`
              : `${v.claimedTotal}/${v.totalAmount}`;
            const statusText =
              v.status === 'active' ? (language==='en'?'Active':'진행중') :
              v.status === 'exhausted' ? (language==='en'?'Exhausted':'소진') :
              v.status === 'expired' ? (language==='en'?'Expired':'만료') :
              (language==='en'?'Cancelled':'취소됨');
            // 종료 가능 여부 계산
            const ratio = v.mode==='per_claim'
              ? ((v.claimedCount || 0) / Math.max(1, Number(v.claimLimit || 1)))
              : ((v.claimedTotal || 0) / Math.max(1, Number(v.totalAmount || 1)));
            const canEndNow = v.status === 'active' && ((v.claimedCount || 0) === 0 || ratio >= 0.8);
            return (
              <View key={v.id} style={{ padding:12, borderWidth:1, borderColor:'#2B3A3F', borderRadius:8, gap:8 }}>
                <ThemedText style={{ color:'#EDEDED' }}>{v.symbol} • {v.mode==='per_claim' ? (language==='en'?'Per-claim':'1인당') : (language==='en'?'Total':'총액')}{v.mode==='total' && v.totalPolicy ? ` • ${v.totalPolicy==='all' ? (language==='en'?'All':'전액') : (language==='en'?'Equal':'균등')}` : ''} • {statusText}</ThemedText>
                <ThemedText style={{ color:'#CFCFCF' }}>
                  {v.mode==='per_claim'
                    ? `${language==='en'?'Amount':'수량'}: ${v.perClaimAmount} • ${language==='en'?'People':'인원'}: ${v.claimLimit}`
                    : `${language==='en'?'Total':'총액'}: ${v.totalAmount} • ${language==='en'?'Remaining':'남은량'}: ${v.remainingAmount ?? 0}` + (v.totalPolicy==='equal' ? ` • ${language==='en'?'Per':'1인당'}: ${v.perClaimAmount}` : '')}
                </ThemedText>
                {!!v.expiresAt && (
                  <ThemedText style={{ color:'#9AB' }}>
                    {language==='en'?'Expires':'만료'}: {new Date(v.expiresAt.toMillis()).toISOString().slice(0,10)}
                  </ThemedText>
                )}
                {/* 항상 보이는 QR 미리보기 + 링크 */}
                <View style={{ flexDirection:'row', alignItems:'center', gap:12, marginTop:4 }}>
                  <View style={{ width:96, height:96, borderRadius:8, overflow:'hidden', backgroundColor:'#fff', alignItems:'center', justifyContent:'center', borderWidth:2, borderColor:'#D32F2F' }}>
                    {(() => {
                      const img = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&ecc=H&margin=16&color=000000&bgcolor=ffffff&data=${encodeURIComponent(url)}`;
                      return <Image source={{ uri: img }} style={{ width:96, height:96 }} />;
                    })()}
                  </View>
                  <View style={{ flex:1, gap:6 }}>
                    <ThemedText style={{ color:'#9AB' }} numberOfLines={2} ellipsizeMode="middle">{url}</ThemedText>
                    <View style={{ flexDirection:'row', gap:8 }}>
                      <TouchableOpacity onPress={async()=>{ try { await (navigator as any)?.clipboard?.writeText?.(url); Alert.alert(language==='en'?'Copied':'복사됨'); } catch {} }} style={{ paddingVertical:8, paddingHorizontal:12, borderWidth:1, borderColor:'#2B3A3F', borderRadius:8 }}>
                        <ThemedText style={{ color:'#EDEDED' }}>{language==='en'?'Copy link':'링크 복사'}</ThemedText>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={()=>{ setQrUrl(url); setQrVisible(true); }} style={{ paddingVertical:8, paddingHorizontal:12, borderWidth:1, borderColor:'#2B3A3F', borderRadius:8 }}>
                        <ThemedText style={{ color:'#EDEDED' }}>{language==='en'?'Open QR':'QR 크게'}</ThemedText>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
                <ThemedText style={{ color:'#9AB' }}>{language==='en'?'Progress':'진행도'}: {progress}</ThemedText>
                <View style={{ flexDirection:'row', gap:8, flexWrap:'wrap' }}>
                  <TouchableOpacity onPress={()=>{ setQrUrl(url); setQrVisible(true); }} style={{ paddingVertical:8, paddingHorizontal:12, borderWidth:1, borderColor:'#2B3A3F', borderRadius:8 }}>
                    <ThemedText style={{ color:'#EDEDED' }}>{language==='en'?'Share QR':'QR 공유'}</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={async()=>{ try { await (navigator as any)?.clipboard?.writeText?.(url); Alert.alert(language==='en'?'Copied':'복사됨'); } catch {} }} style={{ paddingVertical:8, paddingHorizontal:12, borderWidth:1, borderColor:'#2B3A3F', borderRadius:8 }}>
                    <ThemedText style={{ color:'#EDEDED' }}>{language==='en'?'Copy link':'링크 복사'}</ThemedText>
                  </TouchableOpacity>
                  {canEndNow && (
                    <TouchableOpacity
                      onPress={async()=>{
                        try {
                          const ok = await new Promise<boolean>((resolve)=>{
                            Alert.alert(
                              language==='en'?'End event?':'이벤트 종료',
                              language==='en'?'You can end only at 0% or after 80% progress.':'0% 또는 80% 이상 진행 시에만 종료할 수 있습니다.',
                              [
                                { text: language==='en'?'Cancel':'취소', style:'cancel', onPress:()=>resolve(false) },
                                { text: language==='en'?'End':'종료', style:'destructive', onPress:()=>resolve(true) },
                              ]
                            );
                          });
                          if (!ok) return;
                          // 로컬 미리보기 바우처는 로컬에서만 종료 처리
                          // 프로덕션에서는 'local_' 미리보기 바우처를 허용하지 않음
                          if (process.env.EXPO_PUBLIC_ENV !== 'production' && /^local_/i.test(v.id)) {
                            setList(prev => prev.map(it => it.id===v.id ? ({ ...it, status: 'cancelled' } as any) : it));
                            Alert.alert(language==='en'?'Ended (local)':'종료됨(로컬)');
                            return;
                          }
                          const res = await endVoucher({ id: v.id, requestedByEmail: email || v.createdByEmail || '' });
                          if ((res as any)?.ok) {
                            try {
                              setList(prev => prev.map(it => it.id===v.id ? ({ ...it, status: 'cancelled' } as any) : it));
                            } catch {}
                            Alert.alert(language==='en'?'Ended':'종료됨');
                          } else {
                            // 권한/미존재 등 서버 실패 시, 개발환경에서는 로컬 종료 허용
                            setList(prev => prev.map(it => it.id===v.id ? ({ ...it, status: 'cancelled' } as any) : it));
                            Alert.alert(language==='en'?'Ended (local)':'종료됨(로컬)');
                          }
                        } catch (e:any) {
                          Alert.alert(language==='en'?'Error':'오류', String(e?.message || e));
                        }
                      }}
                      style={{ paddingVertical:8, paddingHorizontal:12, borderWidth:1, borderColor:'#D32F2F', borderRadius:8 }}
                    >
                      <ThemedText style={{ color:'#D32F2F' }}>{language==='en'?'End':'종료'}</ThemedText>
                    </TouchableOpacity>
                  )}
                  {v.status === 'cancelled' && (
                    <TouchableOpacity
                      onPress={async()=>{
                        try {
                          const ok = await new Promise<boolean>((resolve)=>{
                            Alert.alert(
                              language==='en'?'Delete event?':'이벤트 삭제',
                              language==='en'?'This will permanently remove the event.':'이 이벤트를 영구 삭제합니다.',
                              [
                                { text: language==='en'?'Cancel':'취소', style:'cancel', onPress:()=>resolve(false) },
                                { text: language==='en'?'Delete':'삭제', style:'destructive', onPress:()=>resolve(true) },
                              ]
                            );
                          });
                          if (!ok) return;
                          const res = await deleteVoucher({ id: v.id, requestedByEmail: email });
                          if ((res as any)?.ok) {
                            setList(prev => prev.filter(it => it.id !== v.id));
                            Alert.alert(language==='en'?'Deleted':'삭제됨');
                          } else {
                            Alert.alert(language==='en'?'Delete failed':'삭제 실패', String((res as any)?.error || 'fail'));
                          }
                        } catch (e:any) {
                          Alert.alert(language==='en'?'Error':'오류', String(e?.message || e));
                        }
                      }}
                      style={{ paddingVertical:8, paddingHorizontal:12, borderWidth:1, borderColor:'#8B0000', borderRadius:8 }}
                    >
                      <ThemedText style={{ color:'#FF6B6B' }}>{language==='en'?'Delete':'삭제'}</ThemedText>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* 카메라 스캔 모달 (웹 전용) */}
      {(
        <Modal visible={scanOpen} transparent animationType="fade" onRequestClose={stopCamera}>
          <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.7)', alignItems:'center', justifyContent:'center', padding:16 }}>
            <View style={{ width:'90%', maxWidth:420, backgroundColor:'#0F171B', borderRadius:16, borderWidth:1, borderColor:'#1F2C31', padding:16, alignItems:'center' }}>
              <ThemedText style={{ color:'#EDEDED', fontSize:16, marginBottom:12 }}>{language==='en'?'Scan Gift QR':'기프트 QR 스캔'}</ThemedText>
              {Platform.OS === 'web' ? (
              <View style={{ width:300, height:300, backgroundColor:'#000', borderRadius:12, overflow:'hidden', alignItems:'center', justifyContent:'center' }}>
                <video ref={videoRef as any} style={{ width: '100%', height: '100%', objectFit:'cover' }} />
              </View>
              ) : (
                (() => {
                  try {
                    const ExpoCamera = require('expo-camera');
                    const CameraView = ExpoCamera.CameraView;
                    return (
                      <CameraView
                        style={{ width:300, height:300, borderRadius:12, overflow:'hidden' }}
                        facing="back"
                        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                        onBarcodeScanned={async ({ data }: any) => {
                          const raw = String(data || '');
                          if (!raw) return;
                          setScanOpen(false);
                          await loadVoucherFromData(raw);
                        }}
                      />
                    );
                  } catch { return null; }
                })()
              )}
              <TouchableOpacity style={{ marginTop:12, paddingVertical:10, paddingHorizontal:16, backgroundColor:'#FFD700', borderRadius:8 }} onPress={stopCamera}>
                <ThemedText style={{ color:'#000' }}>{language==='en'?'Close':'닫기'}</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      <Modal visible={!!qrUrl && qrVisible} transparent animationType="fade" onRequestClose={()=>setQrVisible(false)}>
        <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.7)', alignItems:'center', justifyContent:'center', padding:16 }}>
          <View style={{ width:'90%', maxWidth:420, backgroundColor:'#0F171B', borderRadius:16, borderWidth:1, borderColor:'#1F2C31', padding:16, alignItems:'center' }}>
            <ThemedText style={{ color:'#EDEDED', fontSize:16, marginBottom:12 }}>{language==='en'?'Share QR':'QR 공유'}</ThemedText>
            <ThemedText style={{ color:'#9AB', fontSize:12, marginBottom:8 }}>
              {language==='en'
                ? 'Share this QR to let others claim your event.'
                : '이 QR을 공유하면 다른 사용자가 이벤트를 수령할 수 있어요.'}
            </ThemedText>
            <View style={{ width:240, height:240, borderRadius:12, overflow:'hidden', backgroundColor:'#fff', alignItems:'center', justifyContent:'center' }}>
              {(() => {
                const data = qrUrl || '';
                if (Platform.OS !== 'web' && QRCode) {
                  const Comp = QRCode as any;
                  return <Comp value={data} size={220} />;
                }
                const url = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(data)}`;
                return <Image source={{ uri: url }} style={{ width:240, height:240 }} />;
              })()}
            </View>
            <View style={{ marginTop:12, width:'100%', gap:8 }}>
              <TouchableOpacity style={{ width:'100%', alignItems:'center', justifyContent:'center', paddingVertical:10, backgroundColor:'#243034', borderRadius:8, borderWidth:1, borderColor:'#375A64' }} onPress={async()=>{
                try { if (qrUrl) await (navigator as any)?.clipboard?.writeText?.(qrUrl); Alert.alert(language==='en'?'Copied':'복사됨'); } catch {}
              }}>
                <ThemedText style={{ color:'#EDEDED' }}>{language==='en'?'Copy link':'링크 복사'}</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={{ width:'100%', alignItems:'center', justifyContent:'center', paddingVertical:10, backgroundColor:'#FFD700', borderRadius:8 }} onPress={()=> setQrVisible(false)}>
                <ThemedText style={{ color:'#000' }}>{language==='en'?'Close':'닫기'}</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}


