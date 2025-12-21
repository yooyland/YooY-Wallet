import { ThemedText } from '@/components/themed-text';
import { useQuickActions } from '@/contexts/QuickActionsContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import React from 'react';
import { t } from '@/i18n';
import { Modal, StyleSheet, TouchableOpacity, View, Switch } from 'react-native';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
};

export default function QuickActionsSettings({ visible, onClose, title = 'Quick Actions Settings' }: Props) {
  const { actions, setActionEnabled, replaceAll } = useQuickActions();
  const { fastScan, setFastScan, language } = usePreferences() as any;
  const [local, setLocal] = React.useState(actions);
  React.useEffect(()=>{ if (visible) setLocal(actions); }, [visible, actions]);

  const entries = [
    { key: 'send', icon: '↗' },
    { key: 'receive', icon: '↘' },
    { key: 'qr', icon: '▦' },
    { key: 'gift', icon: '🎁' },
    { key: 'history', icon: '≡' },
    { key: 'schedule', icon: '▣' },
    { key: 'reward', icon: '★' },
    { key: 'chat', icon: '○' },
    { key: 'shop', icon: '◆' },
    { key: 'nft', icon: '◇' },
    { key: 'buy', icon: '△' },
    { key: 'sell', icon: '▽' },
    { key: 'diary', icon: '◌' },
    { key: 'accountBook', icon: '◐' },
    { key: 'memo', icon: '◑' },
  ] as const;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}> 
        <View style={styles.sheet}>
          <View style={styles.header}>
            <ThemedText style={styles.headerTitle}>{t('quickActionsSettings', language) || title}</ThemedText>
            <TouchableOpacity onPress={onClose}><ThemedText style={styles.close}>×</ThemedText></TouchableOpacity>
          </View>

          {/* Fast Scan toggle */}
          <View style={styles.row}> 
            <ThemedText style={styles.rowLabel}>{t('fastScanMode', language)}</ThemedText>
            <Switch value={fastScan} onValueChange={(v)=> setFastScan(v)} />
          </View>

          <View style={styles.grid}>
            {entries.filter(e=>e.key!=='more').map(e => {
              const enabled = (local as any)[e.key];
              return (
                <TouchableOpacity key={e.key} style={[styles.tile, enabled ? styles.tileOn : styles.tileOff]}
                  onPress={() => {
                    const next = { ...local, [e.key]: !enabled } as any;
                    setLocal(next);
                  }}>
                  <View style={[styles.badgeOverlay, enabled ? styles.badgeOn : styles.badgeOff]}>
                    <ThemedText style={[styles.badgeText, enabled ? styles.badgeTextOn : styles.badgeTextOff]}>{enabled ? t('enable', language) : t('disable', language)}</ThemedText>
                  </View>
                  <View style={styles.iconWrap}>
                    <View style={styles.iconLarge}><ThemedText style={styles.iconTextLarge}>{e.icon}</ThemedText></View>
                  </View>
                  <ThemedText style={styles.tileLabelSmall}>
                    {(() => {
                      switch (e.key) {
                        case 'send': return t('send', language);
                        case 'receive': return t('walletReceive', language) || t('receive', language);
                        case 'qr': return t('qrCode', language);
                        case 'gift': return t('gift', language) || 'Gift';
                        case 'history': return t('history', language);
                        case 'schedule': return t('schedule', language);
                        case 'reward': return t('reward', language);
                        case 'chat': return t('chat', language);
                        case 'shop': return t('shop', language);
                        case 'nft': return t('nft', language) || 'NFT';
                        case 'buy': return t('buy', language);
                        case 'sell': return t('sell', language);
                        case 'diary': return t('diary', language);
                        case 'accountBook': return t('money', language);
                        case 'memo': return t('memo', language);
                        default: return '';
                      }
                    })()}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancel} onPress={onClose}><ThemedText style={styles.cancelText}>{t('cancel', language)}</ThemedText></TouchableOpacity>
            <TouchableOpacity style={styles.apply} onPress={()=>{ replaceAll(local); onClose(); }}><ThemedText style={styles.applyText}>{t('apply', language) || t('save', language)}</ThemedText></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const GOLD = '#D4AF37';

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 420, backgroundColor: '#0B0B0B', borderRadius: 14, borderWidth: 2, borderColor: GOLD, overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: GOLD },
  headerTitle: { color: '#fff', fontWeight: '800' },
  close: { color: '#fff', fontWeight: '900', fontSize: 18 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#222' },
  rowLabel: { color: '#fff', fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 10, justifyContent: 'space-between' },
  tile: { width: '30%', backgroundColor: '#121212', borderWidth: 1, borderColor: GOLD, borderRadius: 12, padding: 10, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  tileOn: { backgroundColor: '#14110A', borderColor: GOLD },
  tileOff: { backgroundColor: '#0E0E0E', borderColor: '#444' },
  iconWrap: { alignItems:'center', justifyContent:'center' },
  badgeOverlay: { position: 'absolute', right: 6, top: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, borderWidth: 1, transform:[{scale:0.6}], zIndex: 2 },
  iconLarge: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#1A1A1A', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#333', marginBottom: 6, zIndex: 1 },
  iconTextLarge: { color: '#fff', fontWeight: '900', fontSize: 18 },
  // Revert to badge style to match dashboard
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  badgeOn: { backgroundColor: GOLD, borderColor: GOLD },
  badgeOff: { backgroundColor: '#222', borderColor: '#444' },
  badgeText: { fontWeight: '800' },
  badgeTextOn: { color: '#000' },
  badgeTextOff: { color: '#aaa' },
  tileLabelSmall: { color: '#fff', marginTop: 2, fontWeight: '700', textAlign: 'center', fontSize: 12 },
  footer: { flexDirection: 'row', gap: 10, padding: 12, borderTopWidth: 1, borderTopColor: GOLD },
  cancel: { flex: 1, backgroundColor: '#1E1E1E', paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#3A3A3A', alignItems: 'center' },
  cancelText: { color: '#fff', fontWeight: '700' },
  apply: { flex: 1, backgroundColor: GOLD, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  applyText: { color: '#000', fontWeight: '900' },
});


