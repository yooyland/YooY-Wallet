import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { SecretChat, TTLMessage } from '../types';

// ===== 보안 채팅 스토어 상태 =====
interface SecurityState {
  // Secret Chats (Telegram 스타일)
  secretChats: SecretChat[];
  activeSecretChat: SecretChat | null;
  
  // TTL Messages
  ttlMessages: TTLMessage[];
  
  // 암호화 키 관리
  encryptionKeys: Record<string, string>; // chatId -> key
  keyExchangeStatus: Record<string, 'pending' | 'completed' | 'failed'>;
  
  // 보안 설정
  securitySettings: {
    autoDeleteMessages: boolean;
    forwardSecrecy: boolean;
    screenshotProtection: boolean;
    screenRecordingProtection: boolean;
    messageExpiration: number; // seconds
    encryptionLevel: 'basic' | 'e2e' | 'perfect_forward_secrecy';
  };
  
  // 감사 로그
  auditLog: AuditEntry[];
}

// ===== 감사 로그 엔트리 =====
interface AuditEntry {
  id: string;
  type: 'chat_created' | 'chat_deleted' | 'key_exchanged' | 'message_sent' | 'message_deleted' | 'security_violation';
  userId: string;
  chatId?: string;
  messageId?: string;
  details: string;
  timestamp: number;
  ipAddress?: string;
  deviceInfo?: string;
}

// ===== 액션 인터페이스 =====
interface SecurityActions {
  // Secret Chat 관리
  createSecretChat: (participants: string[]) => Promise<SecretChat>;
  deleteSecretChat: (chatId: string) => void;
  setActiveSecretChat: (chat: SecretChat | null) => void;
  updateSecretChat: (chatId: string, updates: Partial<SecretChat>) => void;
  
  // 암호화 키 관리
  generateEncryptionKey: (chatId: string) => Promise<string>;
  exchangeKeys: (chatId: string, publicKey: string) => Promise<boolean>;
  getEncryptionKey: (chatId: string) => string | null;
  rotateKey: (chatId: string) => Promise<string>;
  
  // TTL 메시지 관리
  sendTTLMessage: (message: Omit<TTLMessage, 'id' | 'createdAt'>) => Promise<TTLMessage>;
  deleteExpiredMessages: () => void;
  getTTLMessages: (channelId: string) => TTLMessage[];
  
  // 보안 설정
  updateSecuritySettings: (settings: Partial<SecurityState['securitySettings']>) => void;
  resetSecuritySettings: () => void;
  
  // 감사 로그
  addAuditEntry: (entry: Omit<AuditEntry, 'id' | 'timestamp'>) => void;
  getAuditLog: (userId?: string, chatId?: string) => AuditEntry[];
  clearAuditLog: () => void;
  
  // 보안 검증
  verifyMessageIntegrity: (messageId: string, hash: string) => boolean;
  checkSecurityViolations: () => SecurityViolation[];
  
  // 초기화
  initialize: () => Promise<void>;
  reset: () => void;
}

// ===== 보안 위반 타입 =====
interface SecurityViolation {
  id: string;
  type: 'screenshot_detected' | 'screen_recording_detected' | 'key_compromise' | 'unauthorized_access';
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId: string;
  chatId?: string;
  details: string;
  timestamp: number;
  resolved: boolean;
}

// ===== 스토어 구현 =====
export const useSecurityStore = create<SecurityState & SecurityActions>()(
  persist(
    (set, get) => ({
      // 초기 상태
      secretChats: [],
      activeSecretChat: null,
      ttlMessages: [],
      encryptionKeys: {},
      keyExchangeStatus: {},
      securitySettings: {
        autoDeleteMessages: true,
        forwardSecrecy: true,
        screenshotProtection: true,
        screenRecordingProtection: true,
        messageExpiration: 86400, // 24 hours
        encryptionLevel: 'e2e',
      },
      auditLog: [],

      // Secret Chat 관리
      createSecretChat: async (participants) => {
        const chatId = `secret_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const encryptionKey = await get().generateEncryptionKey(chatId);
        
        const secretChat: SecretChat = {
          id: chatId,
          participants,
          encryptionKey,
          isActive: true,
          createdAt: Date.now(),
          lastActivity: Date.now(),
        };
        
        set((state) => ({
          secretChats: [...state.secretChats, secretChat],
          activeSecretChat: secretChat,
        }));
        
        // 감사 로그 추가
        get().addAuditEntry({
          type: 'chat_created',
          userId: participants[0], // 첫 번째 참가자를 생성자로 간주
          chatId,
          details: `Secret chat created with ${participants.length} participants`,
        });
        
        return secretChat;
      },

      deleteSecretChat: (chatId) => {
        set((state) => ({
          secretChats: state.secretChats.filter(chat => chat.id !== chatId),
          activeSecretChat: state.activeSecretChat?.id === chatId ? null : state.activeSecretChat,
          encryptionKeys: Object.fromEntries(
            Object.entries(state.encryptionKeys).filter(([key]) => key !== chatId)
          ),
        }));
        
        // 감사 로그 추가
        get().addAuditEntry({
          type: 'chat_deleted',
          userId: 'system',
          chatId,
          details: 'Secret chat deleted',
        });
      },

      setActiveSecretChat: (chat) => set({ activeSecretChat: chat }),

      updateSecretChat: (chatId, updates) => set((state) => ({
        secretChats: state.secretChats.map(chat =>
          chat.id === chatId ? { ...chat, ...updates } : chat
        ),
        activeSecretChat: state.activeSecretChat?.id === chatId
          ? { ...state.activeSecretChat, ...updates }
          : state.activeSecretChat,
      })),

      // 암호화 키 관리
      generateEncryptionKey: async (chatId) => {
        // 실제 구현에서는 강력한 암호화 키 생성 로직 사용
        const key = `key_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
        
        set((state) => ({
          encryptionKeys: { ...state.encryptionKeys, [chatId]: key }
        }));
        
        return key;
      },

      exchangeKeys: async (chatId, publicKey) => {
        try {
          // 실제 구현에서는 키 교환 프로토콜 구현
          set((state) => ({
            keyExchangeStatus: { ...state.keyExchangeStatus, [chatId]: 'completed' }
          }));
          
          get().addAuditEntry({
            type: 'key_exchanged',
            userId: 'system',
            chatId,
            details: 'Encryption keys exchanged successfully',
          });
          
          return true;
        } catch (error) {
          set((state) => ({
            keyExchangeStatus: { ...state.keyExchangeStatus, [chatId]: 'failed' }
          }));
          return false;
        }
      },

      getEncryptionKey: (chatId) => {
        return get().encryptionKeys[chatId] || null;
      },

      rotateKey: async (chatId) => {
        const newKey = await get().generateEncryptionKey(chatId);
        
        get().addAuditEntry({
          type: 'key_exchanged',
          userId: 'system',
          chatId,
          details: 'Encryption key rotated for security',
        });
        
        return newKey;
      },

      // TTL 메시지 관리
      sendTTLMessage: async (messageData) => {
        const ttlMessage: TTLMessage = {
          ...messageData,
          id: `ttl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          createdAt: Date.now(),
          expiresAt: Date.now() + (messageData.ttlSeconds * 1000),
        };
        
        set((state) => ({
          ttlMessages: [...state.ttlMessages, ttlMessage]
        }));
        
        // 자동 삭제 타이머 설정
        setTimeout(() => {
          get().deleteExpiredMessages();
        }, messageData.ttlSeconds * 1000);
        
        return ttlMessage;
      },

      deleteExpiredMessages: () => {
        const now = Date.now();
        set((state) => ({
          ttlMessages: state.ttlMessages.filter(msg => msg.expiresAt > now)
        }));
      },

      getTTLMessages: (channelId) => {
        return get().ttlMessages.filter(msg => msg.channelId === channelId);
      },

      // 보안 설정
      updateSecuritySettings: (settings) => set((state) => ({
        securitySettings: { ...state.securitySettings, ...settings }
      })),

      resetSecuritySettings: () => set({
        securitySettings: {
          autoDeleteMessages: true,
          forwardSecrecy: true,
          screenshotProtection: true,
          screenRecordingProtection: true,
          messageExpiration: 86400,
          encryptionLevel: 'e2e',
        }
      }),

      // 감사 로그
      addAuditEntry: (entryData) => {
        const entry: AuditEntry = {
          ...entryData,
          id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
        };
        
        set((state) => ({
          auditLog: [entry, ...state.auditLog].slice(0, 1000) // 최대 1000개 유지
        }));
      },

      getAuditLog: (userId, chatId) => {
        const { auditLog } = get();
        return auditLog.filter(entry => {
          if (userId && entry.userId !== userId) return false;
          if (chatId && entry.chatId !== chatId) return false;
          return true;
        });
      },

      clearAuditLog: () => set({ auditLog: [] }),

      // 보안 검증
      verifyMessageIntegrity: (messageId, hash) => {
        // 실제 구현에서는 메시지 해시 검증 로직 구현
        return true;
      },

      checkSecurityViolations: () => {
        const violations: SecurityViolation[] = [];
        // 실제 구현에서는 보안 위반 검사 로직 구현
        return violations;
      },

      // 초기화
      initialize: async () => {
        // TTL 메시지 정리
        get().deleteExpiredMessages();
        
        // 보안 위반 검사
        const violations = get().checkSecurityViolations();
        if (violations.length > 0) {
          console.warn('Security violations detected:', violations);
        }
      },

      reset: () => set({
        secretChats: [],
        activeSecretChat: null,
        ttlMessages: [],
        encryptionKeys: {},
        keyExchangeStatus: {},
        securitySettings: {
          autoDeleteMessages: true,
          forwardSecrecy: true,
          screenshotProtection: true,
          screenRecordingProtection: true,
          messageExpiration: 86400,
          encryptionLevel: 'e2e',
        },
        auditLog: [],
      }),
    }),
    {
      name: 'yoo-security-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        securitySettings: state.securitySettings,
        auditLog: state.auditLog.slice(0, 100), // 최근 100개만 저장
      }),
    }
  )
);















