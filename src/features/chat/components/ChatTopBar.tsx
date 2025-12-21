import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useChatProfileStore } from '@/src/features/chat/store/chat-profile.store';
import { useNotificationStore } from '@/src/features/chat/store/notification.store';
import { firebaseAuth } from '@/lib/firebase';
import { router, usePathname } from 'expo-router';
import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePreferences } from '@/contexts/PreferencesContext';
import { t } from '@/i18n';

interface ChatTopBarProps {
  showBack?: boolean;
}

export function ChatTopBar({ showBack = false }: ChatTopBarProps) {
  const { currentProfile } = useChatProfileStore();
  const { notifications, unreadCount, markAsRead, deleteNotification, markAllAsRead } = useNotificationStore();
  const [open, setOpen] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = React.useState<Set<string>>(new Set());
  const pathname = usePathname?.() as string | undefined;
  const isFriends = String(pathname || '').startsWith('/chat/friends');
  const { language } = usePreferences();

  const handleSaveTreasure = async (n: any) => {
    try {
      const uid = firebaseAuth.currentUser?.uid || 'anonymous';
      const key = `u:${uid}:treasure.items`;
      const raw = await AsyncStorage.getItem(key);
      const list: any[] = raw ? JSON.parse(raw) : [];
      const contentStr = String(n?.content || '');
      const isLink = /^https?:\/\//i.test(contentStr);
      const item = { type: isLink ? 'link' : 'text', text: `${n?.title || ''}\n${contentStr}`.trim(), url: isLink ? contentStr : undefined, createdAt: Date.now() };
      list.unshift(item);
      await AsyncStorage.setItem(key, JSON.stringify(list));
      setSavedIds(prev => { const next = new Set(prev); next.add(n.id); return next; });
    } catch {}
  };

  const formatTime = (ts?: number) => {
    if (!ts) return '';
    try {
      return new Date(ts).toLocaleTimeString(language === 'ko' ? 'ko-KR' : language === 'ja' ? 'ja-JP' : language === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  return (
    <ThemedView style={[styles.header, isFriends && { justifyContent:'flex-start' }]}>
      <View style={styles.leftGroup}>
        {showBack ? (
          <TouchableOpacity onPress={() => router.back()}>
            <IconSymbol size={22} name="chevron.left" color="#D4AF37" />
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity 
          style={styles.profileButton}
          onPress={() => router.push('/chat/profile-settings')}
        >
          <View style={styles.profileImage}>
            {currentProfile?.avatar ? (
              <Image source={{ uri: currentProfile.avatar }} style={styles.profileImageInner} resizeMode="cover" />
            ) : (
              <Text style={styles.profileEmoji}>👤</Text>
            )}
          </View>
        </TouchableOpacity>

        <View style={[styles.profileMeta, { flex: 1 }]}> {/* 대화명 영역 최대 확장 */}
          <ThemedText style={styles.profileName} numberOfLines={1} ellipsizeMode="tail">
            {currentProfile?.displayName || t('username', language)}
          </ThemedText>
          <ThemedText style={styles.profileStatus} numberOfLines={1} ellipsizeMode="tail">
            {currentProfile?.customStatus ||
              (currentProfile?.status === 'online' && t('online', language)) ||
              (currentProfile?.status === 'idle' && t('idle', language)) ||
              (currentProfile?.status === 'dnd' && t('dnd', language)) ||
              t('offline', language)}
          </ThemedText>
        </View>
      </View>

      <View style={styles.headerIcons}>
        {/* 쪽지 아이콘 + 뱃지 */}
        <View style={{ position: 'relative' }}>
          <TouchableOpacity style={styles.headerIcon} onPress={() => setOpen(v => !v)}>
            <IconSymbol size={22} name="bell.fill" color="#B8B8B8" />
          </TouchableOpacity>
          {unreadCount > 0 && (
            <View style={styles.badge}><Text style={styles.badgeText}>{unreadCount}</Text></View>
          )}
        </View>
        <TouchableOpacity style={styles.headerIcon} onPress={() => router.push('/chat/rooms')}>
          <IconSymbol size={22} name="message.fill" color="#B8B8B8" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerIcon} onPress={() => router.push('/chat/friends')}>
          <IconSymbol size={22} name="person.2.fill" color="#B8B8B8" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerIcon} onPress={() => router.push('/chat/settings')}>
          <IconSymbol size={22} name="gearshape.fill" color="#B8B8B8" />
        </TouchableOpacity>
      </View>

      {/* 쪽지 패널 (항상 렌더, display로 토글) */}
      <TouchableOpacity 
        style={[styles.notiOverlay, { display: open ? 'flex' as const : 'none' as const }]}
        activeOpacity={1} 
        onPress={()=>setOpen(false)} 
      />
      <View style={[styles.notiPanel, { display: open ? 'flex' as const : 'none' as const }]} pointerEvents="auto">
        <View style={styles.notiHeader}>
          <Text style={{ color:'#E0E0E0', fontWeight:'600', fontSize: 13 }}>{t('notes', language)}</Text>
          <View style={{ flex:1 }} />
          <TouchableOpacity onPress={() => { try { markAllAsRead(); } catch {} }} style={[styles.notiAction,{ borderColor:'#77DD77' }]}><Text style={[styles.notiActionText,{ color:'#77DD77', fontWeight:'600' }]}>{t('markAllAsRead', language)}</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setOpen(false)} style={[styles.notiAction,{ borderColor:'#AEC6CF' }]}><Text style={[styles.notiActionText,{ color:'#AEC6CF', fontWeight:'600' }]}>{t('close', language)}</Text></TouchableOpacity>
        </View>
        <ScrollView style={{ maxHeight: 280 }} contentContainerStyle={{ paddingBottom: 10 }} showsVerticalScrollIndicator persistentScrollbar>
          {(notifications || []).length === 0 ? (
            <View style={{ alignItems:'center', paddingVertical: 18 }}><Text style={{ color:'#8A8A8A', fontSize: 12, fontWeight: '400' }}>{t('noNewNotes', language)}</Text></View>
          ) : (
            notifications.map((n, idx) => {
              const titleName = n.senderName || t('newMemo', language);
              const displayTitle = `${titleName}${n.timestamp ? ` - ${formatTime(n.timestamp)}` : ''}`;
              const isExpanded = expanded.has(n.id) || n.isRead;
              const saved = savedIds.has(n.id);
              const isLong = (n.content || '').length >= 50;
              return (
                <View key={n.id} style={[styles.notiItem, idx % 2 === 0 ? styles.notiEven : styles.notiOdd]}>
                  <TouchableOpacity onPress={() => setExpanded(prev => { const next = new Set(prev); next.has(n.id) ? next.delete(n.id) : next.add(n.id); return next; })} style={{ flex: 1 }}>
                    <Text style={[styles.notiTitle,{ fontWeight:'600' }]} numberOfLines={1}>{displayTitle}</Text>
                    <Text style={[styles.notiContent,{ color:'#BDBDBD', fontSize: 12 }]} numberOfLines={isExpanded ? undefined : 2}>{n.content}</Text>
                  </TouchableOpacity>
                  <View style={{ flexDirection:'row', alignItems:'center', gap: 6, flexWrap:'wrap' }}>
                    {!n.isRead && (
                      <TouchableOpacity onPress={() => { try { markAsRead(n.id); } catch {} ; setExpanded(prev => { const next = new Set(prev); next.add(n.id); return next; }); }} style={[styles.notiMiniBtn,{ borderColor:'#FFB3BA' }]}><Text style={[styles.notiMiniBtnText,{ color:'#FFB3BA', fontWeight:'600' }]}>{t('read', language)}</Text></TouchableOpacity>
                    )}
                    {isExpanded && isLong && (
                      <TouchableOpacity onPress={() => setExpanded(prev => { const next = new Set(prev); next.delete(n.id); return next; })} style={[styles.notiMiniBtn,{ borderColor:'#B0E0E6' }]}><Text style={[styles.notiMiniBtnText,{ color:'#B0E0E6', fontWeight:'600' }]}>{t('collapse', language)}</Text></TouchableOpacity>
                    )}
                    {!saved && (
                      <TouchableOpacity onPress={() => { try { handleSaveTreasure(n); } catch {} }} style={[styles.notiMiniBtn,{ borderColor:'#CFCFFF' }]}><Text style={[styles.notiMiniBtnText,{ color:'#CFCFFF', fontWeight:'600' }]}>{t('saveToTreasure', language)}</Text></TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => { try { deleteNotification(n.id); } catch {} }} style={[styles.notiMiniBtn,{ borderColor:'#E6E6FA' }]}><Text style={[styles.notiMiniBtnText,{ color:'#E6E6FA', fontWeight:'600' }]}>{t('delete', language)}</Text></TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 10, paddingTop: 8, paddingBottom: 6, // 세로 길이 최소화
    backgroundColor: '#0C0C0C', borderBottomWidth: 1, borderBottomColor: '#D4AF37',
  },
  leftGroup: { flexDirection: 'row', alignItems: 'center', flex: 6, minWidth: 0 },
  backButton: { fontSize: 18, color: '#D4AF37', fontWeight: '900', marginRight: 8 },
  profileButton: { width: 40, height: 40 },
  profileImage: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#D4AF37',
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFD700',
  },
  profileImageInner: { width: 36, height: 36, borderRadius: 18 },
  profileEmoji: { fontSize: 20 },
  profileMeta: { marginLeft: 6 }, // 간격 축소
  profileName: { fontSize: 15, fontWeight: 'bold', color: '#F6F6F6', lineHeight: 18 },
  profileStatus: { fontSize: 11, color: '#B8B8B8', marginTop: -2, lineHeight: 14, maxWidth: '100%', flexShrink: 1 }, // 한 줄 표시 + 잘림 처리
  logoContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 }, // 로고 좌우 여백 축소
  logoImage: { width: 56, height: 56 }, // 세로 높이 줄이기
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'flex-end', flex: 4, minWidth: 0 },
  headerIcon: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: '#D4AF37',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#0C0C0C',
  },
  badge: { position: 'absolute', right: -2, top: -2, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#FFD700', alignItems:'center', justifyContent:'center' },
  badgeText: { color:'#0C0C0C', fontSize: 10, fontWeight:'800', paddingHorizontal: 4 },
  notiPanel: { position:'absolute', left: 8, right: 8, top: 52, backgroundColor:'#0F0F0F', borderWidth:1, borderColor:'#FFFFFF', borderRadius:12, zIndex: 9999, padding: 10 },
  notiOverlay: { position:'absolute', left:0, right:0, top:0, bottom:0, zIndex: 9998 },
  notiHeader: { flexDirection:'row', alignItems:'center', marginBottom: 8 },
  notiAction: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth:1, borderColor:'#77DD77', marginLeft: 6 },
  notiActionText: { color:'#77DD77', fontWeight:'600', fontSize: 12 },
  notiItem: { flexDirection:'row', alignItems:'center', gap: 8, borderWidth:1, borderColor:'#1E1E1E', borderRadius: 10, padding: 8, marginBottom: 8, backgroundColor:'#101010' },
  notiEven: { backgroundColor: '#0E0E0E' },
  notiOdd: { backgroundColor: '#151515' },
  notiTitle: { color:'#F6F6F6', fontWeight:'700' },
  notiContent: { color:'#CFCFCF', fontSize: 12, marginTop: 2 },
  notiMiniBtn: { paddingHorizontal: 8, paddingVertical: 6, borderWidth:1, borderColor:'#CFCFFF', borderRadius: 8 },
  notiMiniBtnText: { color:'#CFCFFF', fontSize: 12, fontWeight:'600' },
});


