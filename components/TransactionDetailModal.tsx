import { ThemedText } from '@/components/themed-text';
import { resolveExplorerBase } from '@/config/explorers';
import { Transaction } from '@/contexts/TransactionContext';
// Avoid dependency: use web clipboard where available; native can be added later
import React from 'react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Alert, Linking, Modal, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { t } from '@/i18n';

type Props = {
  visible: boolean;
  tx: Transaction | null;
  onClose: () => void;
  onSaveMemo?: (id: string, memo: string) => void;
  memoDraft: string;
  setMemoDraft: (v: string) => void;
};

export default function TransactionDetailModal({ visible, tx, onClose, onSaveMemo, memoDraft, setMemoDraft }: Props) {
  if (!tx) return null;
  const { language } = usePreferences();
  const locale = language === 'ko' ? 'ko-KR' : language === 'ja' ? 'ja-JP' : language === 'zh' ? 'zh-CN' : 'en-US';
  const yoyNoExplorer =
    (tx.network === 'yoy' || tx.currency === 'YOY') &&
    !(process.env.EXPO_PUBLIC_YOY_EXPLORER_BASE ||
      process.env.EXPO_PUBLIC_YOY_EXPLORER_BASE_MAIN ||
      process.env.EXPO_PUBLIC_YOY_EXPLORER_BASE_TEST);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}> 
          <View style={styles.header}>
            <ThemedText style={styles.title}>{t('transactionHistory', language)}</ThemedText>
            <TouchableOpacity onPress={onClose}><ThemedText style={styles.close}>×</ThemedText></TouchableOpacity>
          </View>
           <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator>
            <Row k={t('type', language)} v={tx.type} oneLine onOpen={undefined} />
            <Row k={t('amount', language)} v={`${tx.amount} ${tx.currency}`} oneLine onOpen={undefined} />
            <StatusRow k={t('status', language)} v={tx.status} />
            <Row k={t('time', language)} v={new Date(tx.timestamp).toLocaleString(locale as any)} />
            {!!(tx.gasUsed || tx.gasPrice) && (
              <Row k={t('gasUsed', language) + ' / ' + t('networkFee', language)} v={`${tx.gasUsed?.toLocaleString?.() || '-'} / ${(tx.gasUsed && tx.gasPrice) ? (tx.gasUsed * tx.gasPrice).toString() : '-'}`} />
            )}
            {!!tx.hash && (
              <Row
                k={t('hash', language) || 'Hash'}
                v={tx.hash}
                mono
                oneLine
                onCopy={() => copyToClipboard(tx.hash!)}
                onOpen={yoyNoExplorer ? undefined : () => tryOpen(explorerUrl(tx, 'tx'), tx)}
              />
            )}
            {!!tx.blockNumber && (
              <Row
                k={t('block', language) || 'Block'}
                v={`${tx.blockNumber}`}
                oneLine
                onCopy={() => copyToClipboard(String(tx.blockNumber))}
                onOpen={yoyNoExplorer ? undefined : () => tryOpen(explorerUrl(tx, 'block'), tx)}
              />
            )}
            {!!tx.network && <Row k={t('network', language) || 'Network'} v={tx.network} />}
            {!!tx.from && (
              <RowAddr
                k={t('from', language) || 'From'}
                addr={tx.from}
                hash={undefined}
                onCopyAddr={() => copyToClipboard(tx.from!)}
                onOpenAddr={yoyNoExplorer ? () => copyToClipboard(tx.from!) : () => tryOpen(explorerUrl(tx, 'address', 'from'), tx)}
              />
            )}
            {!!tx.to && (
              <RowAddr
                k={t('to', language) || 'To'}
                addr={tx.to}
                hash={undefined}
                onCopyAddr={() => copyToClipboard(tx.to!)}
                onOpenAddr={yoyNoExplorer ? () => copyToClipboard(tx.to!) : () => tryOpen(explorerUrl(tx, 'address', 'to'), tx)}
              />
            )}
            <View style={{ height: 8 }} />
            <ThemedText style={styles.label}>{t('memo', language)}</ThemedText>
            <View style={styles.memoRow}>
              {onSaveMemo ? (
                <View style={{ width:'100%' }}>
                  <TextInput
                    style={styles.memoInput}
                    placeholder={t('enterMemo', language) || t('messageLabel', language)}
                    placeholderTextColor="#666"
                    value={memoDraft}
                    onChangeText={setMemoDraft}
                    multiline
                  />
                  <View style={{ flexDirection:'row', justifyContent:'flex-end', gap:8, marginTop:8 }}>
                    <TouchableOpacity style={[styles.actionBtn,{ backgroundColor:'#1E1E1E', borderColor:'#444' }]} onPress={onClose}><ThemedText style={[styles.actionText,{ color:'#fff' }]}>{t('cancel', language)}</ThemedText></TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={()=> onSaveMemo?.(tx.id, memoDraft)}><ThemedText style={styles.actionText}>{t('save', language)}</ThemedText></TouchableOpacity>
                  </View>
                </View>
              ) : (
                <ThemedText style={[styles.mono,{ flex: 1 }]} numberOfLines={3}>{tx.memo || ''}</ThemedText>
              )}
            </View>

            {/* 추가 블록 정보 */}
            <View style={{ height: 12 }} />
            <ThemedText style={styles.label}>{t('blockchain', language) || 'Blockchain'}</ThemedText>
            {!!tx.blockTimestamp && (
              <Row k={t('blockTime', language) || 'Block Time'} v={new Date(tx.blockTimestamp).toLocaleString(locale as any)} />
            )}
            {!!tx.gasUsed && <Row k={t('gasUsed', language)} v={tx.gasUsed.toLocaleString()} />}
            {!!tx.gasPrice && <Row k={t('gasPrice', language) || 'Gas Price'} v={`${tx.gasPrice}`} />}
            {!!tx.network && <Row k={t('network', language) || 'Network'} v={tx.network} />}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Row({ k, v, mono, oneLine, onCopy, onOpen }: { k: string; v: string; mono?: boolean; oneLine?: boolean; onCopy?: () => void; onOpen?: () => void }) {
  return (
    <View style={styles.row}>
      <ThemedText style={styles.key}>{k}</ThemedText>
      <TouchableOpacity style={{ flex: 1 }} disabled={!onOpen} onPress={onOpen}>
        <ThemedText style={[styles.value, mono && styles.mono]} numberOfLines={oneLine ? 1 : undefined} ellipsizeMode={oneLine ? 'middle' : 'tail'}>{v}</ThemedText>
      </TouchableOpacity>
      {onCopy && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={onCopy}><ThemedText style={styles.actionText}>복사</ThemedText></TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function StatusRow({ k, v }: { k: string; v: string }) {
  const { language } = usePreferences();
  const label = v === 'completed' ? (t('orderFilled', language) || 'completed') : v === 'pending' ? (t('processing', language) || 'pending') : (t('orderCancelled', language) || 'failed');
  const color = v === 'completed' ? '#4CAF50' : v === 'pending' ? '#FFA500' : '#F44336';
  return (
    <View style={styles.row}>
      <ThemedText style={styles.key}>{k}</ThemedText>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <View style={{ paddingHorizontal:8, paddingVertical:2, borderRadius:999, backgroundColor: color + '22', borderWidth:1, borderColor: color }}>
          <ThemedText style={{ color, fontSize: 12, fontWeight:'700' }}>{label}</ThemedText>
        </View>
      </View>
    </View>
  );
}

function explorerUrl(tx: any, kind: 'tx'|'block'|'address', addrField: 'from'|'to'='from') {
  const base = resolveExplorerBase(tx.network);
  if (!base) return '';
  if (kind==='tx') return `${base}/tx/${tx.hash}`;
  if (kind==='block') return `${base}/block/${tx.blockNumber}`;
  if (kind==='address') return `${base}/address/${addrField==='from'?tx.from:tx.to}`;
  return '';
}

function tryOpen(url: string, tx?: Transaction) {
  // YOY 네트워크: 공개 익스플로러가 환경변수로 제공되지 않으면 차단
  if (tx && (tx.network === 'yoy' || tx.currency === 'YOY')) {
    const hasCustomExplorer =
      !!(process.env.EXPO_PUBLIC_YOY_EXPLORER_BASE ||
         process.env.EXPO_PUBLIC_YOY_EXPLORER_BASE_MAIN ||
         process.env.EXPO_PUBLIC_YOY_EXPLORER_BASE_TEST);
    if (!hasCustomExplorer || !url) {
      Alert.alert('알림', 'YOY 네트워크는 아직 공개 익스플로러가 없습니다.');
      return;
    }
  }
  
  if (url) {
    Linking.openURL(url).catch(()=>{});
  }
}

function copyToClipboard(text: string) {
  try {
    if (typeof navigator !== 'undefined' && (navigator as any).clipboard) {
      (navigator as any).clipboard.writeText(text).catch(()=>{});
    }
  } catch {}
}

const GOLD = '#FFD700';

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 520, backgroundColor: '#0B0B0B', borderRadius: 16, borderWidth: 2, borderColor: GOLD, overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: GOLD },
  title: { color: '#FFD700', fontWeight: '800' },
  close: { color: '#FFFFFF', fontWeight: '900', fontSize: 18 },
  scroll: { maxHeight: 440 },
  content: { padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#191919' },
  key: { color: '#AAAAAA', width: 100, fontWeight: '700', fontSize: 12 },
  value: { color: '#FFFFFF', flex: 1, fontSize: 12, textAlign: 'right' },
  actions: { flexDirection: 'row' },
  actionBtn: { borderWidth: 1, borderColor: GOLD, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, backgroundColor: GOLD, minWidth: 32, alignItems:'center' },
  actionText: { color: '#000', fontWeight: '800', fontSize: 9 },
  mono: { fontFamily: 'monospace' as any },
  label: { color: '#AAAAAA', fontWeight: '700' },
  memoRow: { backgroundColor: '#111', borderWidth: 1, borderColor: '#222', borderRadius: 8, padding: 10, marginTop: 4 },
  memoInput: { color:'#fff', minHeight: 72, textAlignVertical:'top', padding:10, backgroundColor:'#0E0E0E', borderWidth:1, borderColor:'#333', borderRadius:8, fontSize: 12 },
});

function RowAddr({ k, addr, hash, onCopyAddr, onOpenAddr, onCopyHash, onOpenHash }: { k: string; addr: string; hash?: string; onCopyAddr: () => void; onOpenAddr: () => void; onCopyHash?: () => void; onOpenHash?: () => void }) {
  return (
    <View style={styles.row}> 
      <ThemedText style={styles.key}>{k}</ThemedText>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection:'row', alignItems:'center', gap:6 }}>
          <TouchableOpacity style={{ flex:1 }} onPress={onOpenAddr}>
            <ThemedText style={[styles.value, styles.mono]} numberOfLines={1} ellipsizeMode='middle'>{addr}</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={onCopyAddr}><ThemedText style={styles.actionText}>복사</ThemedText></TouchableOpacity>
        </View>
      </View>
    </View>
  );
}


