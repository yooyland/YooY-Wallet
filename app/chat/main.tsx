import ChatBottomBar from '@/components/ChatBottomBar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import React, { useEffect, useState, Suspense } from 'react';
import { t } from '@/i18n';
import { usePreferences } from '@/contexts/PreferencesContext';
const NotificationModal = React.lazy(() => import('@/src/features/chat/components/NotificationModal'));
import { useChatProfileStore } from '@/src/features/chat/store/chat-profile.store';
import { useChatStore } from '@/src/features/chat/store/chat.store';
import { useNotificationStore } from '@/src/features/chat/store/notification.store';
import { useSecurityStore } from '@/src/features/chat/store/security.store';
import { router, Stack } from 'expo-router';
import { Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Dimensions, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
// import { ChatTopBar } from '@/src/features/chat/components/ChatTopBar';

export default function ChatMainScreen() {
  const { language } = usePreferences();
  const { 
    servers = [], 
    currentServer, 
    setCurrentServer,
    channels = [],
    currentChannel,
    setCurrentChannel,
    sidebarOpen,
    toggleSidebar,
    messages: messagesByChannel = {},
    sendMessage,
  } = useChatStore();
  const directMessages: any[] = (useChatStore() as any).directMessages || [];
  
  const { secretChats = [], activeSecretChat } = useSecurityStore();
  const { currentProfile, initialize } = useChatProfileStore();
  const { unreadCount, addNotification } = useNotificationStore();
  const [selectedTab, setSelectedTab] = useState<'servers' | 'direct' | 'secret'>('servers');
  const [messageText, setMessageText] = useState('');
  const channelMessages = currentChannel ? (messagesByChannel[currentChannel.id] || []) : [];
  const [showNotificationModal, setShowNotificationModal] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<'min' | 'basic' | 'mid' | 'max'>('basic');
  const [showCollapsedMenu, setShowCollapsedMenu] = useState(false);
  // Extra panels/modals
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [showServerEdit, setShowServerEdit] = useState(false);
  const [serverDesc, setServerDesc] = useState('');
  const [serverBanner, setServerBanner] = useState('');
  // (중복 제거됨)
  const [showServerModal, setShowServerModal] = useState(false);
  const [serverModalTab, setServerModalTab] = useState<'create' | 'join' | 'invite'>('create');
  const [newServerName, setNewServerName] = useState('새 서버');
  const [inviteCode, setInviteCode] = useState('');
  const [generatedInvite, setGeneratedInvite] = useState<string | null>(null);
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [newChannelName, setNewChannelName] = useState('new-channel');
  const [newChannelType, setNewChannelType] = useState<'text' | 'voice' | 'secret' | 'ttl'>('text');
  // sidebar mode persistence
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem('chat.sidebarMode');
        if (saved === 'min' || saved === 'basic' || saved === 'mid' || saved === 'max') {
          setSidebarMode(saved as any);
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try { await AsyncStorage.setItem('chat.sidebarMode', String(sidebarMode)); } catch {}
    })();
  }, [sidebarMode]);

  const isMobile = Dimensions.get('window').width <= 480;
  const modeToFlex = {
    min: { sidebar: 1, main: 9 },
    basic: { sidebar: 3, main: 7 },
    mid: isMobile ? { sidebar: 5, main: 5 } : { sidebar: 5, main: 5 },
    max: isMobile ? { sidebar: 7, main: 3 } : { sidebar: 8, main: 2 },
  } as const;
  const { sidebar: sidebarFlex, main: mainFlex } = modeToFlex[sidebarMode];

  useEffect(() => {
    initialize();
  }, [initialize]);

  const handleSendMessage = async () => {
    if (!messageText.trim() || !currentChannel) return;
    try {
      await sendMessage({
        content: messageText.trim(),
        senderId: currentProfile?.userId || 'current-user',
        channelId: currentChannel.id,
        type: 'text',
        reactions: [],
      } as any);
      addNotification({
        type: 'message',
        title: `#${currentChannel.name}`,
        content: messageText.trim(),
        channelId: currentChannel.id,
        senderId: currentProfile?.userId || 'current-user',
        senderName: currentProfile?.displayName || '사용자',
        serverId: currentServer?.id,
      });
    } finally {
      setMessageText('');
    }
  };

  const renderServerList = () => (
    <ScrollView style={styles.serverList}>
      {servers.map((server) => (
        <TouchableOpacity
          key={server.id}
          style={[
            styles.serverItem,
            currentServer?.id === server.id && styles.activeServerItem
          ]}
          onPress={() => setCurrentServer(server)}
        >
          <View style={styles.serverIcon}>
            <Text style={styles.serverIconText}>
              {server.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <ThemedText style={styles.serverName} numberOfLines={1}>{server.name}</ThemedText>
          {((server as any).settings?.invitePolicy === 'invite') && (
            <Text style={{ color: '#D4AF37', marginLeft: 6 }}>🔒</Text>
          )}
        </TouchableOpacity>
      ))}
      
      {/* 서버 추가 버튼 */}
      <TouchableOpacity 
        style={styles.addServerButton}
        onPress={() => router.push('/chat/create-server')}
      >
        <Text style={styles.addServerText}>+</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderChannelList = () => {
    if (!currentServer) return null;
    
    const serverChannels = channels.filter(ch => ch.serverId === currentServer.id);
    
    return (
      <ScrollView style={styles.channelList}>
              <View style={styles.channelSection}>
          <ThemedText style={styles.sectionTitle}>텍스트 채널</ThemedText>
          {serverChannels.filter(ch => ch.type === 'text').map((channel) => (
            <TouchableOpacity
              key={channel.id}
              style={[
                styles.channelItem,
                currentChannel?.id === channel.id && styles.activeChannelItem
              ]}
              onPress={() => { setCurrentChannel(channel); try { (useChatStore() as any).markChannelRead?.(channel.id); } catch {} }}
            >
              <Text style={styles.channelIcon}>#</Text>
              <ThemedText style={styles.channelName} numberOfLines={1} ellipsizeMode="tail">{channel.name}</ThemedText>
                    <View style={styles.channelActionsSmall}>
                      <TouchableOpacity style={styles.moveBtn} onPress={() => (useChatStore() as any).moveChannelUp?.(channel.id)}><Text style={styles.moveBtnText}>↑</Text></TouchableOpacity>
                      <TouchableOpacity style={styles.moveBtn} onPress={() => (useChatStore() as any).moveChannelDown?.(channel.id)}><Text style={styles.moveBtnText}>↓</Text></TouchableOpacity>
                    </View>
            </TouchableOpacity>
          ))}
        </View>
        
        <View style={styles.channelSection}>
          <ThemedText style={styles.sectionTitle}>음성 채널</ThemedText>
          {serverChannels.filter(ch => ch.type === 'voice').map((channel) => (
            <TouchableOpacity
              key={channel.id}
              style={styles.channelItem}
            >
              <Text style={styles.voiceIcon}>🔊</Text>
              <ThemedText style={styles.channelName} numberOfLines={1} ellipsizeMode="tail">{channel.name}</ThemedText>
            </TouchableOpacity>
          ))}
        </View>
        
        <View style={styles.channelSection}>
          <ThemedText style={styles.sectionTitle}>보안 채널</ThemedText>
          {serverChannels.filter(ch => ch.type === 'secret').map((channel) => (
            <TouchableOpacity
              key={channel.id}
              style={styles.channelItem}
            >
              <Text style={styles.secretIcon}>🔒</Text>
              <ThemedText style={styles.channelName} numberOfLines={1} ellipsizeMode="tail">{channel.name}</ThemedText>
            </TouchableOpacity>
          ))}
          
        </View>
        <TouchableOpacity style={styles.addChannelButton} onPress={() => setShowChannelModal(true)}>
          <Text style={styles.addChannelText}>+ 채널 생성</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  const renderDirectMessages = () => (
    <ScrollView style={styles.directList}>
      <ThemedText style={styles.sectionTitle}>다이렉트 메시지</ThemedText>
      {directMessages.map((dm) => (
        <TouchableOpacity
          key={dm.id}
          style={[styles.dmItem, currentChannel?.id === dm.id && styles.activeDmItem]}
          onPress={() => setCurrentChannel(dm)}
        >
          <View style={styles.dmAvatar}>
            <Text style={styles.dmAvatarText}>👤</Text>
          </View>
          <View style={styles.dmInfo}>
            <ThemedText style={styles.dmName}>
              {dm.participants.join(', ')}
            </ThemedText>
            <ThemedText style={styles.dmPreview}>
              {dm.lastMessagePreview || t('noMessages', language as any)}
            </ThemedText>
          </View>
        </TouchableOpacity>
      ))}
      
      {/* DM 추가 버튼 */}
              <TouchableOpacity 
               style={styles.addDmButton}
               onPress={() => router.push({ pathname: '/chat/create-dm' as any })}
             >
        <Text style={styles.addDmText}>+ DM 시작</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderSecretChats = () => (
    <ScrollView style={styles.secretList}>
      <ThemedText style={styles.sectionTitle}>비밀 채팅</ThemedText>
      {secretChats.map((chat) => (
        <TouchableOpacity
          key={chat.id}
          style={[
            styles.secretItem,
            activeSecretChat?.id === chat.id && styles.activeSecretItem
          ]}
        >
          <Text style={styles.secretIcon}>🔒</Text>
          <ThemedText style={styles.secretName}>
            비밀 채팅 {chat.participants.length}명
          </ThemedText>
        </TouchableOpacity>
      ))}
      
      {/* 비밀 채팅 추가 버튼 */}
      <TouchableOpacity 
        style={styles.addSecretButton}
        onPress={() => router.push({ pathname: '/chat/create-secret' as any })}
      >
        <Text style={styles.addSecretText}>+ 비밀 채팅</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderMainContent = () => {
    if (!currentChannel) {
      return (
        <View style={styles.emptyState}>
          <ThemedText style={styles.emptyTitle}>YooY Chat에 오신 것을 환영합니다!</ThemedText>
          <ThemedText style={styles.emptySubtitle}>
            {t('startChatHint', language as any)}
          </ThemedText>
        </View>
      );
    }

    return (
      <View style={styles.chatArea}>
        <View style={styles.chatHeader}>
          <ThemedText style={styles.channelTitle}>#{currentChannel.name}</ThemedText>
          <ThemedText style={styles.channelTopic}>{currentChannel.topic}</ThemedText>
        </View>
        
        <ScrollView style={styles.messagesArea}>
          {channelMessages.length === 0 ? (
            <ThemedText style={styles.placeholderText}>
              메시지를 입력하여 대화를 시작하세요...
            </ThemedText>
          ) : (
            channelMessages.map((message) => (
              <View key={message.id} style={styles.messageItem}>
                <View style={styles.messageHeader}>
                  <ThemedText style={styles.messageSender}>{message.senderId}</ThemedText>
                  <ThemedText style={styles.messageTime}>{new Date(message.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</ThemedText>
                </View>
                <ThemedText style={styles.messageContent}>{message.content}</ThemedText>
              </View>
            ))
          )}
        </ScrollView>
        
      </View>
    );
  };

  return (
    <>
      <ThemedView style={styles.container}>
      {/* 통합 헤더 */}
      <View style={styles.header}>
        {/* 좌측: 프로필(6) */}
        <View style={styles.headerLeft}>
          <TouchableOpacity 
            style={styles.profileButton}
            onPress={() => router.push('/chat/profile-settings')}
          >
            <View style={styles.profileImage}>
              {currentProfile?.avatar ? (
                <Image 
                  source={{ uri: currentProfile.avatar }} 
                  style={styles.profileImagePlaceholder}
                  resizeMode="cover"
                />
              ) : (
                <Text style={styles.profileText}>👤</Text>
              )}
            </View>
          </TouchableOpacity>
          {currentProfile && (
            <View style={styles.profilePreview}>
              <ThemedText style={styles.profilePreviewName}>{currentProfile.displayName}</ThemedText>
              <ThemedText style={styles.profilePreviewStatus}>{currentProfile.customStatus || '서버 채팅'}</ThemedText>
            </View>
          )}
        </View>
        {/* 우측: 아이콘(4) - 서버 제거 */}
        <View style={styles.headerIcons}>
          <TouchableOpacity style={styles.headerIcon} onPress={() => router.push({ pathname: '/chat/notifications' as any })}>
            <Text style={styles.iconText}>🔔</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIcon} onPress={() => router.push('/chat/friends')}>
            <Text style={styles.iconText}>👥</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIcon} onPress={() => router.push('/chat/rooms')}>
            <Text style={styles.iconText}>💬</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIcon} onPress={() => router.push({ pathname: '/chat/settings' as any })}>
            <Text style={styles.iconText}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 사이드바 + 메인 콘텐츠 */}
        <View style={styles.contentArea}>
        {/* 좌측: 서버/채널/DM/비밀 영역 */}
        <View style={[
          styles.sidebar,
          sidebarMode === 'min' ? styles.sidebarCollapsed : styles.sidebarBasic,
          sidebarMode === 'min' ? styles.sidebarCollapsedAbsolute : null
        ]}>
          {sidebarMode === 'min' ? (
            <>
              <TouchableOpacity style={styles.expandBtnBig} onPress={() => setSidebarMode('basic')}>
                <Text style={styles.expandBtnText}>{'>>'}</Text>
              </TouchableOpacity>
              <View style={styles.minServerList}>
                {servers.map((server: any, index: number) => (
                  <TouchableOpacity
                    key={server.id || index}
                    style={[styles.minServerItem, currentServer?.id === server.id && styles.minServerItemActive]}
                    onPress={() => setCurrentServer(server)}
                  >
                    <View style={[
                      styles.minServerDot,
                      { backgroundColor: ['#8B5CF6','#3B82F6','#10B981','#F59E0B','#EF4444','#06B6D4','#84CC16','#EC4899'][index % 8] }
                    ]} />
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : (
            <>
              {/* 사이드바 상단 컨트롤 */}
              <View style={styles.sidebarControls}>
                {/* 최소 / 기본 / 보통 / 최대 */}
                <TouchableOpacity style={[styles.modeBtn, (sidebarMode as any) === 'min' && styles.modeBtnActive]} onPress={() => setSidebarMode('min')}>
                  <Text style={[styles.modeBtnText, (sidebarMode as any) === 'min' && styles.modeBtnTextActive]}>—</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modeBtn, sidebarMode === 'basic' && styles.modeBtnActive]} onPress={() => setSidebarMode('basic')}>
                  <Text style={[styles.modeBtnText, sidebarMode === 'basic' && styles.modeBtnTextActive]}>◧</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modeBtn, sidebarMode === 'mid' && styles.modeBtnActive]} onPress={() => setSidebarMode('mid')}>
                  <Text style={[styles.modeBtnText, sidebarMode === 'mid' && styles.modeBtnTextActive]}>⧉</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modeBtn, sidebarMode === 'max' && styles.modeBtnActive]} onPress={() => setSidebarMode('max')}>
                  <Text style={[styles.modeBtnText, sidebarMode === 'max' && styles.modeBtnTextActive]}>▣</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
              </View>
              {/* 서버 액션 아이콘 탭 */}
              <View style={styles.sidebarControlsTabs}>
                <View style={{ flex: 1 }} />
                <TouchableOpacity style={styles.iconTab} onPress={() => setShowMembersModal(true)}>
                  <Text style={styles.iconTabText}>👥</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconTab} onPress={() => setShowSearchPanel(v=>!v)}>
                  <Text style={styles.iconTabText}>🔎</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconTab} onPress={() => setShowServerEdit(true)}>
                  <Text style={styles.iconTabText}>✎</Text>
                </TouchableOpacity>
              </View>
              {/* 서버 리스트 */}
              {renderServerList()}

              {/* 채널 리스트 */}
              {renderChannelList()}

              {/* DM 리스트 */}
              {renderDirectMessages()}

              {/* 비밀 채팅 */}
              {renderSecretChats()}

              {/* 사이드바 하단 */}
              <View style={styles.sidebarBottom}>
                <TouchableOpacity style={styles.expandBtn} onPress={() => router.push('/chat/create-channel')}>
                  <Text style={styles.expandBtnText}>+ 채널 추가</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* 우측: 메인 채팅 영역 */}
        <View style={[styles.mainContent, { flex: mainFlex }, sidebarMode === 'min' ? { marginLeft: 36 } : null]}>
          {renderMainContent()}
          {showSearchPanel && (
            <View style={styles.searchPanel}>
              <TextInput style={styles.searchField} value={searchText} onChangeText={setSearchText} placeholder="메시지/채널/사용자 검색" placeholderTextColor="#666" />
              <ScrollView style={{ maxHeight: 220 }}>
                <ThemedText style={styles.searchHint}>검색어: {searchText || '-'}</ThemedText>
              </ScrollView>
              <TouchableOpacity style={styles.searchClose} onPress={()=>setShowSearchPanel(false)}><Text style={styles.searchCloseText}>닫기</Text></TouchableOpacity>
            </View>
          )}
          {/* 메시지 입력 영역 - 대화창 영역 내부 */}
          <View style={styles.messageInputContainer}>
            <View style={styles.messageInput}>
              <TextInput
                style={styles.messageInputField}
                value={messageText}
                onChangeText={setMessageText}
                placeholder={t('messageInputPlaceholder', language as any)}
                placeholderTextColor="#666"
                multiline
                maxLength={1000}
              />
              <TouchableOpacity 
                style={styles.sendButton}
                onPress={handleSendMessage}
                disabled={!messageText.trim()}
              >
                <IconSymbol 
                  size={24} 
                  name="paperplane.fill" 
                  color={messageText.trim() ? '#FFD700' : '#666666'}
                  style={{ transform: [{ rotate: '-45deg' }] }}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
      </ThemedView>
      <ChatBottomBar active="chat" />
                  {/* 알림 모달 */}
                  {showNotificationModal && (
                    <Suspense fallback={null}>
                      <NotificationModal
                        visible={showNotificationModal}
                        onClose={() => setShowNotificationModal(false)}
                      />
                    </Suspense>
                  )}
                  {/* 멤버/역할 모달 */}
                  <Modal visible={showMembersModal} transparent animationType="fade" onRequestClose={() => setShowMembersModal(false)}>
                    <View style={styles.modalOverlay}>
                      <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>멤버 / 역할</Text>
                        <ScrollView style={{ maxHeight: 360 }}>
                          {(useChatStore() as any).serverMembers?.[currentServer?.id||'']?.map((m:any)=> (
                            <View key={m.userId} style={{ flexDirection:'row', alignItems:'center', paddingVertical:6 }}>
                              <Text style={{ color:'#F6F6F6', flex:1 }}>{(useChatStore() as any).users?.[m.userId]?.displayName || m.userId}</Text>
                              <TouchableOpacity style={styles.chip} onPress={()=>{ /* toggle role placeholder */ }}>
                                <Text style={styles.chipText}>역할 편집</Text>
                              </TouchableOpacity>
                            </View>
                          )) || <Text style={{ color:'#B8B8B8' }}>멤버 목록이 없습니다.</Text>}
                        </ScrollView>
                        <TouchableOpacity style={styles.modalClose} onPress={()=>setShowMembersModal(false)}><Text style={styles.modalCloseText}>닫기</Text></TouchableOpacity>
                      </View>
                    </View>
                  </Modal>
                  {/* 서버 설명/배너 편집 */}
                  <Modal visible={showServerEdit} transparent animationType="fade" onRequestClose={() => setShowServerEdit(false)}>
                    <View style={styles.modalOverlay}>
                      <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>서버 설명 / 배너</Text>
                        <Text style={styles.modalLabel}>설명</Text>
                        <TextInput style={styles.modalInput} value={serverDesc} onChangeText={setServerDesc} placeholder="설명" placeholderTextColor="#666" />
                        <Text style={styles.modalLabel}>배너 URL</Text>
                        <TextInput style={styles.modalInput} value={serverBanner} onChangeText={setServerBanner} placeholder="https://..." placeholderTextColor="#666" />
                        <TouchableOpacity style={styles.primaryBtn} onPress={()=>{ if(currentServer){ try { (useChatStore() as any).updateServer?.(currentServer.id,{ description: serverDesc, banner: serverBanner }); } catch {} } setShowServerEdit(false); }}>
                          <Text style={styles.primaryBtnText}>저장</Text>
                        </TouchableOpacity>
                        {/* 초대코드 관리(서버 소유자 전용, 비공개 서버일 때 표시) */}
                        {currentServer && ((currentServer as any).settings?.invitePolicy === 'invite') && (() => {
                          const store = (useChatStore() as any);
                          const currentUserId = store.currentUser?.id;
                          const isOwner = currentUserId && currentServer && (currentServer as any).ownerId === currentUserId;
                          if (!isOwner) return null;
                          const inviteList = (store.invites || []).filter((i:any) => i.serverId === currentServer.id);
                          return (
                            <View style={{ marginTop: 12 }}>
                              <Text style={styles.modalTitle}>초대코드 관리</Text>
                              <TouchableOpacity style={styles.primaryBtn} onPress={async()=>{ const inv = await store.createInvite?.(currentServer.id, currentChannel?.id); }}>
                                <Text style={styles.primaryBtnText}>새 초대코드 생성</Text>
                              </TouchableOpacity>
                              {inviteList.length === 0 ? (
                                <Text style={{ color:'#B8B8B8', marginTop: 8 }}>생성된 초대코드가 없습니다.</Text>
                              ) : (
                                <View style={{ marginTop: 8 }}>
                                  {inviteList.slice(0,5).map((i:any)=> (
                                    <View key={i.id} style={{ flexDirection:'row', justifyContent:'space-between', paddingVertical:6, borderBottomWidth:1, borderBottomColor:'#1F1F1F' }}>
                                      <Text style={{ color:'#FFD700' }}>{i.code}</Text>
                                      <Text style={{ color:'#666' }}>사용 {i.uses}/{i.maxUses ?? '∞'}</Text>
                                    </View>
                                  ))}
                                </View>
                              )}
                            </View>
                          );
                        })()}
                        <TouchableOpacity style={styles.modalClose} onPress={()=>setShowServerEdit(false)}><Text style={styles.modalCloseText}>닫기</Text></TouchableOpacity>
                      </View>
                    </View>
                  </Modal>
                  {/* 서버 모달 */}
                  <Modal visible={showServerModal} transparent animationType="fade" onRequestClose={() => setShowServerModal(false)}>
                    <View style={styles.modalOverlay}>
                      <View style={styles.modalCard}>
                        <View style={styles.modalTabs}>
                          {(['create','join','invite'] as const).map(tab => (
                            <TouchableOpacity key={tab} style={[styles.modalTab, serverModalTab===tab && styles.modalTabActive]} onPress={()=>setServerModalTab(tab)}>
                              <Text style={[styles.modalTabText, serverModalTab===tab && styles.modalTabTextActive]}>{tab==='create'?'서버 생성':tab==='join'?'참여':'초대'}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        {serverModalTab==='create' && (
                          <View style={styles.modalBody}>
                            <Text style={styles.modalLabel}>서버 이름</Text>
                            <TextInput style={styles.modalInput} value={newServerName} onChangeText={setNewServerName} />
                            <TouchableOpacity style={styles.primaryBtn} onPress={async ()=>{ const s=await (useChatStore() as any).createServer?.({ name:newServerName, description:'', icon:'', banner:'', ownerId:'me', members:[], channels:[], roles:[], categories:[], settings:{} } as any); setShowServerModal(false); }}>
                              <Text style={styles.primaryBtnText}>생성</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                        {serverModalTab==='join' && (
                          <View style={styles.modalBody}>
                            <Text style={styles.modalLabel}>초대 코드</Text>
                            <TextInput style={styles.modalInput} value={inviteCode} onChangeText={setInviteCode} />
                            <TouchableOpacity style={styles.primaryBtn} onPress={async ()=>{ await (useChatStore() as any).redeemInvite?.(inviteCode); setShowServerModal(false); }}>
                              <Text style={styles.primaryBtnText}>참여</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                        {serverModalTab==='invite' && (
                          <View style={styles.modalBody}>
                            <TouchableOpacity style={styles.primaryBtn} onPress={async ()=>{ if(!currentServer) return; const inv = await (useChatStore() as any).createInvite?.(currentServer.id, currentChannel?.id); setGeneratedInvite(inv?.code||null); }}>
                              <Text style={styles.primaryBtnText}>초대코드 생성</Text>
                            </TouchableOpacity>
                            {generatedInvite && <Text style={styles.modalInviteCode}>코드: {generatedInvite}</Text>}
                          </View>
                        )}
                        <TouchableOpacity style={styles.modalClose} onPress={()=>setShowServerModal(false)}><Text style={styles.modalCloseText}>닫기</Text></TouchableOpacity>
                      </View>
                    </View>
                  </Modal>
                  {/* 채널 모달 */}
                  <Modal visible={showChannelModal} transparent animationType="fade" onRequestClose={() => setShowChannelModal(false)}>
                    <View style={styles.modalOverlay}>
                      <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>채널 생성</Text>
                        <Text style={styles.modalLabel}>채널 이름</Text>
                        <TextInput style={styles.modalInput} value={newChannelName} onChangeText={setNewChannelName} />
                        <View style={styles.modalRow}>
                          {(['text','voice','secret','ttl'] as const).map(tp => (
                            <TouchableOpacity key={tp} style={[styles.chip, newChannelType===tp && styles.chipActive]} onPress={()=>setNewChannelType(tp)}>
                              <Text style={[styles.chipText, newChannelType===tp && styles.chipTextActive]}>{tp}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <TouchableOpacity style={styles.primaryBtn} onPress={async ()=>{ if(!currentServer) return; await (useChatStore() as any).createChannel?.({ name:newChannelName, type:newChannelType, serverId: currentServer.id, position: 0, permissions:[], settings:{} } as any); setShowChannelModal(false); }}>
                          <Text style={styles.primaryBtnText}>생성</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.modalClose} onPress={()=>setShowChannelModal(false)}><Text style={styles.modalCloseText}>닫기</Text></TouchableOpacity>
                      </View>
                    </View>
                  </Modal>
                  
                </>
              );
            }

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0C0C0C',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#0C0C0C',
    borderBottomWidth: 1,
    borderBottomColor: '#D4AF37',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 6,
    minWidth: 0,
  },
  profileButton: {
    width: 40,
    height: 40,
  },
  profileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#D4AF37',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  profileText: {
    fontSize: 20,
  },
  profileImagePlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  profileStatus: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#0C0C0C',
    borderWidth: 2,
    borderColor: '#0C0C0C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileStatusText: {
    fontSize: 8,
  },
  profilePreview: {
    marginLeft: 8,
    flex: 1,
    justifyContent: 'center',
  },
  profilePreviewName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F6F6F6',
    marginBottom: 2,
  },
  profilePreviewStatus: {
    fontSize: 12,
    color: '#B8B8B8',
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingHorizontal: 20,
  },
  logoImage: {
    width: 62,
    height: 62,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 4,
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  headerIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D4AF37',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0C0C0C',
  },
  iconText: {
    fontSize: 12,
  },
  contentArea: {
    flex: 1,
    flexDirection: 'row',
    paddingBottom: 50, // 하단바 높이만큼 패딩 추가
  },
  sidebar: {
    flex: 3, // 기본값(렌더 직후 sidebarMode로 덮어씀)
    backgroundColor: '#000000',
    borderRightWidth: 1,
    borderRightColor: '#D4AF37',
    flexDirection: 'column',
  },
  sidebarBasic: {
    minWidth: 220, // 3:7에서 측면 내용이 깨지지 않도록 최소 너비 보장
  },
  sidebarCollapsed: {
    width: 36,
    backgroundColor: '#000000',
    borderRightWidth: 1,
    borderRightColor: '#D4AF37',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 8,
  },
  sidebarCollapsedAbsolute: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 50, // 하단바 높이만큼 띄움
    zIndex: 100,
  },
  minServerList: {
    marginTop: 6,
    gap: 4,
    alignItems: 'center',
  },
  minChannelList: {
    marginTop: 8,
    alignItems: 'center',
    gap: 4,
  },
  minChannelItem: {
    width: 28,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0C0C0C',
  },
  minChannelItemActive: {
    borderColor: '#D4AF37',
    backgroundColor: '#1A1A1A',
  },
  minChannelText: {
    color: '#B8B8B8',
    fontSize: 10,
    fontWeight: '600',
  },
  minSidebarBottom: {
    position: 'absolute',
    bottom: 56, // 하단바 위로 살짝 띄움
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  minAddBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#D4AF37',
    alignItems: 'center',
    justifyContent: 'center',
  },
  minAddText: {
    color: '#D4AF37',
    fontSize: 16,
    fontWeight: 'bold',
  },
  minServerItem: {
    width: 28,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  minServerItemActive: {
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  minServerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  collapsedMenu: {
    marginTop: 8,
    gap: 6,
    alignItems: 'center',
  },
  sidebarContent: {
    flex: 1,
  },
  sidebarBottom: {
    padding: 8,
    borderTopWidth: 1,
    borderTopColor: '#2A2A2A',
  },
  mainContent: {
    flex: 7, // 기본값(렌더 직후 sidebarMode로 덮어씀)
    backgroundColor: '#0C0C0C',
    paddingBottom: 50, // 하단바 높이만큼 패딩 추가
  },
  sidebarSelectOnly: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  sidebarControls: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
    backgroundColor: '#111',
  },
  sidebarControlsTabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
    backgroundColor: '#0E0E0E',
    alignItems: 'center'
  },
  iconTab: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTabActive: {
    borderColor: '#D4AF37',
    backgroundColor: '#2A2A2A',
  },
  iconTabText: { color: '#B8B8B8', fontSize: 14 },
  iconTabTextActive: { color: '#FFD700', fontWeight: '700' },
  expandBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: '#3A3A3A',
  },
  expandBtnBig: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: '#3A3A3A',
  },
  expandBtnText: {
    color: '#D4AF37',
    fontSize: 12,
    fontWeight: '700',
  },
  modeBtn: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: '#3A3A3A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeBtnActive: {
    backgroundColor: '#D4AF37',
    borderColor: '#D4AF37',
  },
  modeBtnText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '600',
  },
  modeBtnTextActive: {
    color: '#0D0D0D',
  },
  minIcon: {
    fontSize: 14,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: '#D4AF37',
  },
  tab: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 4,
    marginHorizontal: 2,
  },
  activeTab: {
    backgroundColor: '#D4AF37',
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  tabText: {
    fontSize: 12,
    color: '#B8B8B8',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#0C0C0C',
    fontWeight: 'bold',
  },
  serverList: {
    padding: 8,
  },
  serverItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 8,
    marginBottom: 2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  activeServerItem: {
    backgroundColor: '#2A2A2A',
    borderColor: '#D4AF37',
  },
  serverIcon: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#D4AF37',
    marginRight: 8,
  },
  serverIconText: {
    display: 'none',
  },
  serverName: {
    fontSize: 13,
    color: '#F6F6F6',
    fontWeight: '500',
    flexShrink: 1,
  },
  addServerButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  addServerText: {
    color: '#D4AF37',
    fontSize: 18,
    fontWeight: 'bold',
  },
  addChannelButton: {
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  addChannelText: {
    color: '#D4AF37',
    fontSize: 14,
    fontWeight: '500',
  },
  // modal shared
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '92%',
    maxWidth: 420,
    backgroundColor: '#0C0C0C',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    padding: 16,
  },
  modalTitle: {
    color: '#F6F6F6',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  modalLabel: {
    color: '#B8B8B8',
    fontSize: 12,
    marginTop: 6,
    marginBottom: 4,
  },
  modalInput: {
    backgroundColor: '#1A1A1A',
    color: '#F6F6F6',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modalTabs: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  modalTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  modalTabActive: {
    backgroundColor: '#2A2A2A',
    borderColor: '#D4AF37',
  },
  modalTabText: { color: '#B8B8B8', fontSize: 12 },
  modalTabTextActive: { color: '#FFD700', fontWeight: '700' },
  modalBody: { marginTop: 6 },
  primaryBtn: {
    backgroundColor: '#D4AF37',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryBtnText: { color: '#0C0C0C', fontWeight: '700' },
  modalClose: { marginTop: 8, alignItems: 'center' },
  modalCloseText: { color: '#B8B8B8' },
  modalInviteCode: { color: '#FFD700', marginTop: 8, textAlign: 'center' },
  modalRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  chipActive: { backgroundColor: '#2A2A2A', borderColor: '#D4AF37' },
  chipText: { color: '#B8B8B8', fontSize: 12 },
  chipTextActive: { color: '#FFD700', fontWeight: '700' },
  directList: {
    flex: 1,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  dmItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    marginBottom: 4,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  activeDmItem: {
    backgroundColor: '#2A2A2A',
    borderColor: '#D4AF37',
  },
  dmAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#D4AF37',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  dmAvatarText: {
    fontSize: 16,
  },
  dmInfo: {
    flex: 1,
  },
  dmName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#F6F6F6',
    marginBottom: 2,
  },
  dmPreview: {
    fontSize: 12,
    color: '#B8B8B8',
  },
  addDmButton: {
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  addDmText: {
    color: '#D4AF37',
    fontSize: 14,
    fontWeight: '500',
  },
  secretList: {
    flex: 1,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  secretItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    marginBottom: 4,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  activeSecretItem: {
    backgroundColor: '#2A2A2A',
    borderColor: '#D4AF37',
  },
  secretIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  secretName: {
    fontSize: 14,
    color: '#F6F6F6',
  },
  addSecretButton: {
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  addSecretText: {
    color: '#D4AF37',
    fontSize: 14,
    fontWeight: '500',
  },
  channelList: {
    flex: 1,
    padding: 8,
  },
  channelSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 10,
    color: '#B8B8B8',
    fontWeight: '600',
    marginBottom: 4,
    paddingHorizontal: 6,
  },
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 4,
    marginBottom: 2,
    minWidth: 0,
  },
  channelActionsSmall: {
    flexDirection: 'row',
    gap: 4,
    marginLeft: 'auto',
  },
  moveBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  moveBtnText: {
    color: '#B8B8B8',
    fontSize: 10,
  },
  activeChannelItem: {
    backgroundColor: '#2A2A2A',
  },
  channelIcon: {
    fontSize: 16,
    color: '#B8B8B8',
    marginRight: 8,
  },
  voiceIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  channelName: {
    fontSize: 11,
    color: '#B8B8B8',
    flexShrink: 1,
    // RN에서는 텍스트 생략 처리는 컴포넌트 prop(numberOfLines)로 처리
  },
  
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#0C0C0C',
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#D4AF37',
    textAlign: 'center',
    marginBottom: 16,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#B8B8B8',
    textAlign: 'center',
    lineHeight: 24,
  },
  chatArea: {
    flex: 1,
  },
  chatHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  channelTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F6F6F6',
  },
  channelTopic: {
    fontSize: 14,
    color: '#B8B8B8',
    marginTop: 4,
  },
  messagesArea: {
    flex: 1,
    padding: 16,
    paddingBottom: 60, // 하단바 높이 + 여유 공간
  },
  searchPanel: {
    position: 'absolute',
    top: 8,
    right: 8,
    left: 8,
    borderRadius: 12,
    backgroundColor: '#0D0D0D',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    padding: 12,
  },
  searchField: {
    backgroundColor: '#1A1A1A',
    color: '#F6F6F6',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  searchHint: { color: '#B8B8B8', fontSize: 12 },
  searchClose: { marginTop: 8, alignItems: 'center' },
  searchCloseText: { color: '#B8B8B8' },
  messageInputContainer: {
    position: 'absolute',
    bottom: 0, // 대화창 영역 맨 아래
    left: 0,
    right: 0,
    paddingLeft: 4, // 왼쪽 여백 4px
    paddingRight: 0, // 우측 여백 0px로 변경
    paddingBottom: 4, // 아래쪽 여백 4px (2px + 2px 추가)
    zIndex: 1000,
  },
  messageInput: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingVertical: 2, // 위아래 2px
    paddingHorizontal: 8, // 좌우 8px
    backgroundColor: 'transparent',
  },
  placeholderText: {
    color: '#B8B8B8',
    fontSize: 14,
    textAlign: 'center',
  },
  messageItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  messageSender: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#D4AF37',
  },
  messageTime: {
    fontSize: 12,
    color: '#666',
  },
  messageContent: {
    fontSize: 14,
    color: '#F6F6F6',
    lineHeight: 20,
  },
  messageInputField: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D4AF37',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#F6F6F6',
    backgroundColor: '#1A1A1A',
    maxHeight: 100,
    marginRight: 8, // 보내기 버튼과의 간격만 유지
  },
  sendButton: {
    backgroundColor: 'transparent',
    paddingHorizontal: 8,
    paddingVertical: 8,
    marginLeft: 0, // 왼쪽 여백 0px
    marginRight: 0, // 우측 여백 0px
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 32,
    minHeight: 32,
  },
  notificationBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0C0C0C',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  // 로컬 하단바 스타일은 사용하지 않습니다. (AppBottomBar만 사용)
});
