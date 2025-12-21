import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import React, { useState } from 'react';
import {
    Image,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

interface Friend {
  id: string;
  name: string;
  avatar?: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  lastActive?: number;
  isOnline: boolean;
}

interface FriendListModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function FriendListModal({ visible, onClose }: FriendListModalProps) {
  const [searchText, setSearchText] = useState('');
  const [selectedTab, setSelectedTab] = useState<'all' | 'online' | 'pending'>('all');

  // 임시 친구 데이터 (실제로는 스토어에서 가져와야 함)
  const friends: Friend[] = [
    {
      id: '1',
      name: '김철수',
      avatar: undefined,
      status: 'online',
      isOnline: true,
      lastActive: Date.now() - 300000, // 5분 전
    },
    {
      id: '2',
      name: '이영희',
      avatar: undefined,
      status: 'idle',
      isOnline: true,
      lastActive: Date.now() - 1800000, // 30분 전
    },
    {
      id: '3',
      name: '박민수',
      avatar: undefined,
      status: 'offline',
      isOnline: false,
      lastActive: Date.now() - 86400000, // 1일 전
    },
    {
      id: '4',
      name: '정수진',
      avatar: undefined,
      status: 'dnd',
      isOnline: true,
      lastActive: Date.now() - 600000, // 10분 전
    },
    {
      id: '5',
      name: '최동현',
      avatar: undefined,
      status: 'online',
      isOnline: true,
      lastActive: Date.now() - 120000, // 2분 전
    },
  ];

  const pendingFriends: Friend[] = [
    {
      id: '6',
      name: '홍길동',
      avatar: undefined,
      status: 'offline',
      isOnline: false,
    },
    {
      id: '7',
      name: '김영수',
      avatar: undefined,
      status: 'offline',
      isOnline: false,
    },
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online': return '🟢';
      case 'idle': return '🟡';
      case 'dnd': return '🔴';
      case 'offline': return '⚫';
      default: return '⚫';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'online': return '온라인';
      case 'idle': return '자리비움';
      case 'dnd': return '방해금지';
      case 'offline': return '오프라인';
      default: return '오프라인';
    }
  };

  const formatLastActive = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '방금 전';
    if (minutes < 60) return `${minutes}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    return `${days}일 전`;
  };

  const filteredFriends = friends.filter(friend =>
    friend.name.toLowerCase().includes(searchText.toLowerCase())
  );

  const onlineFriends = filteredFriends.filter(friend => friend.isOnline);
  const pendingFriendsFiltered = pendingFriends.filter(friend =>
    friend.name.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleFriendPress = (friend: Friend) => {
    // DM 시작 로직
    console.log('Start DM with:', friend.name);
  };

  const handleAcceptFriend = (friendId: string) => {
    // 친구 요청 수락 로직
    console.log('Accept friend request:', friendId);
  };

  const handleRejectFriend = (friendId: string) => {
    // 친구 요청 거절 로직
    console.log('Reject friend request:', friendId);
  };

  const renderFriendItem = (friend: Friend) => (
    <TouchableOpacity
      key={friend.id}
      style={styles.friendItem}
      onPress={() => handleFriendPress(friend)}
    >
      <View style={styles.friendAvatar}>
        {friend.avatar ? (
          <Image source={{ uri: friend.avatar }} style={styles.avatarImage} />
        ) : (
          <Text style={styles.avatarText}>👤</Text>
        )}
        <View style={styles.statusIndicator}>
          <Text style={styles.statusIcon}>{getStatusIcon(friend.status)}</Text>
        </View>
      </View>
      <View style={styles.friendInfo}>
        <ThemedText style={styles.friendName}>{friend.name}</ThemedText>
        <ThemedText style={styles.friendStatus}>
          {getStatusText(friend.status)}
          {friend.lastActive && !friend.isOnline && (
            <ThemedText style={styles.lastActive}>
              {' • '}{formatLastActive(friend.lastActive)}
            </ThemedText>
          )}
        </ThemedText>
      </View>
    </TouchableOpacity>
  );

  const renderPendingItem = (friend: Friend) => (
    <View key={friend.id} style={styles.pendingItem}>
      <View style={styles.friendAvatar}>
        {friend.avatar ? (
          <Image source={{ uri: friend.avatar }} style={styles.avatarImage} />
        ) : (
          <Text style={styles.avatarText}>👤</Text>
        )}
      </View>
      <View style={styles.friendInfo}>
        <ThemedText style={styles.friendName}>{friend.name}</ThemedText>
        <ThemedText style={styles.pendingText}>친구 요청 대기 중</ThemedText>
      </View>
      <View style={styles.pendingActions}>
        <TouchableOpacity
          style={styles.acceptButton}
          onPress={() => handleAcceptFriend(friend.id)}
        >
          <Text style={styles.acceptText}>수락</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.rejectButton}
          onPress={() => handleRejectFriend(friend.id)}
        >
          <Text style={styles.rejectText}>거절</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <ThemedView style={styles.modal}>
          {/* 헤더 */}
          <View style={styles.header}>
            <ThemedText style={styles.headerTitle}>친구 목록</ThemedText>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 검색 바 */}
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              value={searchText}
              onChangeText={setSearchText}
              placeholder="친구 검색..."
              placeholderTextColor="#666"
            />
          </View>

          {/* 탭 네비게이션 */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, selectedTab === 'all' && styles.activeTab]}
              onPress={() => setSelectedTab('all')}
            >
              <ThemedText style={[styles.tabText, selectedTab === 'all' && styles.activeTabText]}>
                전체 ({filteredFriends.length})
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, selectedTab === 'online' && styles.activeTab]}
              onPress={() => setSelectedTab('online')}
            >
              <ThemedText style={[styles.tabText, selectedTab === 'online' && styles.activeTabText]}>
                온라인 ({onlineFriends.length})
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, selectedTab === 'pending' && styles.activeTab]}
              onPress={() => setSelectedTab('pending')}
            >
              <ThemedText style={[styles.tabText, selectedTab === 'pending' && styles.activeTabText]}>
                대기 ({pendingFriendsFiltered.length})
              </ThemedText>
            </TouchableOpacity>
          </View>

          {/* 친구 목록 */}
          <ScrollView style={styles.friendList}>
            {selectedTab === 'all' && (
              <>
                {filteredFriends.length === 0 ? (
                  <View style={styles.emptyState}>
                    <ThemedText style={styles.emptyText}>친구가 없습니다</ThemedText>
                  </View>
                ) : (
                  filteredFriends.map(renderFriendItem)
                )}
              </>
            )}
            
            {selectedTab === 'online' && (
              <>
                {onlineFriends.length === 0 ? (
                  <View style={styles.emptyState}>
                    <ThemedText style={styles.emptyText}>온라인 친구가 없습니다</ThemedText>
                  </View>
                ) : (
                  onlineFriends.map(renderFriendItem)
                )}
              </>
            )}
            
            {selectedTab === 'pending' && (
              <>
                {pendingFriendsFiltered.length === 0 ? (
                  <View style={styles.emptyState}>
                    <ThemedText style={styles.emptyText}>대기 중인 친구 요청이 없습니다</ThemedText>
                  </View>
                ) : (
                  pendingFriendsFiltered.map(renderPendingItem)
                )}
              </>
            )}
          </ScrollView>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    height: '80%',
    backgroundColor: '#0C0C0C',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 2,
    borderTopColor: '#D4AF37',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F6F6F6',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  closeText: {
    fontSize: 16,
    color: '#D4AF37',
    fontWeight: 'bold',
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  searchInput: {
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#F6F6F6',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1A',
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 8,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  activeTab: {
    backgroundColor: '#D4AF37',
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
  friendList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#B8B8B8',
  },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  pendingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  friendAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    position: 'relative',
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarText: {
    fontSize: 24,
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#0C0C0C',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0C0C0C',
  },
  statusIcon: {
    fontSize: 8,
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F6F6F6',
    marginBottom: 2,
  },
  friendStatus: {
    fontSize: 12,
    color: '#B8B8B8',
  },
  lastActive: {
    fontSize: 12,
    color: '#666',
  },
  pendingText: {
    fontSize: 12,
    color: '#D4AF37',
  },
  pendingActions: {
    flexDirection: 'row',
    gap: 8,
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  acceptText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  rejectButton: {
    backgroundColor: '#F44336',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  rejectText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
});














