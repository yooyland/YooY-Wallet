import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { router } from 'expo-router';
import { firebaseAuth } from '@/lib/firebase';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { usePreferences } from '@/contexts/PreferencesContext';
import { chatTr } from '../core/chatI18n';

type Tab = 'card' | 'scan';

function buildCardPayload(input: { uid: string; name: string; phone: string; email: string; company: string; title: string; memo: string }) {
  const safe = (v: string) => String(v || '').trim();
  // 구버전 흐름을 흉내내는 “명함 정보 문자열” (엔진/딥링크는 다음 단계에서 연결)
  const rows = [
    `UID: ${safe(input.uid)}`,
    safe(input.name) ? `이름: ${safe(input.name)}` : '',
    safe(input.phone) ? `전화: ${safe(input.phone)}` : '',
    safe(input.email) ? `이메일: ${safe(input.email)}` : '',
    safe(input.company) ? `회사: ${safe(input.company)}` : '',
    safe(input.title) ? `직함: ${safe(input.title)}` : '',
    safe(input.memo) ? `메모: ${safe(input.memo)}` : '',
  ].filter(Boolean);
  return rows.join('\n');
}

export default function ChatQrMain() {
  const uid = String(firebaseAuth.currentUser?.uid || '');
  const [tab, setTab] = useState<Tab>('card');
  const { language } = usePreferences();
  const t = useMemo(() => (ko: string, en: string, ja?: string, zh?: string) => chatTr(language as any, ko, en, ja, zh), [language]);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [memo, setMemo] = useState('');
  const [qrValue, setQrValue] = useState('');

  const payload = useMemo(
    () =>
      buildCardPayload({
        uid,
        name,
        phone,
        email,
        company,
        title: jobTitle,
        memo,
      }),
    [uid, name, phone, email, company, jobTitle, memo]
  );

  const generateQr = () => {
    const value = String(payload || '').trim();
    if (!value) {
      Alert.alert(t('명함', 'Business card', '名刺', '名片'), t('QR로 만들 정보가 없습니다.', 'There is no data to generate QR.', 'QRを生成する情報がありません。', '没有可生成二维码的数据。'));
      return;
    }
    setQrValue(value);
  };

  const resetCard = () => {
    setName('');
    setPhone('');
    setEmail('');
    setCompany('');
    setJobTitle('');
    setMemo('');
    setQrValue('');
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0C0C0C' }}>
      {/* 구버전 느낌: 상단 탭 (명함 만들기 / QR코드 읽기) */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => { try { router.back(); } catch {} }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.back}>←</Text>
        </TouchableOpacity>
        <View style={styles.tabs}>
          <TouchableOpacity onPress={() => setTab('card')} activeOpacity={0.85} style={[styles.tab, tab === 'card' && styles.tabOn]}>
            <Text style={[styles.tabText, tab === 'card' && styles.tabTextOn]}>{t('명함 만들기', 'Create card', '名刺作成', '制作名片')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setTab('scan')} activeOpacity={0.85} style={[styles.tab, tab === 'scan' && styles.tabOn]}>
            <Text style={[styles.tabText, tab === 'scan' && styles.tabTextOn]}>{t('QR코드 읽기', 'Scan QR code', 'QRコード読み取り', '读取二维码')}</Text>
          </TouchableOpacity>
        </View>
        <View style={{ width: 28 }} />
      </View>

      {tab === 'card' ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 14, paddingBottom: 28 }}>
          <Text style={styles.h1}>{t('내 명함', 'My card', 'マイ名刺', '我的名片')}</Text>
          <Text style={styles.sub}>{t('아래 정보를 입력하면 명함 QR을 만들 수 있습니다.', 'Enter your info to create a card QR.', '下記情報を入力すると名刺QRを作成できます。', '输入以下信息即可生成名片二维码。')}</Text>

          {/* 구버전 느낌: QR 카드 미리보기(큰 박스) */}
          <View style={styles.qrCard}>
            <View style={styles.qrSquare}>
              {qrValue ? (
                <QRCode value={qrValue} size={82} />
              ) : (
                <Text style={{ color: '#777', fontWeight: '900' }}>QR</Text>
              )}
            </View>
            <View style={{ flex: 1, minWidth: 0, paddingLeft: 12 }}>
              <Text style={{ color: '#FFD700', fontWeight: '900' }} numberOfLines={1}>
                {String(name || t('이름', 'Name', '名前', '姓名'))}
              </Text>
              <Text style={{ color: '#AAA', marginTop: 4, fontSize: 12 }} numberOfLines={2}>
                {payload || t('입력한 정보가 여기에 표시됩니다.', 'Entered information appears here.', '入力した情報がここに表示されます。', '输入的信息会显示在这里。')}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <TouchableOpacity activeOpacity={0.85} style={[styles.smallBtn, styles.btnGray]} onPress={resetCard}>
                  <Text style={styles.btnGrayText}>{t('취소', 'Cancel', 'キャンセル', '取消')}</Text>
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.85} style={[styles.smallBtn, styles.btnGold]} onPress={generateQr}>
                  <Text style={styles.btnGoldText}>{t('QR생성', 'Generate QR', 'QR生成', '生成二维码')}</Text>
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.85} style={[styles.smallBtn, styles.btnGold]} onPress={() => Clipboard.setStringAsync(payload).catch(() => {})}>
                  <Text style={styles.btnGoldText}>{t('복사', 'Copy', 'コピー', '复制')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>{t('이름', 'Name', '名前', '姓名')}</Text>
            <TextInput value={name} onChangeText={setName} placeholder={t('이름', 'Name', '名前', '姓名')} placeholderTextColor="#666" style={styles.input} />
            <Text style={styles.label}>{t('전화', 'Phone', '電話', '电话')}</Text>
            <TextInput value={phone} onChangeText={setPhone} placeholder="010..." placeholderTextColor="#666" style={styles.input} />
            <Text style={styles.label}>{t('이메일', 'Email', 'メール', '邮箱')}</Text>
            <TextInput value={email} onChangeText={setEmail} placeholder="email@example.com" placeholderTextColor="#666" style={styles.input} />
            <Text style={styles.label}>{t('회사', 'Company', '会社', '公司')}</Text>
            <TextInput value={company} onChangeText={setCompany} placeholder={t('회사', 'Company', '会社', '公司')} placeholderTextColor="#666" style={styles.input} />
            <Text style={styles.label}>{t('직함', 'Title', '役職', '职位')}</Text>
            <TextInput value={jobTitle} onChangeText={setJobTitle} placeholder={t('직함', 'Title', '役職', '职位')} placeholderTextColor="#666" style={styles.input} />
            <Text style={styles.label}>{t('메모', 'Memo', 'メモ', '备注')}</Text>
            <TextInput value={memo} onChangeText={setMemo} placeholder={t('메모', 'Memo', 'メモ', '备注')} placeholderTextColor="#666" style={[styles.input, { minHeight: 64 }]} multiline />
            <TouchableOpacity activeOpacity={0.85} onPress={generateQr} style={[styles.bigBtn, { marginTop: 14, borderColor: '#FFD700' }]}>
              <Text style={{ color: '#FFD700', fontWeight: '900' }}>{t('QR 생성', 'Generate QR', 'QR生成', '生成二维码')}</Text>
            </TouchableOpacity>
          </View>

          {/* 아래 영역은 구버전처럼 “입력 → 상단 카드에 반영” 흐름만 유지 */}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <View style={{ flex: 1, padding: 14 }}>
          <Text style={styles.h1}>{t('QR코드 읽기', 'Scan QR code', 'QRコード読み取り', '读取二维码')}</Text>
          <Text style={styles.sub}>{t('카메라 또는 사진으로 QR을 읽을 수 있습니다.', 'Scan QR with camera or photo.', 'カメラまたは写真でQRを読み取れます。', '可通过相机或照片读取二维码。')}</Text>

          <View style={styles.card}>
            <TouchableOpacity activeOpacity={0.85} style={[styles.bigBtn, { borderColor: '#FFD700' }]} onPress={() => { try { router.push('/chatv2/scan'); } catch {} }}>
              <Text style={{ color: '#FFD700', fontWeight: '900' }}>{t('카메라로 읽기', 'Scan with camera', 'カメラで読み取り', '相机扫码')}</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.85} style={[styles.bigBtn, { marginTop: 10, borderColor: '#333' }]} onPress={() => { try { router.push('/chatv2/scan'); } catch {} }}>
              <Text style={{ color: '#CFCFCF', fontWeight: '900' }}>{t('사진에서 읽기', 'Scan from photo', '写真から読み取り', '从照片识别')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    height: 56,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
  },
  back: { color: '#FFD700', fontWeight: '900', fontSize: 16 },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: '#333', backgroundColor: '#111' },
  tabOn: { borderColor: '#FFD700' },
  tabText: { color: '#AAA', fontWeight: '900', fontSize: 12 },
  tabTextOn: { color: '#FFD700' },

  h1: { color: '#F6F6F6', fontWeight: '900', fontSize: 18 },
  sub: { color: '#777', marginTop: 6, fontSize: 12 },

  card: { marginTop: 10, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: '#222', backgroundColor: '#111' },
  label: { color: '#AAA', marginTop: 10, fontWeight: '800' },
  input: { marginTop: 8, borderWidth: 1, borderColor: '#333', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, color: '#EEE', backgroundColor: '#0C0C0C', fontWeight: '800' },

  qrCard: { marginTop: 10, flexDirection: 'row', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: '#2A2A2A', backgroundColor: '#101010', alignItems: 'center' },
  qrSquare: { width: 92, height: 92, borderRadius: 12, borderWidth: 1, borderColor: '#333', backgroundColor: '#0C0C0C', alignItems: 'center', justifyContent: 'center' },
  smallBtn: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  btnGray: { borderColor: '#333', backgroundColor: '#111' },
  btnGrayText: { color: '#AAA', fontWeight: '900' },
  btnGold: { borderColor: '#FFD700', backgroundColor: 'rgba(212,175,55,0.10)' },
  btnGoldText: { color: '#FFD700', fontWeight: '900' },

  bigBtn: { marginTop: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center', backgroundColor: '#0C0C0C' },
});

