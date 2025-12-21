import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import { useMarket } from '@/contexts/MarketContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { formatCurrency, getExchangeRates } from '@/lib/currency';
import { getMockBalancesForUser } from '@/lib/userBalances';
import { getAdminRoleByEmail, isAdmin } from '@/constants/admins';
import { useChatProfileStore } from '@/src/features/chat/store/chat-profile.store';
import React, { useState } from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View, Image, TextInput, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useChatSettingsStore } from '@/src/features/chat/store/chat-settings.store';
import { t } from '@/i18n';

export default function ChatSettingsScreen() {
  const store = useChatSettingsStore();
  const [menu, setMenu] = useState<'general'|'notifications'|'privacy'|'chat'|'data'|'appearance'>('general');
  const save = (next: any) => store.setSettings(next);
  const { currentUser } = useAuth();
  const { yoyPriceUSD } = useMarket();
  const { currency, language } = usePreferences();
  const [rates, setRates] = useState<any>(null);
  const isUserAdmin = !!(currentUser?.email && isAdmin(currentUser.email));
  const adminRole = currentUser?.email ? getAdminRoleByEmail(currentUser.email) : null;
  const { currentProfile, updateProfile } = useChatProfileStore();
  const [tags, setTags] = useState<string[]>(Array.isArray(currentProfile?.tags) ? ([...currentProfile!.tags!] as string[]) : []);
  const [tagDraft, setTagDraft] = useState('');

  React.useEffect(() => {
    setTags(Array.isArray(currentProfile?.tags) ? ([...currentProfile!.tags!] as string[]) : []);
    setTagDraft('');
  }, [currentProfile?.tags]);

  React.useEffect(() => { (async () => { try { const r = await getExchangeRates(); setRates(r); } catch {} })(); }, [currency]);

  const total = React.useMemo(() => {
    const yoyUSD = yoyPriceUSD ?? 0;
    const userBalances = getMockBalancesForUser(currentUser?.email);
    const cryptoOnlyBalances = userBalances.filter((b:any) => !['KRW','USD','JPY','CNY','EUR'].includes(b.symbol));
    const valued = cryptoOnlyBalances.map((b:any) => b.symbol==='YOY' && yoyUSD ? ({ ...b, valueUSD: b.amount * yoyUSD }) : b);
    return valued.reduce((s:number, b:any) => s + (b.valueUSD||0), 0);
  }, [currentUser?.email, yoyPriceUSD]);

  const renderContent = (which: typeof menu) => {
    switch (which) {
      case 'general':
        return (
          <>
            {/* 빠른 이동: 친구 리스트 / 채팅방 리스트 */}
            <View style={{ marginTop: 12 }}>
              <TouchableOpacity onPress={()=>{ try { router.push('/chat/friends'); } catch {} }} style={{ paddingVertical:12, paddingHorizontal:14, borderWidth:1, borderColor:'#1E1E1E', borderRadius:8, backgroundColor:'#0B0B0B', flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                <Text style={{ color:'#F6F6F6' }}>{t('friendsList', language)}</Text>
                <Text style={{ color:'#777' }}>▶</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={()=>{ try { router.push('/chat/rooms'); } catch {} }} style={{ paddingVertical:12, paddingHorizontal:14, borderWidth:1, borderColor:'#1E1E1E', borderRadius:8, backgroundColor:'#0B0B0B', flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
                <Text style={{ color:'#F6F6F6' }}>{t('chatRoomsList', language)}</Text>
                <Text style={{ color:'#777' }}>▶</Text>
              </TouchableOpacity>
            </View>
            {/* 태그 입력(채팅 프로필과 동일 값으로 연동) */}
            <View style={{ marginTop: 12 }}>
              <Text style={{ color:'#CFCFCF', marginBottom: 6 }}>{t('tags', language) || '태그'} (',')</Text>
              <View style={{ flexDirection:'row', flexWrap:'wrap', gap: 6 }}>
                {tags.map((t, idx) => (
                  <View key={`${t}-${idx}`} style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:8, paddingVertical:4, borderRadius:12, borderWidth:1, borderColor:'#FFD700', backgroundColor:'#141414' }}>
                    <Text style={{ color:'#FFD700', marginRight:6 }}>{t}</Text>
                    <TouchableOpacity onPress={() => setTags(tags.filter((_,i)=>i!==idx))}>
                      <Text style={{ color:'#CFCFCF' }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
              <TextInput
                style={{ marginTop: 8, borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:10, paddingVertical:8, color:'#F6F6F6', backgroundColor:'#141414' }}
                value={tagDraft}
                onChangeText={(v) => {
                  if (v.includes(',')) {
                    const parts = v.split(',');
                    const last = parts.pop() || '';
                    const newTags = parts.map(p=>p.trim()).filter(Boolean);
                    if (newTags.length) setTags(prev => Array.from(new Set([...prev, ...newTags])));
                    setTagDraft(last.trim());
                  } else {
                    setTagDraft(v);
                  }
                }}
                onSubmitEditing={() => { const t = tagDraft.trim(); if (t) setTags(prev=>Array.from(new Set([...prev, t]))); setTagDraft(''); }}
                placeholder={t('tagsPlaceholder', language) || '예: 개발, 음악, 여행'}
                placeholderTextColor="#666"
              />
            </View>
          </>
        );
      case 'notifications':
        return (
          <>
            {/* 제목 제거: 상위 메뉴 바로 아래 표시 */}
            <Row label={t('messageNotifications', language)} value={!!store.notifications?.sound} onChange={(v)=>save({ notifications: { ...(store.notifications||{}), sound: v } })} />
            <Row label={t('mentionsOnly', language)} value={!!store.notifications?.mentionOnly} onChange={(v)=>save({ notifications: { ...(store.notifications||{}), mentionOnly: v } })} />
            <Row label={t('joinAlerts', language)} value={!!store.notifications?.joinAlerts} onChange={(v)=>save({ notifications: { ...(store.notifications||{}), joinAlerts: v } })} />
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{t('soundMode', language)}</Text>
              <View style={{ flexDirection:'row', gap:8 }}>
                {(['off','vibrate','sound'] as const).map(m => (
                  <TouchableOpacity key={m} onPress={()=>save({ notifications: { ...(store.notifications||{}), soundMode: m } })} style={{ paddingHorizontal:10, paddingVertical:6, borderRadius:14, borderWidth:1, borderColor: (store.notifications?.soundMode||'sound')===m ? '#FFD700' : '#2A2A2A', backgroundColor:'#141414' }}>
                    <Text style={{ color:(store.notifications?.soundMode||'sound')===m ? '#FFD700' : '#B8B8B8', fontSize:12 }}>{m==='off'?t('soundOff', language):m==='vibrate'?t('soundVibrate', language):t('soundOn', language)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </>
        );
      case 'privacy':
        return (
          <>
            {/* 제목 제거 */}
            <PickerRow label={t('lastSeen', language)} value={(store.privacy?.lastSeen||'everyone') as string} options={[["everyone",t('everyone', language)],["friends",t('friendsOnly', language)],["nobody",t('nobody', language)]]} onChange={(v)=>save({ privacy: { ...(store.privacy||{}), lastSeen: v } })} />
            <Row label={t('sendReadReceipts', language)} value={!!store.privacy?.readReceipts} onChange={(v)=>save({ privacy: { ...(store.privacy||{}), readReceipts: v } })} />
            <Row label={t('allowInvites', language)} value={!!store.privacy?.allowInvites} onChange={(v)=>save({ privacy: { ...(store.privacy||{}), allowInvites: v } })} />
          </>
        );
      case 'chat':
        return (
          <>
            {/* 제목 제거 */}
            {/* 기존 일반 섹션 항목을 채팅 하위로 이동 */}
            <Row label={t('showRead', language)} value={!!store.readReceipts} onChange={(v)=>save({ readReceipts: v })} />
            <Row label={t('showTyping', language)} value={!!store.typingIndicator} onChange={(v)=>save({ typingIndicator: v })} />
            <Row label={t('hideInviteInstalled', language)} value={!!store.hideInviteForInstalled} onChange={(v)=>save({ hideInviteForInstalled: v })} />
            <Row label={t('autoSaveImages', language)} value={!!store.autoSaveMedia} onChange={(v)=>save({ autoSaveMedia: v })} />
            <Row label={t('defaultRoomTtl', language)} value={!!store.ttlDefault} onChange={(v)=>save({ ttlDefault: v })} />
            {/* 기존 채팅 섹션 항목 */}
            <Row label={t('compactMode', language)} value={!!store.chat?.compactMode} onChange={(v)=>save({ chat: { ...(store.chat||{}), compactMode: v } })} />
            <Row label={t('autoDownloadImages', language)} value={!!store.chat?.autoDownloadImages} onChange={(v)=>save({ chat: { ...(store.chat||{}), autoDownloadImages: v } })} />
          </>
        );
      case 'data':
        return (
          <>
            {/* 제목 제거 */}
            <Row label={t('lowDataMode', language)} value={!!store.data?.lowDataMode} onChange={(v)=>save({ data: { ...(store.data||{}), lowDataMode: v } })} />
            <PickerRow label={t('mediaQuality', language)} value={(store.data?.mediaQuality||'auto') as string} options={[["auto",t('auto', language)],["high",t('high', language)],["low",t('low', language)]]} onChange={(v)=>save({ data: { ...(store.data||{}), mediaQuality: v } })} />
          </>
        );
      case 'appearance':
        return (
          <>
            {/* 제목 제거 */}
            <PickerRow label={t('themeLabel', language)} value={(store.appearance?.theme||'dark') as string} options={[["system",t('system', language)],["dark",t('dark', language)],["light",t('light', language)]]} onChange={(v)=>save({ appearance: { ...(store.appearance||{}), theme: v } })} />
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{t('fontSize', language)}</Text>
              <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                <TouchableOpacity onPress={()=>{ const v=Math.max(0.8, Math.min(1.4, Number(store.appearance?.fontScale||1)-0.1)); save({ appearance: { ...(store.appearance||{}), fontScale: Number(v.toFixed(1)) } }); }} style={{ paddingHorizontal:10, paddingVertical:6, borderRadius:8, borderWidth:1, borderColor:'#2A2A2A' }}><Text style={{ color:'#CFCFCF' }}>-</Text></TouchableOpacity>
                <Text style={{ color:'#CFCFCF', width:40, textAlign:'center' }}>{Number(store.appearance?.fontScale||1).toFixed(1)}x</Text>
                <TouchableOpacity onPress={()=>{ const v=Math.max(0.8, Math.min(1.4, Number(store.appearance?.fontScale||1)+0.1)); save({ appearance: { ...(store.appearance||{}), fontScale: Number(v.toFixed(1)) } }); }} style={{ paddingHorizontal:10, paddingVertical:6, borderRadius:8, borderWidth:1, borderColor:'#2A2A2A' }}><Text style={{ color:'#CFCFCF' }}>+</Text></TouchableOpacity>
              </View>
            </View>
            <PickerRow label={t('bubble', language)} value={(store.appearance?.bubbleStyle||'round') as string} options={[["round",t('round', language)],["square",t('square', language)]]} onChange={(v)=>save({ appearance: { ...(store.appearance||{}), bubbleStyle: v } })} />
            {/* 말풍선 색: 텍스트 라벨 제거 */}
            <View style={[styles.row, { alignItems:'flex-start' }]}>
              <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8 }}>
                {(['default','gold','purple','mint','red','white'] as const).map(c => (
                  <TouchableOpacity key={c} onPress={()=>save({ appearance: { ...(store.appearance||{}), bubbleColor: c } })} style={{ paddingHorizontal:10, paddingVertical:6, borderRadius:14, borderWidth:1, borderColor: (store.appearance?.bubbleColor||'default')===c ? '#FFD700' : '#2A2A2A', backgroundColor:'#141414' }}>
                    <Text style={{ color:(store.appearance?.bubbleColor||'default')===c ? '#FFD700' : '#B8B8B8', fontSize:12 }}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{t('backgroundHex', language)}</Text>
              <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                <TextInput value={String(store.appearance?.backgroundColor||'')} onChangeText={(v)=>save({ appearance: { ...(store.appearance||{}), backgroundColor: v } })} placeholder="#0C0C0C" placeholderTextColor="#666" style={{ width:120, borderWidth:1, borderColor:'#2A2A2A', borderRadius:8, paddingHorizontal:10, paddingVertical:6, color:'#EEE', backgroundColor:'#151515' }} />
                <View style={{ width:20, height:20, borderRadius:4, borderWidth:1, borderColor:'#333', backgroundColor:String(store.appearance?.backgroundColor||'#0C0C0C') }} />
              </View>
            </View>
          </>
        );
    }
  };

  return (
    <ThemedView style={styles.container}>
      {/* 배경 흐림 */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
      <View style={styles.header} />
      {/* 고정 사이드 패널 (우측, 확장 폭) */}
      <View style={[styles.drawerPanel, { width: 320 }]}>
        <View style={{ paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth:1, borderBottomColor:'#1E1E1E', flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
          <View style={{ flexDirection:'row', alignItems:'center' }}>
            <Text style={{ color:'#FFD700', fontWeight:'800', marginRight: 6 }}>☰</Text>
            <Text style={{ color:'#F6F6F6', fontWeight:'700' }}>{t('chatSettings', language)}</Text>
          </View>
          <TouchableOpacity onPress={() => { /* 닫기 → 이전 페이지 */ try{ (history as any).back?.(); }catch{} }}>
            <Text style={{ color:'#FFD700' }}>✕</Text>
          </TouchableOpacity>
        </View>
        {/* 사용자 요약 영역 */}
        <View style={{ flexDirection:'row', alignItems:'center', paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth:1, borderBottomColor:'#1E1E1E', gap: 10 }}>
          {(() => {
            // 계정 프로필 사진(대시보드/계정 photoURL)을 우선 사용, 없으면 채팅 프로필 아바타로 폴백
            const avatarUri = (currentUser as any)?.photoURL || currentProfile?.avatar || '';
            if (avatarUri) {
              return (
                <Image source={{ uri: avatarUri }} style={{ width: 32, height: 32, borderRadius: 16, borderWidth:1, borderColor:'#444' }} />
              );
            }
            return (
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor:'#2A2A2A', alignItems:'center', justifyContent:'center', borderWidth:1, borderColor:'#444' }}>
                <Text style={{ color:'#FFD700', fontWeight:'800' }}>{(currentUser?.email||'?').charAt(0).toUpperCase()}</Text>
              </View>
            );
          })()}
          <View style={{ flex: 1 }}>
            <Text style={{ color:'#F6F6F6', fontWeight:'600' }}>{currentUser?.email || ''}</Text>
            <Text style={{ color:'#FFD700', fontWeight:'800' }}>{formatCurrency(total, currency, rates)}</Text>
            {isUserAdmin && (
              <Text style={{ color:'#FFD700', fontWeight:'700', fontSize: 11 }}>{(adminRole||'admin').replace('_',' ').toUpperCase()}</Text>
            )}
          </View>
        </View>
        {/* 메뉴 + 인라인 하위 메뉴 (스크롤 영역) */}
        <ScrollView style={{ flex:1 }} contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator persistentScrollbar>
          {/* 일반 */}
          <MenuItem title={t('menuGeneral', language)} active={menu==='general'} onPress={() => setMenu('general')} />
          {menu==='general' && (
            <View style={{ paddingHorizontal: 10, paddingVertical: 10, backgroundColor: '#000000', borderWidth: 1, borderColor: '#1E1E1E', borderRadius: 8, margin: 10, marginTop: 8 }}>
              {renderContent('general')}
            </View>
          )}
          {/* 알림 */}
          <MenuItem title={t('menuNotifications', language)} active={menu==='notifications'} onPress={() => setMenu('notifications')} />
          {menu==='notifications' && (
            <View style={{ paddingHorizontal: 10, paddingVertical: 10, backgroundColor: '#000000', borderWidth: 1, borderColor: '#1E1E1E', borderRadius: 8, margin: 10, marginTop: 8 }}>
              {renderContent('notifications')}
            </View>
          )}
          {/* 개인정보 */}
          <MenuItem title={t('menuPrivacy', language)} active={menu==='privacy'} onPress={() => setMenu('privacy')} />
          {menu==='privacy' && (
            <View style={{ paddingHorizontal: 10, paddingVertical: 10, backgroundColor: '#000000', borderWidth: 1, borderColor: '#1E1E1E', borderRadius: 8, margin: 10, marginTop: 8 }}>
              {renderContent('privacy')}
            </View>
          )}
          {/* 채팅 */}
          <MenuItem title={t('menuChat', language)} active={menu==='chat'} onPress={() => setMenu('chat')} />
          {menu==='chat' && (
            <View style={{ paddingHorizontal: 10, paddingVertical: 10, backgroundColor: '#000000', borderWidth: 1, borderColor: '#1E1E1E', borderRadius: 8, margin: 10, marginTop: 8 }}>
              {renderContent('chat')}
            </View>
          )}
          {/* 데이터 */}
          <MenuItem title={t('menuData', language)} active={menu==='data'} onPress={() => setMenu('data')} />
          {menu==='data' && (
            <View style={{ paddingHorizontal: 10, paddingVertical: 10, backgroundColor: '#000000', borderWidth: 1, borderColor: '#1E1E1E', borderRadius: 8, margin: 10, marginTop: 8 }}>
              {renderContent('data')}
            </View>
          )}
          {/* 모양 */}
          <MenuItem title={t('menuAppearance', language)} active={menu==='appearance'} onPress={() => setMenu('appearance')} />
          {menu==='appearance' && (
            <View style={{ paddingHorizontal: 10, paddingVertical: 10, backgroundColor: '#000000', borderWidth: 1, borderColor: '#1E1E1E', borderRadius: 8, margin: 10, marginTop: 8 }}>
              {renderContent('appearance')}
            </View>
          )}
        </ScrollView>
        <View style={{ paddingHorizontal: 10, paddingVertical: 12 }}>
          <TouchableOpacity onPress={() => { try { updateProfile({ tags }); alert(t('savedSettings', language)); (history as any).back?.(); } catch {} }} style={{ backgroundColor:'#D4AF37', paddingVertical: 12, borderRadius: 10, alignItems:'center' }}>
            <Text style={{ color:'#0C0C0C', fontWeight:'800' }}>{t('save', language)}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ThemedView>
  );
}

// duplicate definitions cleanup below

function PickerRow({ label, value, options, onChange }: { label: string; value: string; options: [string,string][]; onChange: (v:string)=>void }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={{ flexDirection:'row', alignItems:'center', gap: 8 }}>
        {options.map(([val, text]) => (
          <TouchableOpacity key={val} onPress={() => onChange(val)} style={{ paddingHorizontal:10, paddingVertical:6, borderRadius:14, borderWidth:1, borderColor: value===val ? '#FFD700' : '#2A2A2A', backgroundColor:'#141414' }}>
            <Text style={{ color: value===val ? '#FFD700' : '#B8B8B8', fontSize:12 }}>{text}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function MenuItem({ title, active, onPress }: { title: string; active?: boolean; onPress: ()=>void }) {
  return (
    <TouchableOpacity onPress={onPress} style={{ paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#1E1E1E', flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
      <Text style={{ color: active ? '#FFD700' : '#F6F6F6', fontSize: 14 }}>{title}</Text>
      <Text style={{ color: active ? '#FFD700' : '#777' }}>▶</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0C0C0C' },
  header: { height: 0 },
  title: { fontSize: 16, fontWeight: '700', color: '#F6F6F6' },
  section: { paddingHorizontal: 12, paddingVertical: 12 },
  sectionTitle: { color: '#CFCFCF', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  rowLabel: { color: '#F6F6F6' },
  drawerBackdrop: { position:'absolute', left:0, right:0, top:0, bottom:0, zIndex:20 },
  drawerBackdropTouch: { position:'absolute', left:0, right:0, top:0, bottom:0, backgroundColor:'rgba(0,0,0,0.35)' },
  drawerPanel: { position:'absolute', right:0, top:0, bottom:0, width: 240, backgroundColor:'#0F0F0F', borderLeftWidth:1, borderLeftColor:'#1E1E1E' },
});

function Row({ label, value, onChange }: { label: string; value: boolean; onChange: (v:boolean)=>void }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: '#D4AF37' }} thumbColor={value ? '#FFD700' : '#888'} />
    </View>
  );
}

// duplicate style block removed

// duplicate PickerRow removed

// duplicate MenuItem removed


