import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// ===== 알림 타입 =====
export interface Notification {
  id: string;
  type: 'message' | 'mention' | 'system' | 'room_invite';
  title: string;
  content: string;
  channelId?: string;
  senderId?: string;
  senderName?: string;
  timestamp: number;
  isRead: boolean;
  serverId?: string;
  /** 방 초대 알림일 때 입장할 채팅방 ID */
  roomId?: string;
}

// ===== 알림 스토어 상태 =====
interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
}

// ===== 알림 스토어 액션 =====
interface NotificationActions {
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'isRead'>) => void;
  markAsRead: (notificationId: string) => void;
  markAllAsRead: () => void;
  deleteNotification: (notificationId: string) => void;
  clearAllNotifications: () => void;
  getUnreadCount: () => number;
}

export const useNotificationStore = create<NotificationState & NotificationActions>()(
  persist(
    (set, get) => ({
      notifications: [],
      unreadCount: 0,

      addNotification: (notificationData) => set((state) => {
        const serverId = (notificationData as any).serverId;
        if (serverId && state.notifications.some((n) => n.serverId === serverId)) {
          return state;
        }
        const newNotification: Notification = {
          ...notificationData,
          id: (notificationData as any).id ?? uuidv4(),
          timestamp: typeof (notificationData as any).timestamp === 'number' ? (notificationData as any).timestamp : Date.now(),
          isRead: false,
        };
        const updatedNotifications = [newNotification, ...state.notifications];
        const unreadCount = updatedNotifications.filter(n => !n.isRead).length;
        return {
          notifications: updatedNotifications,
          unreadCount,
        };
      }),

      markAsRead: (notificationId) => set((state) => {
        const updatedNotifications = state.notifications.map(notification =>
          notification.id === notificationId
            ? { ...notification, isRead: true }
            : notification
        );
        const unreadCount = updatedNotifications.filter(n => !n.isRead).length;
        
        return {
          notifications: updatedNotifications,
          unreadCount,
        };
      }),

      markAllAsRead: () => set((state) => ({
        notifications: state.notifications.map(notification => ({
          ...notification,
          isRead: true,
        })),
        unreadCount: 0,
      })),

      deleteNotification: (notificationId) => set((state) => {
        const updatedNotifications = state.notifications.filter(
          notification => notification.id !== notificationId
        );
        const unreadCount = updatedNotifications.filter(n => !n.isRead).length;
        
        return {
          notifications: updatedNotifications,
          unreadCount,
        };
      }),

      clearAllNotifications: () => set({
        notifications: [],
        unreadCount: 0,
      }),

      getUnreadCount: () => {
        const state = get();
        return state.notifications.filter(n => !n.isRead).length;
      },
    }),
    {
      name: 'yoo-notification-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);














