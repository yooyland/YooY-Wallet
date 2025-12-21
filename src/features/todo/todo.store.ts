import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type TodoPriority = 'low' | 'medium' | 'high';

export interface TodoItem {
  id: string;
  title: string;
  note?: string;
  labels?: string[];
  // 날짜는 문자열 또는 epoch(ms)로 저장될 수 있음 (기존 데이터 호환)
  dueDate?: number | string;
  priority?: TodoPriority;
  // 프로젝트명 (Inbox = All To-Do 집계)
  project?: string;
  completed: boolean;
  createdAt: number;
}

interface TodoState {
  items: TodoItem[];
}

interface TodoActions {
  add: (data: Omit<TodoItem, 'id' | 'createdAt' | 'completed'>) => TodoItem;
  toggle: (id: string) => void;
  remove: (id: string) => void;
  update: (id: string, updates: Partial<TodoItem>) => void;
  clearCompleted: () => void;
}

export const useTodoStore = create<TodoState & TodoActions>()(
  persist(
    (set, get) => ({
      items: [],

      add: (data) => {
        const item: TodoItem = {
          id: uuidv4(),
          title: data.title,
          note: data.note,
          labels: data.labels || [],
          // 문자열이면 그대로 저장(화면에서 파싱), 숫자면 epoch(ms)
          dueDate: (typeof (data as any).dueDate === 'number' || typeof (data as any).dueDate === 'string') ? (data as any).dueDate : undefined,
          priority: data.priority || 'medium',
          project: (data as any).project || 'Inbox',
          completed: false,
          createdAt: Date.now(),
        };
        set((s) => ({ items: [item, ...s.items] }));
        return item;
      },

      toggle: (id) => set((s) => ({
        items: s.items.map(i => i.id === id ? { ...i, completed: !i.completed } : i),
      })),

      remove: (id) => set((s) => ({ items: s.items.filter(i => i.id !== id) })),

      update: (id, updates) => set((s) => ({
        items: s.items.map(i => i.id === id ? { ...i, ...updates } : i),
      })),

      clearCompleted: () => set((s) => ({ items: s.items.filter(i => !i.completed) })),
    }),
    { name: 'yoo-todo-store', storage: createJSONStorage(() => AsyncStorage) }
  )
);
















