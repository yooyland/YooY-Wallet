import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  Activity,
  Channel,
  Message,
  Notification,
  Presence,
  Reaction,
  Role,
  SearchResult,
  Server,
  ServerMember,
  User,
  VoiceChannel,
  Invite,
} from '../types';

// ===== 채팅 스토어 상태 =====
interface ChatState {
  // 사용자 정보
  currentUser: User | null;
  
  // 서버 시스템 (Discord 스타일)
  servers: Server[];
  currentServer: Server | null;
  
  // 채널 시스템
  channels: Channel[];
  currentChannel: Channel | null;
  voiceChannels: VoiceChannel[];
  
  // 메시지 시스템
  messages: Record<string, Message[]>; // channelId -> messages
  typingUsers: Record<string, string[]>; // channelId -> userIds
  
  // 사용자 및 상태
  users: Record<string, User>;
  presences: Record<string, Presence>;
  
  // 역할 및 권한
  roles: Record<string, Role[]>; // serverId -> roles
  serverMembers: Record<string, ServerMember[]>; // serverId -> members
  
  // 알림
  notifications: Notification[];
  unreadCounts: Record<string, number>; // channelId -> count
  invites: Invite[];
  
  // 검색
  searchResults: SearchResult | null;
  
  // UI 상태
  sidebarOpen: boolean;
  memberListOpen: boolean;
  settingsOpen: boolean;
}

// ===== 액션 인터페이스 =====
interface ChatActions {
  // 사용자 관리
  setCurrentUser: (user: User) => void;
  updateUserStatus: (userId: string, status: User['status']) => void;
  setCustomStatus: (userId: string, status: string) => void;
  
  // 서버 관리 (Discord 스타일)
  createServer: (server: Omit<Server, 'id' | 'createdAt'>) => Promise<Server>;
  joinServer: (serverId: string, inviteCode?: string) => Promise<void>;
  leaveServer: (serverId: string) => Promise<void>;
  updateServer: (serverId: string, updates: Partial<Server>) => void;
  deleteServer: (serverId: string) => void;
  setCurrentServer: (server: Server | null) => void;
  createInvite: (serverId: string, channelId?: string) => Promise<Invite>;
  redeemInvite: (code: string) => Promise<Server | null>;
  
  // 채널 관리
  createChannel: (channel: Omit<Channel, 'id' | 'createdAt'>) => Promise<Channel>;
  updateChannel: (channelId: string, updates: Partial<Channel>) => void;
  deleteChannel: (channelId: string) => void;
  setCurrentChannel: (channel: Channel | null) => void;
  moveChannelUp: (channelId: string) => void;
  moveChannelDown: (channelId: string) => void;
  
  // 메시지 관리
  sendMessage: (message: Omit<Message, 'id' | 'createdAt'>) => Promise<Message>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  addReaction: (messageId: string, emoji: string, userId: string) => void;
  removeReaction: (messageId: string, emoji: string, userId: string) => void;
  
  // 실시간 기능
  setTyping: (channelId: string, isTyping: boolean) => void;
  updatePresence: (userId: string, presence: Presence) => void;
  setActivity: (userId: string, activity: Activity) => void;
  
  // 권한 관리
  createRole: (serverId: string, role: Omit<Role, 'id' | 'createdAt'>) => Promise<Role>;
  updateRole: (roleId: string, updates: Partial<Role>) => void;
  deleteRole: (roleId: string) => void;
  assignRole: (userId: string, roleId: string) => void;
  removeRole: (userId: string, roleId: string) => void;
  
  // 알림 관리
  addNotification: (notification: Omit<Notification, 'id' | 'createdAt'>) => void;
  markNotificationRead: (notificationId: string) => void;
  markChannelRead: (channelId: string) => void;
  incrementUnread: (channelId: string) => void;
  
  // 검색
  searchMessages: (query: string, filters?: any) => Promise<SearchResult>;
  clearSearch: () => void;
  
  // UI 상태
  toggleSidebar: () => void;
  toggleMemberList: () => void;
  toggleSettings: () => void;
  
  // 초기화
  initialize: () => Promise<void>;
  reset: () => void;
}

// ===== 스토어 구현 =====
export const useChatStore = create<ChatState & ChatActions>()(
  persist(
    (set, get) => ({
      // 초기 상태
      currentUser: null,
      servers: [],
      currentServer: null,
      channels: [],
      currentChannel: null,
      voiceChannels: [],
      messages: {},
      typingUsers: {},
      users: {},
      presences: {},
      roles: {},
      serverMembers: {},
      notifications: [],
      unreadCounts: {},
      invites: [],
      searchResults: null,
      sidebarOpen: true,
      memberListOpen: false,
      settingsOpen: false,

      // 사용자 관리
      setCurrentUser: (user) => set({ currentUser: user }),
      
      updateUserStatus: (userId, status) => set((state) => ({
        users: {
          ...state.users,
          [userId]: { ...state.users[userId], status }
        }
      })),
      
      setCustomStatus: (userId, customStatus) => set((state) => ({
        users: {
          ...state.users,
          [userId]: { ...state.users[userId], customStatus }
        }
      })),

      // 서버 관리
      createServer: async (serverData) => {
        const server: Server = {
          ...serverData,
          id: `server_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          createdAt: Date.now(),
        };
        
        set((state) => ({
          servers: [...state.servers, server],
          currentServer: server,
        }));
        
        return server;
      },

      joinServer: async (serverId, inviteCode) => {
        // TODO: 서버 참여 로직 구현
        console.log('Joining server:', serverId, 'with invite:', inviteCode);
      },

      leaveServer: async (serverId) => {
        set((state) => ({
          servers: state.servers.filter(s => s.id !== serverId),
          currentServer: state.currentServer?.id === serverId ? null : state.currentServer,
        }));
      },

      updateServer: (serverId, updates) => set((state) => ({
        servers: state.servers.map(s => 
          s.id === serverId ? { ...s, ...updates } : s
        ),
        currentServer: state.currentServer?.id === serverId 
          ? { ...state.currentServer, ...updates }
          : state.currentServer,
      })),

      deleteServer: (serverId) => set((state) => ({
        servers: state.servers.filter(s => s.id !== serverId),
        currentServer: state.currentServer?.id === serverId ? null : state.currentServer,
      })),

      setCurrentServer: (server) => set({ currentServer: server }),
      createInvite: async (serverId, channelId) => {
        const invite: Invite = {
          id: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          code: Math.random().toString(36).slice(2, 8).toUpperCase(),
          serverId,
          channelId,
          inviterId: get().currentUser?.id || 'me',
          maxUses: 10,
          maxAge: 7 * 24 * 3600,
          temporary: false,
          uses: 0,
          createdAt: Date.now(),
        };
        set((state) => ({ invites: [invite, ...state.invites] }));
        return invite;
      },
      redeemInvite: async (code) => {
        const inv = get().invites.find(i => i.code === code);
        if (!inv) return null;
        const server = get().servers.find(s => s.id === inv.serverId) || null;
        if (server) {
          await get().joinServer(server.id, code);
        }
        return server;
      },

      // 채널 관리
      createChannel: async (channelData) => {
        const channel: Channel = {
          ...channelData,
          id: `channel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          createdAt: Date.now(),
        };
        
        set((state) => ({
          channels: [...state.channels, channel],
          currentChannel: channel,
        }));
        
        return channel;
      },

      updateChannel: (channelId, updates) => set((state) => ({
        channels: state.channels.map(c => 
          c.id === channelId ? { ...c, ...updates } : c
        ),
        currentChannel: state.currentChannel?.id === channelId 
          ? { ...state.currentChannel, ...updates }
          : state.currentChannel,
      })),

      deleteChannel: (channelId) => set((state) => ({
        channels: state.channels.filter(c => c.id !== channelId),
        currentChannel: state.currentChannel?.id === channelId ? null : state.currentChannel,
      })),

      setCurrentChannel: (channel) => set({ currentChannel: channel }),
      moveChannelUp: (channelId) => set((state) => {
        const idx = state.channels.findIndex(c => c.id === channelId);
        if (idx <= 0) return {} as any;
        const newList = [...state.channels];
        const tmp = newList[idx - 1];
        newList[idx - 1] = newList[idx];
        newList[idx] = tmp;
        return { channels: newList };
      }),
      moveChannelDown: (channelId) => set((state) => {
        const idx = state.channels.findIndex(c => c.id === channelId);
        if (idx < 0 || idx >= state.channels.length - 1) return {} as any;
        const newList = [...state.channels];
        const tmp = newList[idx + 1];
        newList[idx + 1] = newList[idx];
        newList[idx] = tmp;
        return { channels: newList };
      }),

      // 메시지 관리
      sendMessage: async (messageData) => {
        const message: Message = {
          ...messageData,
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          createdAt: Date.now(),
          reactions: [],
        };
        
        set((state) => ({
          messages: {
            ...state.messages,
            [messageData.channelId]: [
              ...(state.messages[messageData.channelId] || []),
              message
            ]
          },
          unreadCounts: { ...state.unreadCounts, [messageData.channelId]: 0 },
        }));
        
        return message;
      },

      editMessage: async (messageId, content) => {
        set((state) => {
          const newMessages = { ...state.messages };
          Object.keys(newMessages).forEach(channelId => {
            newMessages[channelId] = newMessages[channelId].map(msg =>
              msg.id === messageId ? { ...msg, content, editedAt: Date.now() } : msg
            );
          });
          return { messages: newMessages };
        });
      },

      deleteMessage: async (messageId) => {
        set((state) => {
          const newMessages = { ...state.messages };
          Object.keys(newMessages).forEach(channelId => {
            newMessages[channelId] = newMessages[channelId].filter(msg => msg.id !== messageId);
          });
          return { messages: newMessages };
        });
      },

      addReaction: (messageId, emoji, userId) => {
        set((state) => {
          const newMessages = { ...state.messages };
          Object.keys(newMessages).forEach(channelId => {
            newMessages[channelId] = newMessages[channelId].map(msg => {
              if (msg.id === messageId) {
                const existingReaction = msg.reactions.find(r => r.emoji === emoji);
                if (existingReaction) {
                  if (!existingReaction.users.includes(userId)) {
                    existingReaction.users.push(userId);
                    existingReaction.count++;
                  }
                } else {
                  msg.reactions.push({
                    emoji,
                    users: [userId],
                    count: 1,
                  });
                }
              }
              return msg;
            });
          });
          return { messages: newMessages };
        });
      },

      removeReaction: (messageId, emoji, userId) => {
        set((state) => {
          const newMessages = { ...state.messages };
          Object.keys(newMessages).forEach(channelId => {
            newMessages[channelId] = newMessages[channelId].map(msg => {
              if (msg.id === messageId) {
                const reaction = msg.reactions.find(r => r.emoji === emoji);
                if (reaction) {
                  reaction.users = reaction.users.filter(id => id !== userId);
                  reaction.count--;
                  if (reaction.count === 0) {
                    msg.reactions = msg.reactions.filter(r => r.emoji !== emoji);
                  }
                }
              }
              return msg;
            });
          });
          return { messages: newMessages };
        });
      },

      // 실시간 기능
      setTyping: (channelId, isTyping) => {
        const { currentUser } = get();
        if (!currentUser) return;

        set((state) => ({
          typingUsers: {
            ...state.typingUsers,
            [channelId]: isTyping
              ? [...(state.typingUsers[channelId] || []).filter(id => id !== currentUser.id), currentUser.id]
              : (state.typingUsers[channelId] || []).filter(id => id !== currentUser.id)
          }
        }));
      },

      updatePresence: (userId, presence) => set((state) => ({
        presences: { ...state.presences, [userId]: presence }
      })),

      setActivity: (userId, activity) => set((state) => ({
        presences: {
          ...state.presences,
          [userId]: {
            ...state.presences[userId],
            activities: [...(state.presences[userId]?.activities || []), activity]
          }
        }
      })),

      // 권한 관리
      createRole: async (serverId, roleData) => {
        const role: Role = {
          ...roleData,
          id: `role_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          createdAt: Date.now(),
        };
        
        set((state) => ({
          roles: {
            ...state.roles,
            [serverId]: [...(state.roles[serverId] || []), role]
          }
        }));
        
        return role;
      },

      updateRole: (roleId, updates) => set((state) => {
        const newRoles = { ...state.roles };
        Object.keys(newRoles).forEach(serverId => {
          newRoles[serverId] = newRoles[serverId].map(role =>
            role.id === roleId ? { ...role, ...updates } : role
          );
        });
        return { roles: newRoles };
      }),

      deleteRole: (roleId) => set((state) => {
        const newRoles = { ...state.roles };
        Object.keys(newRoles).forEach(serverId => {
          newRoles[serverId] = newRoles[serverId].filter(role => role.id !== roleId);
        });
        return { roles: newRoles };
      }),

      assignRole: (userId, roleId) => {
        // TODO: 역할 할당 로직 구현
        console.log('Assigning role:', roleId, 'to user:', userId);
      },

      removeRole: (userId, roleId) => {
        // TODO: 역할 제거 로직 구현
        console.log('Removing role:', roleId, 'from user:', userId);
      },

      // 알림 관리
      addNotification: (notificationData) => {
        const notification: Notification = {
          ...notificationData,
          id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          createdAt: Date.now(),
        };
        
        set((state) => ({
          notifications: [notification, ...state.notifications]
        }));
      },

      markNotificationRead: (notificationId) => set((state) => ({
        notifications: state.notifications.map(n =>
          n.id === notificationId ? { ...n, read: true } : n
        )
      })),

      markChannelRead: (channelId) => set((state) => ({
        unreadCounts: { ...state.unreadCounts, [channelId]: 0 }
      })),
      incrementUnread: (channelId) => set((state) => ({
        unreadCounts: { ...state.unreadCounts, [channelId]: (state.unreadCounts[channelId] || 0) + 1 }
      })),

      // 검색
      searchMessages: async (query, filters) => {
        // TODO: 검색 로직 구현
        const results: SearchResult = {
          messages: [],
          channels: [],
          users: [],
          servers: [],
        };
        
        set({ searchResults: results });
        return results;
      },

      clearSearch: () => set({ searchResults: null }),

      // UI 상태
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      toggleMemberList: () => set((state) => ({ memberListOpen: !state.memberListOpen })),
      toggleSettings: () => set((state) => ({ settingsOpen: !state.settingsOpen })),

      // 초기화
      initialize: async () => {
        // TODO: 초기화 로직 구현
        console.log('Initializing chat store...');
      },

      reset: () => set({
        currentUser: null,
        servers: [],
        currentServer: null,
        channels: [],
        currentChannel: null,
        voiceChannels: [],
        messages: {},
        typingUsers: {},
        users: {},
        presences: {},
        roles: {},
        serverMembers: {},
        notifications: [],
        unreadCounts: {},
        searchResults: null,
        sidebarOpen: true,
        memberListOpen: false,
        settingsOpen: false,
      }),
    }),
    {
      name: 'yoo-chat-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        currentUser: state.currentUser,
        servers: state.servers,
        currentServer: state.currentServer,
        channels: state.channels,
        currentChannel: state.currentChannel,
        users: state.users,
        roles: state.roles,
        serverMembers: state.serverMembers,
        notifications: state.notifications,
        unreadCounts: state.unreadCounts,
      }),
    }
  )
);