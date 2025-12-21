import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, ScrollView, StyleSheet, TextInput, TouchableOpacity, View, Image as RNImage, Platform } from 'react-native';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useWallet } from '@/contexts/WalletContext';
import { t } from '@/i18n';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export default function AdminCEVInline() {
  const { language } = usePreferences();
  const { createWallet } = useWallet();
  const { currentUser } = useAuth();
  const [tab, setTab] = useState<'Notice'|'Receipts'|'NeedInfo'|'InReview'|'Rejected'|'Pending'|'Registered'>('Notice');
  const [items, setItems] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [decisionNote, setDecisionNote] = useState<string>('');
  const [statusMenuOpen, setStatusMenuOpen] = useState<boolean>(false);
  const [reqMemo, setReqMemo] = useState<string>('');
  const [reqAmount, setReqAmount] = useState<string>('');

  const load = async () => {
    const raw = await AsyncStorage.getItem('cev_submissions');
    const list = raw ? JSON.parse(raw) : [];
    setItems(list);
  };

  useEffect(() => { void load(); }, []);

  const updateStatus = async (id: string, status: string, note?: string) => {
    const admin = currentUser?.email || 'admin';
    const list = items.map(it => {
      if (it.id !== id) return it;
      const history = Array.isArray(it.history) ? it.history : [];
      const entry = { ts: Date.now(), by: admin, action: status, note: String(note || '') };
      return { ...it, status, lastNote: String(note || it.lastNote || ''), history: [entry, ...history].slice(0, 50) };
    });
    await AsyncStorage.setItem('cev_submissions', JSON.stringify(list));
    setItems(list);
    Alert.alert(t('saved', language) || 'Saved');
  };

  const filtered = items.filter(it => {
    if (tab === 'Notice') return it.status === 'Notice';
    if (tab === 'Receipts') return it.status === 'Receipts';
    if (tab === 'NeedInfo' || tab === 'InReview') return it.status === 'NeedInfo' || it.status === 'InReview';
    if (tab === 'Rejected') return it.status === 'Rejected';
    if (tab === 'Pending') return it.status === 'Pending';
    return it.status === 'Registered';
  });

  return (
    <ThemedView style={styles.wrap}>
      <ThemedText style={styles.title}>A-CEV - {t('reviewSubmissions', language)}</ThemedText>
      {/* Summary dashboard (match CEVInline style) */}
      {(() => {
        const notices = items.filter(it=>it.status==='Notice').length;
        const receipts = items.filter(it=>it.status==='Receipts').length;
        const correspondence = items.filter(it=>it.status==='NeedInfo' || it.status==='InReview').length;
        const rejected = items.filter(it=>it.status==='Rejected').length;
        const pending = items.filter(it=>it.status==='Pending').length;
        const registered = items.filter(it=>it.status==='Registered').length;
        return (
          <View style={styles.dashboard}>
            <TouchableOpacity style={styles.dbItem} onPress={()=> setTab('Notice')}>
              <ThemedText style={styles.dbNum}>{notices}</ThemedText>
              <ThemedText style={styles.dbLabel}>{t('cevList', language)}</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dbItem} onPress={()=> setTab('Receipts')}>
              <ThemedText style={styles.dbNum}>{receipts}</ThemedText>
              <ThemedText style={styles.dbLabel}>{t('receipts', language)}</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dbItem} onPress={()=> setTab('NeedInfo')}>
              <ThemedText style={styles.dbNum}>{correspondence}</ThemedText>
              <ThemedText style={styles.dbLabel}>{t('correspondence', language)}</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dbItem} onPress={()=> setTab('Rejected')}>
              <ThemedText style={styles.dbNum}>{rejected}</ThemedText>
              <ThemedText style={styles.dbLabel}>{t('rejections', language)}</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dbItem} onPress={()=> setTab('Pending')}>
              <ThemedText style={styles.dbNum}>{pending}</ThemedText>
              <ThemedText style={styles.dbLabel}>{t('pendingFilings', language)}</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dbItem} onPress={()=> setTab('Registered')}>
              <ThemedText style={styles.dbNum}>{registered}</ThemedText>
              <ThemedText style={styles.dbLabel}>Registered</ThemedText>
            </TouchableOpacity>
          </View>
        );
      })()}
      {/* tabs removed for cleaner UI; summary bar above is the navigation */}
      {/* 상세 패널 */}
      {selected && (
        <View style={styles.detailPanel}>
          <View style={styles.detailHeader}>
            <ThemedText style={styles.detailTitle}>{selected.symbol} · {selected.name}</ThemedText>
            <TouchableOpacity onPress={()=> { setSelected(null); setDecisionNote(''); }}>
              <ThemedText style={{ color:'#fff', fontWeight:'900', fontSize:16 }}>×</ThemedText>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 280 }} contentContainerStyle={{ padding: 12 }}>
            <ThemedText style={styles.detailSection}>Status: {selected.status}</ThemedText>
            <ThemedText style={styles.detailMeta}>Submitted: {new Date(selected.createdAt).toLocaleString()}</ThemedText>
            <ThemedText style={styles.detailMeta}>By: {selected.submittedBy || 'anonymous'}</ThemedText>
            {selected.logo?.url ? (
              <RNImage source={{ uri: selected.logo.url }} style={{ width: 84, height: 84, borderRadius: 10, marginTop: 6 }} />
            ) : null}
            <View style={styles.detailGrid}>
              <View style={styles.detailCol}>
                <ThemedText style={styles.detailSection}>Token</ThemedText>
                <ThemedText style={styles.detailRow}>Symbol: {selected.symbol}</ThemedText>
                <ThemedText style={styles.detailRow}>Name: {selected.name}</ThemedText>
                <ThemedText style={styles.detailRow}>Chain: {selected.chain || '-'}</ThemedText>
                <ThemedText style={styles.detailRow}>Contract: {selected.contract}</ThemedText>
                <ThemedText style={styles.detailRow}>TotalSupply: {selected.token?.totalSupply}</ThemedText>
                <ThemedText style={styles.detailRow}>Decimals: {selected.token?.decimals}</ThemedText>
                <ThemedText style={styles.detailRow}>Standard: {selected.token?.standard}</ThemedText>
                <ThemedText style={styles.detailRow}>Mintable: {selected.token?.mintable? 'Yes':'No'}</ThemedText>
                <ThemedText style={styles.detailRow}>Burnable: {selected.token?.burnable? 'Yes':'No'}</ThemedText>
              </View>
              <View style={styles.detailCol}>
                <ThemedText style={styles.detailSection}>Project</ThemedText>
                <ThemedText style={styles.detailRow}>Team: {selected.org?.teamName || '-'}</ThemedText>
                <ThemedText style={styles.detailRow}>Contact: {selected.org?.contactPerson || '-'}</ThemedText>
                <ThemedText style={styles.detailRow}>Company: {selected.org?.company || '-'}</ThemedText>
                <ThemedText style={styles.detailRow}>Country: {selected.org?.country || '-'}</ThemedText>
                <ThemedText style={styles.detailRow}>Phone: {selected.org?.phone || '-'}</ThemedText>
                <ThemedText style={styles.detailRow}>Website: {selected.website || '-'}</ThemedText>
                <ThemedText style={styles.detailRow}>Whitepaper: {selected.whitepaper || '-'}</ThemedText>
              </View>
            </View>
            <ThemedText style={styles.detailSection}>Description</ThemedText>
            <ThemedText style={{ color:'#EEE' }}>{selected.description || '-'}</ThemedText>
            <ThemedText style={[styles.detailSection,{ marginTop:10 }]}>Contacts</ThemedText>
            <ThemedText style={styles.detailRow}>Telegram: {selected.contacts?.telegram || '-'}</ThemedText>
            <ThemedText style={styles.detailRow}>Twitter/X: {selected.contacts?.twitter || '-'}</ThemedText>
            <ThemedText style={styles.detailRow}>Github: {selected.contacts?.github || '-'}</ThemedText>
            {selected.lastNote ? (<ThemedText style={[styles.detailSection,{ marginTop:10 }]}>Last note: {selected.lastNote}</ThemedText>) : null}
            {Array.isArray(selected.history) && selected.history.length > 0 && (
              <View style={{ marginTop: 10 }}>
                <ThemedText style={styles.detailSection}>History</ThemedText>
              {selected.history.slice(0,5).map((h:any, idx:number)=> (
                  <ThemedText key={idx} style={styles.detailRow}>• [{new Date(h.ts).toLocaleString()}] {h.by}: {h.action}{h.note?` - ${h.note}`:''}</ThemedText>
                ))}
              </View>
            )}

            {!!(Array.isArray(selected.attachments) && selected.attachments.length) && (
              <View style={{ marginTop: 10 }}>
                <ThemedText style={styles.detailSection}>Attachments</ThemedText>
                <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8, marginTop:6 }}>
                  {selected.attachments.map((a:any, idx:number) => (
                    <TouchableOpacity
                      key={`${a.name||'att'}-${idx}`}
                      style={styles.attachBtn}
                      onPress={()=>{
                        try {
                          const url = (a.base64 || a.url || '') as string;
                          if (typeof window !== 'undefined' && url) {
                            const win = window.open(url, '_blank');
                            if (!win) Alert.alert('Open', 'Popup blocked. Allow popups to view file.');
                          } else if (Platform.OS !== 'web') {
                            Alert.alert('미리보기', '모바일 미리보기는 추후 지원 예정입니다.');
                          }
                        } catch {}
                      }}
                    >
                      <ThemedText style={styles.attachBtnText}>{a.name || `Attachment ${idx+1}`}</ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Requirements (Admin -> Applicant) */}
            <View style={{ marginTop: 12 }}>
              <ThemedText style={styles.detailSection}>Requirements</ThemedText>
              {!!(Array.isArray(selected.requests) && selected.requests.length) && (
                <View style={{ borderWidth:1, borderColor:'#1E1E1E', borderRadius:8, overflow:'hidden', marginTop:6 }}>
                  {selected.requests.map((r:any, idx:number)=> (
                    <View key={idx} style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:12, paddingVertical:8, borderBottomWidth:1, borderBottomColor:'#111' }}>
                      <ThemedText style={{ color:'#FFD700', fontSize:12 }}>{r.type==='deposit'?'[Deposit]':''} {r.note || ''} {r.amount?`(${r.amount})`:''}</ThemedText>
                      <ThemedText style={{ color:'#777', fontSize:10 }}>{new Date(r.ts||Date.now()).toLocaleString()}</ThemedText>
                    </View>
                  ))}
                </View>
              )}
              <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginTop:8 }}>
                <TextInput value={reqMemo} onChangeText={setReqMemo} placeholder="요청 메모" placeholderTextColor="#777" style={[styles.decisionInput,{ flex:1, marginBottom:0 }]} />
                <TextInput value={reqAmount} onChangeText={setReqAmount} placeholder="금액(선택)" placeholderTextColor="#777" keyboardType="numbers-and-punctuation" style={[styles.decisionInput,{ width:120, marginBottom:0 }]} />
                <TouchableOpacity style={styles.plusBtn} onPress={async()=>{
                  try {
                    if (!selected) return;
                    const key = 'cev_submissions';
                    const raw = await AsyncStorage.getItem(key);
                    const list = raw ? JSON.parse(raw) : [];
                    const next = list.map((it:any)=>{
                      if (it.id !== selected.id) return it;
                      const reqs = Array.isArray(it.requests)? it.requests: [];
                      reqs.unshift({ type:'deposit', amount: String(reqAmount||'').trim() || null, note: String(reqMemo||'').trim(), ts: Date.now(), by: currentUser?.email||'admin' });
                      return { ...it, requests: reqs };
                    });
                    await AsyncStorage.setItem(key, JSON.stringify(next));
                    setItems(next);
                    setSelected(next.find((x:any)=>x.id===selected.id));
                    setReqMemo(''); setReqAmount('');
                    Alert.alert('요청 추가','요청을 추가했습니다.');
                  } catch {}
                }}>
                  <ThemedText style={{ color:'#FFD700', fontWeight:'900' }}>+</ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
          <View style={styles.decisionBar}>
            <TextInput value={decisionNote} onChangeText={setDecisionNote} placeholder="관리 메모 / 사유" placeholderTextColor="#777" style={styles.decisionInput} />
              <View style={styles.triRow}>
              <View style={[{ position:'relative' }, styles.triCol, styles.triColLarge]}>
                <TouchableOpacity style={[styles.dropdown, { width: '100%' }]} onPress={()=> setStatusMenuOpen(v=>!v)}>
                  <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                    <ThemedText style={styles.dropdownText}>{(() => {
                      const m: any = { NeedInfo:'보완요청', InReview:'심사중', Receipts:t('receipts', language), Pending:t('pendingFilings', language), Rejected:'반려' };
                      return m[String(selected.status)] || String(selected.status || 'Select Status');
                    })()}</ThemedText>
                    <ThemedText style={styles.dropdownText}>▲</ThemedText>
                  </View>
                </TouchableOpacity>
                {statusMenuOpen && (
                  <View style={[styles.dropdownMenu, { left: 0, right: 0 }]}>
                    {['Receipts','NeedInfo','InReview','Pending','Rejected'].map((s)=> (
                      <TouchableOpacity key={s} style={styles.dropdownItem} onPress={()=>{ setStatusMenuOpen(false); void updateStatus(selected.id, s, decisionNote); }}>
                        <ThemedText style={styles.dropdownItemText}>{s==='Receipts'? t('receipts', language): s==='Pending'? t('pendingFilings', language): (s==='NeedInfo'?'보완요청': s==='InReview'?'심사중':'반려')}</ThemedText>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
              <TouchableOpacity style={[styles.btnRegister, styles.triCol]} onPress={async()=>{
                try { await createWallet(selected.symbol, selected.name || selected.symbol, selected.chain || 'Ethereum'); await updateStatus(selected.id, 'Registered', decisionNote || '지갑 생성/코인 등록'); Alert.alert('완료','코인을 App에 등록했습니다.'); } catch(e){ Alert.alert('Error', String(e)); }
              }}>
                <ThemedText style={styles.btnRegisterText}>코인 등록</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnSave, styles.triCol]} onPress={async()=>{
                try {
                  const key = 'cev_submissions';
                  const raw = await AsyncStorage.getItem(key);
                  const list = raw ? JSON.parse(raw) : [];
                  const next = list.map((it:any)=>{
                    if (it.id !== selected.id) return it;
                    const hist = Array.isArray(it.history)? it.history: [];
                    hist.unshift({ ts: Date.now(), by: (currentUser?.email||'admin'), action: 'Saved', note: String(decisionNote||'') });
                    return { ...it, history: hist, lastSavedAt: Date.now() };
                  });
                  await AsyncStorage.setItem(key, JSON.stringify(next));
                  setItems(next);
                  setSelected(next.find((x:any)=>x.id===selected.id));
                  Alert.alert('저장됨','요청/상태가 저장되어 신청자에게 반영됩니다.');
                } catch {}
              }}>
                <ThemedText style={styles.btnSaveText}>저장</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      <ScrollView>
        {filtered.map((it)=> (
          <TouchableOpacity key={it.id} style={styles.row} onPress={()=> { setSelected(it); setDecisionNote(''); }} activeOpacity={0.8}>
            <ThemedText style={styles.symbol}>{it.symbol}</ThemedText>
            <ThemedText style={styles.name}>{it.name}</ThemedText>
            <View style={{ marginLeft: 10 }}>
              <ThemedText style={styles.meta}>{it.submittedBy || 'anonymous'}</ThemedText>
              <ThemedText style={styles.meta}>{new Date(it.createdAt).toLocaleString()}</ThemedText>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16 },
  title: { color: '#FFF', fontWeight: '700', marginBottom: 8 },
  tabs: { },
  tabBtn: { },
  tabBtnActive: { },
  tabText: { },
  tabTextActive: { },
  dashboard: { width: '100%', flexDirection: 'row', alignItems: 'center', backgroundColor: '#0A0A0A', borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, marginBottom: 10, justifyContent: 'space-between' },
  dbItem: { flex: 1, alignItems: 'center', minWidth: 56 },
  dbNum: { color: '#FFD700', fontWeight: '800', fontSize: 16 },
  dbLabel: { color: '#EEE', fontSize: 9 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
  symbol: { color: '#FFD700', fontWeight: '700', width: 60 },
  name: { color: '#FFF', flex: 1 },
  meta: { color:'#888', fontSize: 10 },
  view: { backgroundColor:'#2A2A2A', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6 },
  viewText: { color:'#EEE', fontWeight:'700' },
  approve: { backgroundColor: '#1F7A1F', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, marginRight: 4 },
  approveText: { color: '#FFF', fontWeight: '700', fontSize: 12 },
  info: { backgroundColor:'#1565C0', paddingHorizontal:8, paddingVertical:5, borderRadius:6 },
  pending: { backgroundColor:'#9E9E9E', paddingHorizontal:8, paddingVertical:5, borderRadius:6 },
  reject: { backgroundColor: '#7A1F1F', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6 },
  rejectText: { color: '#FFF', fontWeight: '700', fontSize: 12 },
  register: { backgroundColor:'#FFD700', paddingHorizontal:8, paddingVertical:5, borderRadius:6 },
  registerText: { color:'#000', fontWeight:'800', fontSize: 12 },
  detailPanel: { borderWidth:2, borderColor:'#FFD700', borderRadius:12, backgroundColor:'#0B0B0B', marginBottom: 12, overflow:'hidden' },
  detailHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:14, paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#FFD700' },
  detailTitle: { color:'#FFD700', fontWeight:'800' },
  detailSection: { color:'#CFCFCF', fontWeight:'700', marginTop:4 },
  detailMeta: { color:'#9BA1A6', fontSize: 12 },
  detailGrid: { flexDirection:'row', gap:18, marginTop:6 },
  detailCol: { flex:1, minWidth: 160 },
  detailRow: { color:'#EDEDED', fontSize: 12, marginTop: 2 },
  decisionBar: { borderTopWidth:1, borderTopColor:'#1E1E1E', padding:10, backgroundColor:'#0F0F0F' },
  decisionInput: { backgroundColor:'#141414', color:'#EEE', borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:10, paddingVertical:8, marginBottom:8 },
  dropdown: { backgroundColor:'#1A1A1A', borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:12, paddingVertical:8 },
  dropdownText: { color:'#EDEDED', fontWeight:'700', fontSize: 12 },
  dropdownMenu: { position:'absolute', bottom:42, left:0, right:'auto', backgroundColor:'#0F0F0F', borderWidth:1, borderColor:'#2A2A2A', borderRadius:12, paddingVertical:6, minWidth: 180, zIndex: 10, boxShadow: '0 6px 24px rgba(0,0,0,0.5)' },
  dropdownItem: { paddingHorizontal:12, paddingVertical:8 },
  dropdownItemText: { color:'#DDD' },
  btnRegister: { backgroundColor:'#FFD700', paddingHorizontal:16, paddingVertical:8, borderRadius:999, minWidth: 110, alignItems:'center', boxShadow: '0 4px 16px rgba(212,175,55,0.35)' },
  btnRegisterText: { color:'#000', fontWeight:'800', fontSize: 12 },
  btnSave: { backgroundColor:'#1565C0', paddingHorizontal:14, paddingVertical:8, borderRadius:999 },
  btnSaveText: { color:'#FFF', fontWeight:'800', fontSize: 12 },
  triRow: { flexDirection:'row', alignItems:'center', gap:12 },
  triCol: { flex: 1 },
  triColLarge: { flex: 2 },
  plusBtn: { paddingHorizontal:8, paddingVertical:6, backgroundColor:'transparent' },
  attachBtn: { backgroundColor:'#1A1A1A', borderWidth:1, borderColor:'#2A2A2A', paddingHorizontal:10, paddingVertical:6, borderRadius:999 },
  attachBtnText: { color:'#EDEDED', fontSize: 12, fontWeight:'700' },
});



