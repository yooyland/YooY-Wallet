import HamburgerMenu from '@/components/hamburger-menu';
import ProfileSheet from '@/components/profile-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import TopBar from '@/components/top-bar';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { t } from '@/i18n';
import { TodoItem, useTodoStore } from '@/src/features/todo/todo.store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Bell, BookOpen, CheckSquare, Clock, DollarSign, MoreHorizontal, Plus, Search, Settings, Star, StickyNote } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import {
    Dimensions,
    FlatList,
    Image,
    Modal,
    KeyboardAvoidingView,
    Keyboard,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    Alert
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

// Todoist 스타일 데이터 타입
interface TodoistItem extends TodoItem {
  priority: 1 | 2 | 3 | 4; // P1(빨강), P2(주황), P3(파랑), P4(회색)
  project?: string;
  dueDate?: string;
  labels?: string[];
  karma?: number;
}

// 일기 데이터 타입
interface DiaryEntry {
  id: string;
  date: string;
  title: string;
  content: string;
  mood: 'happy' | 'sad' | 'neutral' | 'excited' | 'tired';
  tags: string[];
  createdAt: string;
  fav?: boolean;
}

// 가계부 데이터 타입
interface ExpenseEntry {
  id: string;
  date: string;
  amount: number;
  category: 'food' | 'transport' | 'shopping' | 'entertainment' | 'health' | 'other' | 'salary' | 'bonus' | 'interest' | 'dividend' | 'investment' | 'gift';
  description: string;
  type: 'income' | 'expense';
  createdAt: string;
  fav?: boolean;
}

// 메모 데이터 타입
interface MemoEntry {
  id: string;
  title: string;
  content: string;
  color: string;
  fav?: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function TodoScreen() {
  const { currentUser } = useAuth();
  const { language, currency } = usePreferences();
  const { items, add, toggle, remove, update, clearCompleted } = useTodoStore();
  const insets = useSafeAreaInsets();
  // 키보드로 가려짐 방지: 실제 키보드 높이만큼 하단 패딩 추가
  const [keyboardInset, setKeyboardInset] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      const h = e?.endCoordinates?.height || 0;
      setKeyboardInset(h);
    });
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardInset(0));
    return () => { try { show.remove(); hide.remove(); } catch {} };
  }, []);
  // HHMM → HH:MM 자동 포맷터
  const formatHhMm = (raw: string) => {
    const d = String(raw || '').replace(/\D/g, '');
    if (d.length <= 2) return d;
    const hh = d.slice(0, 2);
    const mm = d.slice(2, 4);
    return `${hh}:${mm}`;
  };
  
  // TopBar 관련 상태
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [username, setUsername] = useState<string>('');
  
  // Load username on component mount
  React.useEffect(() => {
    (async () => {
      if (currentUser?.uid) {
        const info = await AsyncStorage.getItem(`u:${currentUser.uid}:profile.info`);
        if (info) {
          try {
            const parsedInfo = JSON.parse(info);
            setUsername(parsedInfo.username || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User');
          } catch {
            setUsername(currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User');
          }
        } else {
          setUsername(currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User');
        }
      }
    })();
  }, [currentUser?.uid]);
  
  // 검색 관련 상태
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // 설정 관련 상태
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  
  // 알람 관련 상태
  const [showAlarmModal, setShowAlarmModal] = useState(false);
  const [alarmTime, setAlarmTime] = useState('');
  const [alarmMessage, setAlarmMessage] = useState('');
  type AlarmEntry = { id: string; time: number; message: string; enabled: boolean; createdAt: number };
  const [alarms, setAlarms] = useState<AlarmEntry[]>([]);
  const [editingAlarm, setEditingAlarm] = useState<AlarmEntry | null>(null);
  const [alarmTick, setAlarmTick] = useState<number>(Date.now());
  
  // Todoist 스타일 상태
  const [query, setQuery] = useState('');
  const [selectedProject, setSelectedProject] = useState('Inbox');
  const [defaultProject, setDefaultProject] = useState('Inbox');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showProjectSelector, setShowProjectSelector] = useState(false);
  // Add modal - labels & due date pieces
  const [newTaskLabels, setNewTaskLabels] = useState<string>('');
  const [dueY, setDueY] = useState<string>('');
  const [dueM, setDueM] = useState<string>('');
  const [dueD, setDueD] = useState<string>('');
  const [dueH, setDueH] = useState<string>('');
  const [dueMin, setDueMin] = useState<string>('');
  const [dueS, setDueS] = useState<string>('');
  const [dueWithTime, setDueWithTime] = useState<boolean>(false);
  // 컨텍스트 메뉴/편집 상태
  const [showTaskMenu, setShowTaskMenu] = useState(false);
  const [taskMenu, setTaskMenu] = useState<any|null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editDraft, setEditDraft] = useState<any|null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string>('');
  const [karma, setKarma] = useState(0);
  // 완료 보기 토글: false=할일 목록, true=완료 목록
  const [showCompletedOnly, setShowCompletedOnly] = useState(false);
  const [todayTasks, setTodayTasks] = useState(0);
  
  // 탭 상태
  const [activeTab, setActiveTab] = useState<'todo' | 'diary' | 'money' | 'memo'>('todo');
  
  // 사이드바 상태 (채팅 방식 적용)
  const [sidebarMode, setSidebarMode] = useState<'min' | 'basic' | 'mid' | 'max'>('basic');
  const [showCollapsedMenu, setShowCollapsedMenu] = useState(false);
  
  // 사이드바 비율 설정 (채팅과 동일)
  const modeToFlex = {
    min: { sidebar: 1, main: 9 },
    basic: { sidebar: 3, main: 7 },
    mid: { sidebar: 5, main: 5 },
    max: { sidebar: 8, main: 2 },
  } as const;
  const { sidebar: sidebarFlex, main: mainFlex } = modeToFlex[sidebarMode];

  // 탭별 검색어
  const [diaryQuery, setDiaryQuery] = useState('');
  const [expenseQuery, setExpenseQuery] = useState('');
  const [memoQuery, setMemoQuery] = useState('');
  const [diaryMoodFilter, setDiaryMoodFilter] = useState<DiaryEntry['mood'] | null>(null);

  // Load & persist alarms
  useEffect(() => {
    (async () => {
      const uid = currentUser?.uid;
      const key = uid ? `u:${uid}:todo.alarms` : 'todo.alarms';
      try { const raw = await AsyncStorage.getItem(key); if (raw) setAlarms(JSON.parse(raw)); } catch {}
    })();
  }, [currentUser?.uid]);
  useEffect(() => { (async () => { const uid = currentUser?.uid; const key = uid ? `u:${uid}:todo.alarms` : 'todo.alarms'; try { await AsyncStorage.setItem(key, JSON.stringify(alarms)); } catch {} })(); }, [alarms, currentUser?.uid]);
  useEffect(() => { const id = setInterval(() => setAlarmTick(Date.now()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => {
    const now = Date.now();
    setAlarms(list => list.map(a => {
      if (a.enabled && a.time <= now) {
        // fire
        try {
          // Web Notification API
          if (typeof window !== 'undefined' && 'Notification' in window) {
            const n = (Notification as any);
            if (n && n.permission !== 'granted') { n.requestPermission?.(); }
            new Notification('Alarm', { body: a.message || 'Alarm' });
          } else {
            Alert.alert('Alarm', a.message || 'Alarm');
          }
        } catch { Alert.alert('Alarm', a.message || 'Alarm'); }
        return { ...a, enabled: false };
      }
      return a;
    }));
  }, [alarmTick]);

  const parseAlarmTime = (hhmm: string) => {
    const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(hhmm||'');
    if (!m) return null;
    const h = Math.min(23, Math.max(0, Number(m[1])));
    const min = Math.min(59, Math.max(0, Number(m[2])));
    const now = new Date();
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, min, 0, 0).getTime();
    return t <= now.getTime() ? new Date(now.getFullYear(), now.getMonth(), now.getDate()+1, h, min, 0, 0).getTime() : t;
  };

  // Avatar URI 로드
  React.useEffect(() => {
    (async () => {
      const uid = currentUser?.uid;
      const key = uid ? `u:${uid}:profile.photoUri` : 'profile.photoUri';
      const saved = await AsyncStorage.getItem(key);
      if (saved) setAvatarUri(saved);
    })();
  }, [currentUser]);

  // 기본 프로젝트 로드
  React.useEffect(() => {
    (async () => {
      const uid = currentUser?.uid;
      const key = uid ? `u:${uid}:defaultProject` : 'defaultProject';
      const saved = await AsyncStorage.getItem(key);
      if (saved) {
        setDefaultProject(saved);
        setSelectedProject(saved);
      }
    })();
  }, [currentUser]);

  // 프로젝트별 작업 개수 계산
  React.useEffect(() => {
    setProjects(prev => prev.map(project => {
      let count;
      if (project.name === 'Inbox') {
        // All To-Do에서는 전체 작업 개수 표시
        count = items.filter(item => !item.completed).length;
      } else {
        // 다른 프로젝트에서는 해당 프로젝트의 작업 개수만 표시
        count = items.filter(item => 
          !item.completed && (item as TodoistItem).project === project.name
        ).length;
      }
      return { ...project, count };
    }));
  }, [items]);
  
  // 새 작업 폼
  const [newTask, setNewTask] = useState({
    title: '',
    priority: 4 as 1 | 2 | 3 | 4,
    project: selectedProject,
    dueDate: '',
    note: ''
  });

  // 선택된 프로젝트가 변경될 때 newTask 프로젝트도 업데이트
  useEffect(() => {
    setNewTask(prev => ({ ...prev, project: selectedProject }));
  }, [selectedProject]);
  
  // 일기 상태
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([]);
  const [showDiaryModal, setShowDiaryModal] = useState(false);
  const [newDiaryEntry, setNewDiaryEntry] = useState({
    title: '',
    content: '',
    mood: 'neutral' as DiaryEntry['mood'],
    tags: [] as string[]
  });
  const [diaryPreview, setDiaryPreview] = useState<DiaryEntry|null>(null);
  
  // 가계부 상태
  const [expenseEntries, setExpenseEntries] = useState<ExpenseEntry[]>([]);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [newExpenseEntry, setNewExpenseEntry] = useState({
    amount: '',
    category: 'other' as ExpenseEntry['category'],
    description: '',
    type: 'expense' as ExpenseEntry['type']
  });
  
  // 카테고리 입력 상태
  const [customCategory, setCustomCategory] = useState('');
  const [showCustomCategory, setShowCustomCategory] = useState(false);
  const [selectedCategoryName, setSelectedCategoryName] = useState('');
  
  // 메모 상태
  const [memoEntries, setMemoEntries] = useState<MemoEntry[]>([]);
  const [showMemoModal, setShowMemoModal] = useState(false);
  const [newMemoEntry, setNewMemoEntry] = useState({
    title: '',
    content: '',
    color: '#FFD700'
  });
  const [memoPreview, setMemoPreview] = useState<MemoEntry|null>(null);
  // 편집 상태 (Diary / Expense / Memo)
  const [diaryEdit, setDiaryEdit] = useState<DiaryEntry|null>(null);
  const [expenseEdit, setExpenseEdit] = useState<ExpenseEntry|null>(null);
  const [memoEdit, setMemoEdit] = useState<MemoEntry|null>(null);
  // 컨텍스트 메뉴 대상
  const [diaryMenu, setDiaryMenu] = useState<DiaryEntry|null>(null);
  const [expenseMenu, setExpenseMenu] = useState<ExpenseEntry|null>(null);
  const [memoMenu, setMemoMenu] = useState<MemoEntry|null>(null);
  // 가계부 카테고리 상세 보기
  const [categoryDetail, setCategoryDetail] = useState<ExpenseEntry['category'] | null>(null);
  const [catYear, setCatYear] = useState<number>((new Date()).getFullYear());
  const [catMonth, setCatMonth] = useState<number>((new Date()).getMonth()+1);

  // 영구 저장/로드 (Diary, Expense, Memo)
  React.useEffect(() => {
    (async () => {
      const uid = currentUser?.uid;
      const dk = uid ? `u:${uid}:diary.entries` : 'diary.entries';
      const ek = uid ? `u:${uid}:money.entries` : 'money.entries';
      const mk = uid ? `u:${uid}:memo.entries` : 'memo.entries';
      try { const r = await AsyncStorage.getItem(dk); if (r) setDiaryEntries(JSON.parse(r)); } catch {}
      try { const r = await AsyncStorage.getItem(ek); if (r) setExpenseEntries(JSON.parse(r)); } catch {}
      try { const r = await AsyncStorage.getItem(mk); if (r) setMemoEntries(JSON.parse(r)); } catch {}
    })();
  }, [currentUser?.uid]);

  React.useEffect(() => {
    (async () => { try { const uid = currentUser?.uid; const k = uid ? `u:${uid}:diary.entries` : 'diary.entries'; await AsyncStorage.setItem(k, JSON.stringify(diaryEntries)); } catch {} })();
  }, [diaryEntries, currentUser?.uid]);
  React.useEffect(() => {
    (async () => { try { const uid = currentUser?.uid; const k = uid ? `u:${uid}:money.entries` : 'money.entries'; await AsyncStorage.setItem(k, JSON.stringify(expenseEntries)); } catch {} })();
  }, [expenseEntries, currentUser?.uid]);
  React.useEffect(() => {
    (async () => { try { const uid = currentUser?.uid; const k = uid ? `u:${uid}:memo.entries` : 'memo.entries'; await AsyncStorage.setItem(k, JSON.stringify(memoEntries)); } catch {} })();
  }, [memoEntries, currentUser?.uid]);
  
  // 프로젝트 목록 (관리 가능하도록 수정)
  const [projects, setProjects] = useState([
    { name: 'Inbox', color: '#8B5CF6', count: 0 },
    { name: 'Work', color: '#3B82F6', count: 0 },
    { name: 'Personal', color: '#10B981', count: 0 },
    { name: 'Shopping', color: '#F59E0B', count: 0 },
    { name: 'Health', color: '#EF4444', count: 0 },
    { name: 'Study', color: '#06B6D4', count: 0 },
    { name: 'Travel', color: '#8B5CF6', count: 0 },
    { name: 'Finance', color: '#10B981', count: 0 },
    { name: 'D-day', color: '#FF6B6B', count: 0 },
    { name: '기념일', color: '#EC4899', count: 0 }
  ]);

  // 프로젝트 관리 상태
  const [showProjectManagementModal, setShowProjectManagementModal] = useState(false);
  const [showDefaultProjectModal, setShowDefaultProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [editingProject, setEditingProject] = useState<{ name: string; color: string } | null>(null);

  // 기념일(Anniversary) 달력 상태
  const today = new Date();
  const [calYear, setCalYear] = useState<number>(today.getFullYear());
  const [calMonth, setCalMonth] = useState<number>(today.getMonth() + 1); // 1~12
  const [calDay, setCalDay] = useState<number>(today.getDate());

  const formatDate = (y:number, m:number, d:number) => `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const selectedDateKey = formatDate(calYear, calMonth, calDay);
  const isDdaySelected = selectedProject === 'D-day' || selectedProject === '기념일';
  const [clockTick, setClockTick] = useState<number>(Date.now());
  const [headerClockStr, setHeaderClockStr] = useState('00:00:00:00');
  const [headerClockColor, setHeaderClockColor] = useState<string>('#FFFFFF');

  // 기념일 날짜별 개수 집계(현재 선택 월)
  const annivCountsByDate: Record<string, number> = useMemo(() => {
    const counts: Record<string, number> = {};
    try {
      const monthPrefix = `${calYear}-${String(calMonth).padStart(2,'0')}-`;
      (items || []).forEach((it: any) => {
        // 기념일 및 D-day 프로젝트 모두 포함
        if ((it?.project !== '기념일' && it?.project !== 'D-day') || !it?.dueDate) return;
        const raw = String(it.dueDate);
        const onlyDate = raw.split(' ')[0];
        if (!onlyDate.startsWith(monthPrefix)) return;
        counts[onlyDate] = (counts[onlyDate] || 0) + 1;
      });
    } catch {}
    return counts;
  }, [items, calYear, calMonth]);

  // 날짜별 우선순위(가장 높은 우선순위=숫자 가장 작은 값) 매핑
  const dayPriorityByDate: Record<string, number> = useMemo(() => {
    const map: Record<string, number> = {};
    try {
      const monthPrefix = `${calYear}-${String(calMonth).padStart(2,'0')}-`;
      (items || []).forEach((it: any) => {
        if ((it?.project !== '기념일' && it?.project !== 'D-day') || !it?.dueDate) return;
        const raw = String(it.dueDate);
        const onlyDate = raw.split(' ')[0];
        if (!onlyDate.startsWith(monthPrefix)) return;
        const priority = Number(it?.priority || 4);
        map[onlyDate] = map[onlyDate] ? Math.min(map[onlyDate], priority) : priority;
      });
    } catch {}
    return map;
  }, [items, calYear, calMonth]);

  // 공용 틱(모든 시계가 같은 틱으로 갱신되도록)
  useEffect(() => {
    const id = setInterval(() => setClockTick(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  const parseDueDate = (raw?: string) => {
    if (!raw) return null;
    try {
      const s = String(raw).trim();
      // 날짜만 있는 경우(YYYY-MM-DD 또는 YYYY/MM/DD): 로컬 자정으로 설정
      const m1 = s.match(/^(\d{4})[-\/.](\d{2})[-\/.](\d{2})$/);
      if (m1) {
        const y = Number(m1[1]);
        const m = Number(m1[2]);
        const d = Number(m1[3]);
        return new Date(y, m - 1, d, 0, 0, 0, 0);
      }
      // 공백 구분 시각 포함 -> ISO 형태로 보정
      const iso = s.includes(' ') ? s.replace(' ', 'T') : s;
      const d = new Date(iso);
      if (isNaN(d.getTime())) return null;
      return d;
    } catch {
      return null;
    }
  };

  const formatClock = (msDiff: number) => {
    const t = Math.abs(msDiff);
    const hh = String(Math.floor(t / 3600000) % 100).padStart(2, '0');
    const mm = String(Math.floor((t % 3600000) / 60000)).padStart(2, '0');
    const ss = String(Math.floor((t % 60000) / 1000)).padStart(2, '0');
    const cc = String(Math.floor((t % 1000) / 10)).padStart(2, '0');
    return `${hh}:${mm}:${ss}:${cc}`;
  };

  const formatDateTime = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${y}/${m}/${day}  ${hh}:${mm}:${ss}`;
  };


  // 아이템별 차이(YY/MM/DD + HH:MM:SS) 계산
  const getItemDiffParts = (due?: string) => {
    const target = parseDueDate(due);
    const now = new Date(clockTick);
    if (!target) return { ymd: '00/00/00', hms: '00:00:00', color: '#FFFFFF' };
    const isPast = now.getTime() >= target.getTime();
    const start = isPast ? target : now;
    const end = isPast ? now : target;

    const pad2 = (n: number) => String(n).padStart(2, '0');
    const padY = (n: number) => (String(n).length < 2 ? pad2(n) : String(n));

    // Years
    let years = end.getFullYear() - start.getFullYear();
    let test = new Date(start);
    test.setFullYear(test.getFullYear() + years);
    if (test > end) { years--; test = new Date(start); test.setFullYear(test.getFullYear() + years); }

    // Months (0-11)
    let months = 0;
    while (true) {
      const t2 = new Date(test);
      t2.setMonth(t2.getMonth() + months + 1);
      if (t2 <= end) months++; else break;
      if (months > 11) break;
    }
    test.setMonth(test.getMonth() + months);

    // Days
    let days = 0;
    while (true) {
      const t3 = new Date(test);
      t3.setDate(t3.getDate() + days + 1);
      if (t3 <= end) days++; else break;
    }
    test.setDate(test.getDate() + days);

    // Remainder time
    let remMs = end.getTime() - test.getTime();
    if (remMs < 0) remMs = 0;
    const hh = Math.floor(remMs / 3600000); remMs %= 3600000;
    const mm = Math.floor(remMs / 60000); remMs %= 60000;
    const ss = Math.floor(remMs / 1000);

    const ymd = `${padY(years)}/${pad2(months)}/${pad2(days)}`;
    const hms = `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
    const color = years === 0 && months === 0 && days === 0 ? '#FFFFFF' : (isPast ? '#3B82F6' : '#EF4444');
    return { ymd, hms, color };
  };

  const daysInMonth = (y:number, m:number) => new Date(y, m, 0).getDate();
  const startDow = (y:number, m:number) => new Date(y, m - 1, 1).getDay(); // 0=Sun

  // Todoist 스타일 필터링
  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    let filteredItems = items
      .filter(i => i.title.toLowerCase().includes(q) || (i.note || '').toLowerCase().includes(q))
      .filter(i => showCompletedOnly ? i.completed : !i.completed); // 보기 모드에 따라 필터링
    
    // All To-Do (Inbox)가 아닌 경우 해당 프로젝트의 작업만 필터링
    if (selectedProject !== 'Inbox') {
      filteredItems = filteredItems.filter(i => (i as TodoistItem).project === selectedProject);
    }
    // 기념일 프로젝트에서는 달력에서 선택한 날짜의 항목만 보기
    if (selectedProject === '기념일') {
      filteredItems = filteredItems.filter(i => {
        const raw = String((i as any).dueDate || '');
        const onlyDate = raw.split(' ')[0];
        return onlyDate === selectedDateKey;
      });
    }
    
    return filteredItems;
  }, [items, query, selectedProject, showCompletedOnly, selectedDateKey]);

  // 헤더용 타겟 날짜 선택 (기념일: 캘린더 선택일, D-day: 가장 가까운 일정)
  const headerTargetDate = useMemo(() => {
    if (!isDdaySelected) return null;
    if (selectedProject === '기념일') {
      return parseDueDate(selectedDateKey) || null;
    }
    // D-day: 필터된 아이템들 중 가장 가까운 dueDate 선택
    const candidates = filtered
      .map(i => parseDueDate((i as any).dueDate))
      .filter(Boolean) as Date[];
    if (candidates.length === 0) return null;
    const now = Date.now();
    const future = candidates
      .filter(d => d.getTime() >= now)
      .sort((a,b)=> a.getTime() - b.getTime());
    if (future.length > 0) return future[0];
    const past = candidates.sort((a,b)=> b.getTime() - a.getTime());
    return past[0];
  }, [isDdaySelected, selectedProject, selectedDateKey, filtered]);

  // 헤더 시계 업데이트 및 색상
  useEffect(() => {
    if (!isDdaySelected || !headerTargetDate) {
      setHeaderClockStr(formatDateTime(new Date(clockTick)));
      setHeaderClockColor('#FFFFFF');
      return;
    }
    setHeaderClockStr(formatDateTime(new Date(clockTick)));
    const today0 = new Date();
    const base0 = new Date(headerTargetDate);
    today0.setHours(0,0,0,0);
    base0.setHours(0,0,0,0);
    const dayDiff = Math.ceil((base0.getTime() - today0.getTime()) / (1000*60*60*24));
    if (dayDiff > 0) setHeaderClockColor('#EF4444');
    else if (dayDiff < 0) setHeaderClockColor('#3B82F6');
    else setHeaderClockColor('#FFFFFF');
  }, [isDdaySelected, headerTargetDate, clockTick]);

  // 우선순위 색상
  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 1: return '#EF4444'; // 빨강
      case 2: return '#F59E0B'; // 주황
      case 3: return '#3B82F6'; // 파랑
      case 4: return '#6B7280'; // 회색
      default: return '#6B7280';
    }
  };

  // 새 작업 추가
  const addNewTask = () => {
    if (!newTask.title.trim()) return;
    const pad = (v: string) => (v && v.length===1? `0${v}`: v||'');
    let builtDue = '';
    if (dueY && dueM && dueD) {
      builtDue = `${dueY}-${pad(dueM)}-${pad(dueD)}`;
      if (dueWithTime) {
        builtDue += ` ${pad(dueH||'0')}:${pad(dueMin||'0')}:${pad(dueS||'0')}`;
      }
    }
    
    const taskData = {
      title: newTask.title.trim(),
      note: newTask.note,
      priority: newTask.priority,
      project: newTask.project,
      dueDate: builtDue || newTask.dueDate,
      labels: newTaskLabels.split(',').map(x=>x.trim()).filter(Boolean)
    };
    
    add(taskData);
    setNewTask({ title: '', priority: 4, project: selectedProject, dueDate: '', note: '' });
    setNewTaskLabels('');
    setDueY(''); setDueM(''); setDueD(''); setDueH(''); setDueMin(''); setDueS(''); setDueWithTime(false);
    setShowAddModal(false);
    
    // Karma 포인트 증가
    setKarma(prev => prev + 1);
  };

  // 작업 완료 처리
  const handleTaskComplete = (item: TodoItem) => {
    toggle(item.id);
    if (!item.completed) {
      setKarma(prev => prev + 1);
    }
  };

  // 자연어 날짜 파싱 (간단한 버전)
  const parseNaturalDate = (text: string) => {
    const lower = text.toLowerCase();
    if (lower.includes('내일')) return 'tomorrow';
    if (lower.includes('다음 주')) return 'next week';
    if (lower.includes('오늘')) return 'today';
    return '';
  };

  // 일기 추가
  const addDiaryEntry = () => {
    if (!newDiaryEntry.title.trim() || !newDiaryEntry.content.trim()) return;
    
    const entry: DiaryEntry = {
      id: Date.now().toString(),
      date: new Date().toISOString().split('T')[0],
      title: newDiaryEntry.title.trim(),
      content: newDiaryEntry.content.trim(),
      mood: newDiaryEntry.mood,
      tags: newDiaryEntry.tags,
      createdAt: new Date().toISOString()
    };
    
    setDiaryEntries(prev => [entry, ...prev]);
    setNewDiaryEntry({ title: '', content: '', mood: 'neutral', tags: [] });
    setShowDiaryModal(false);
  };

  // 가계부 항목 추가
  const addExpenseEntry = () => {
    if (!newExpenseEntry.amount.trim() || !newExpenseEntry.description.trim()) return;
    
    // 천단위 구분 제거하고 숫자로 변환
    const numericAmount = parseFloat(newExpenseEntry.amount.replace(/,/g, ''));
    
    // 카테고리 결정 (커스텀 카테고리가 있으면 사용, 없으면 기본 카테고리)
    const finalCategory = showCustomCategory && customCategory.trim() 
      ? customCategory.trim() as ExpenseEntry['category']
      : newExpenseEntry.category;
    
    const entry: ExpenseEntry = {
      id: Date.now().toString(),
      date: new Date().toISOString().split('T')[0],
      amount: numericAmount,
      category: finalCategory,
      description: newExpenseEntry.description.trim(),
      type: newExpenseEntry.type,
      createdAt: new Date().toISOString()
    };
    
    setExpenseEntries(prev => [entry, ...prev]);
    setNewExpenseEntry({ amount: '', category: 'other', description: '', type: 'expense' });
    setCustomCategory('');
    setShowCustomCategory(false);
    setShowExpenseModal(false);
  };

  // 메모 추가
  const addMemoEntry = () => {
    if (!newMemoEntry.title.trim() || !newMemoEntry.content.trim()) return;
    
    const entry: MemoEntry = {
      id: Date.now().toString(),
      title: newMemoEntry.title.trim(),
      content: newMemoEntry.content.trim(),
      color: newMemoEntry.color,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    setMemoEntries(prev => [entry, ...prev]);
    setNewMemoEntry({ title: '', content: '', color: '#FFD700' });
    setShowMemoModal(false);
  };

  // 기분 색상
  const getMoodColor = (mood: DiaryEntry['mood']) => {
    switch (mood) {
      case 'happy': return '#10B981';
      case 'sad': return '#EF4444';
      case 'excited': return '#F59E0B';
      case 'tired': return '#6B7280';
      default: return '#3B82F6';
    }
  };

  // 카테고리 색상
  const getCategoryColor = (category: ExpenseEntry['category']) => {
    switch (category) {
      case 'food': return '#EF4444';
      case 'transport': return '#3B82F6';
      case 'shopping': return '#8B5CF6';
      case 'entertainment': return '#F59E0B';
      case 'health': return '#10B981';
      // income-related (highly distinguishable palette)
      case 'salary': return '#F59E0B';      // Amber (급여)
      case 'bonus': return '#8B5CF6';       // Violet (보너스)
      case 'interest': return '#06B6D4';    // Cyan (이자)
      case 'dividend': return '#3B82F6';    // Blue (배당)
      case 'investment': return '#22C55E';  // Green (투자수익)
      case 'gift': return '#EC4899';        // Pink (용돈/선물)
      default: return '#6B7280';
    }
  };

  // 카테고리 이름
  const getCategoryName = (category: ExpenseEntry['category']) => {
    switch (category) {
      case 'food': return '식비';
      case 'transport': return '교통비';
      case 'shopping': return '쇼핑';
      case 'entertainment': return '엔터테인먼트';
      case 'health': return '건강';
      // income-related
      case 'salary': return '급여';
      case 'bonus': return '보너스';
      case 'interest': return '이자';
      case 'dividend': return '배당';
      case 'investment': return '투자수익';
      case 'gift': return '용돈/선물';
      case 'other': return '기타';
      default: return '기타';
    }
  };

  // 가계부 잔액 (수입-지출)
  const moneyBalance = useMemo(() => {
    try {
      return expenseEntries.reduce((sum, e) => sum + (e.type === 'income' ? e.amount : -e.amount), 0);
    } catch { return 0; }
  }, [expenseEntries]);

  // 즐겨찾기 정렬 리스트
  const diarySorted = useMemo(() => {
    return [...diaryEntries].sort((a,b)=> (b.fav?1:0) - (a.fav?1:0));
  }, [diaryEntries]);
  const expenseSorted = useMemo(() => {
    return [...expenseEntries].sort((a,b)=> (b.fav?1:0) - (a.fav?1:0));
  }, [expenseEntries]);
  const memoSorted = useMemo(() => {
    return [...memoEntries].sort((a,b)=> (b.fav?1:0) - (a.fav?1:0));
  }, [memoEntries]);

  // 탭별 필터링
  const diaryFiltered = useMemo(() => {
    const q = diaryQuery.trim().toLowerCase();
    let base = diarySorted;
    if (diaryMoodFilter) base = base.filter(i => i.mood === diaryMoodFilter);
    if (!q) return base;
    return base.filter(i => i.title.toLowerCase().includes(q) || i.content.toLowerCase().includes(q) || (i.tags||[]).some(t=> t.toLowerCase().includes(q)));
  }, [diarySorted, diaryQuery, diaryMoodFilter]);
  const expenseFiltered = useMemo(() => {
    const q = expenseQuery.trim().toLowerCase();
    if (!q) return expenseSorted;
    const qNoComma = q.replace(/,/g, '');
    const qDigits = q.replace(/[^0-9]/g, '');
    return expenseSorted.filter(i => {
      const desc = i.description.toLowerCase();
      const cat = String(i.category).toLowerCase();
      if (desc.includes(q) || cat.includes(q)) return true;
      // 금액 포함 검색: 통화 표시/콤마 무시
      const formatted = formatMoney(i.amount);
      const withSymbol = `${getCurrencySymbol(currency)}${formatted}`.toLowerCase();
      const formattedNoComma = formatted.replace(/[.,,]/g, '');
      const amountInt = Math.round(i.amount).toString();
      if (withSymbol.replace(/,/g,'').includes(qNoComma)) return true;
      if (formattedNoComma.includes(qDigits) && qDigits.length>0) return true;
      if (amountInt.includes(qDigits) && qDigits.length>0) return true;
      return false;
    });
  }, [expenseSorted, expenseQuery, currency]);
  const memoFiltered = useMemo(() => {
    const q = memoQuery.trim().toLowerCase();
    if (!q) return memoSorted;
    return memoSorted.filter(i => i.title.toLowerCase().includes(q) || i.content.toLowerCase().includes(q));
  }, [memoSorted, memoQuery]);

  // 프로젝트 이름 번역
  const getProjectName = (projectName: string) => {
    switch (projectName) {
      case 'Index': // 과거 명칭 호환
      case 'index':
      case 'Inbox': return t('inbox', language);
      case 'Work': return t('work', language);
      case 'Personal': return t('personal', language);
      case 'Shopping': return t('shopping', language);
      case 'Health': return t('health', language);
      case 'Study': return t('study', language);
      case 'Travel': return t('travel', language);
      case 'Finance': return t('finance', language);
      case 'D-day': return t('dday', language);
      case '기념일': return t('anniversary', language);
      default: return projectName; // 커스텀 프로젝트는 그대로 표시
    }
  };

  // 금액 포맷팅 함수
  const formatAmount = (value: string) => {
    // 숫자가 아닌 문자 제거
    const numericValue = value.replace(/[^0-9.]/g, '');
    // 소수점이 여러 개인 경우 첫 번째만 유지
    const parts = numericValue.split('.');
    const formattedParts = parts.length > 1 ? [parts[0], parts.slice(1).join('')] : [numericValue];
    
    if (formattedParts[0]) {
      // 천단위 구분 추가
      formattedParts[0] = parseInt(formattedParts[0]).toLocaleString();
    }
    
    return formattedParts.join('.');
  };

  // 금액 입력 핸들러
  const handleAmountChange = (text: string) => {
    const formatted = formatAmount(text);
    setNewExpenseEntry({...newExpenseEntry, amount: formatted});
  };

  // 화폐 기호 가져오기
  const getCurrencySymbol = (currency: string) => {
    switch (currency) {
      case 'USD': return '$';
      case 'KRW': return '₩';
      case 'JPY': return '¥';
      case 'CNY': return '¥';
      case 'EUR': return '€';
      default: return '$';
    }
  };

  // 통화 금액 포맷터: KRW는 소수점 표시 없음
  const formatMoney = (amount: number) => {
    const opts = currency === 'KRW'
      ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    return amount.toLocaleString('en-US', opts);
  };

  // D-day 계산 함수
  const calculateDday = (targetDate: string) => {
    const today = new Date();
    const target = new Date(targetDate);
    
    // 날짜를 자정으로 설정하여 정확한 일수 계산
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    
    const diffTime = target.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return { text: 'D-Day', color: '#FFD700' };
    } else if (diffDays > 0) {
      const n = Number(diffDays).toLocaleString();
      return { text: `D-${n}`, color: '#FFD700' };
    } else {
      const n = Number(Math.abs(diffDays)).toLocaleString();
      return { text: `D+${n}`, color: '#FFD700' };
    }
  };

  // 검색 결과 필터링
  const getSearchResults = () => {
    if (!searchQuery.trim()) return [];
    
    const results = [];
    
    // 작업 검색
    const filteredTasks = items.filter(item => 
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.note && item.note.toLowerCase().includes(searchQuery.toLowerCase()))
    );
    
    if (filteredTasks.length > 0) {
      results.push({
        type: 'tasks',
        title: t('tasks', language),
        count: filteredTasks.length,
        items: filteredTasks
      });
    }
    
    // 일기 검색
    const filteredDiary = diaryEntries.filter(entry => 
      entry.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.content.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    if (filteredDiary.length > 0) {
      results.push({
        type: 'diary',
        title: t('diary', language),
        count: filteredDiary.length,
        items: filteredDiary
      });
    }
    
    // 가계부 검색
    const filteredExpenses = expenseEntries.filter(entry => 
      entry.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.category.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    if (filteredExpenses.length > 0) {
      results.push({
        type: 'money',
        title: t('money', language),
        count: filteredExpenses.length,
        items: filteredExpenses
      });
    }
    
    // 메모 검색
    const filteredMemos = memoEntries.filter(entry => 
      entry.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.content.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    if (filteredMemos.length > 0) {
      results.push({
        type: 'memo',
        title: t('memo', language),
        count: filteredMemos.length,
        items: filteredMemos
      });
    }
    
    return results;
  };

  // 프로젝트 관리 함수들
  const addProject = () => {
    if (!newProjectName.trim()) return;
    
    const projectColors = [
      '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', 
      '#06B6D4', '#8B5CF6', '#EC4899', '#F97316', '#84CC16'
    ];
    
    const randomColor = projectColors[Math.floor(Math.random() * projectColors.length)];
    
    setProjects(prev => [...prev, { 
      name: newProjectName.trim(), 
      color: randomColor, 
      count: 0 
    }]);
    setNewProjectName('');
  };

  const deleteProject = (projectName: string) => {
    if (projectName === 'Inbox') return; // Inbox는 삭제 불가
    
    setProjects(prev => prev.filter(p => p.name !== projectName));
    
    // 해당 프로젝트의 모든 작업을 Inbox로 이동
    items.forEach(item => {
      if ((item as TodoistItem).project === projectName) {
        update(item.id, { ...item, project: 'Inbox' });
      }
    });
    
    // 현재 선택된 프로젝트가 삭제된 프로젝트라면 Inbox로 변경
    if (selectedProject === projectName) {
      setSelectedProject('Inbox');
    }
  };

  const renameProject = (oldName: string, newName: string) => {
    if (!newName.trim() || oldName === 'Inbox') return; // Inbox는 이름 변경 불가
    
    setProjects(prev => prev.map(p => 
      p.name === oldName ? { ...p, name: newName.trim() } : p
    ));
    
    // 해당 프로젝트의 모든 작업의 프로젝트명 업데이트
    items.forEach(item => {
      if ((item as TodoistItem).project === oldName) {
        update(item.id, { ...item, project: newName.trim() });
      }
    });
    
    // 현재 선택된 프로젝트가 변경된 프로젝트라면 업데이트
    if (selectedProject === oldName) {
      setSelectedProject(newName.trim());
    }
    
    setEditingProject(null);
  };

  // 기본 프로젝트 변경 함수
  const changeDefaultProject = async (projectName: string) => {
    setDefaultProject(projectName);
    
    // AsyncStorage에 저장
    const uid = currentUser?.uid;
    const key = uid ? `u:${uid}:defaultProject` : 'defaultProject';
    await AsyncStorage.setItem(key, projectName);
  };

  // Todoist 스타일 아이템 렌더링
  const renderTaskItem = ({ item }: { item: TodoItem }) => {
    const todoistItem = item as TodoistItem;
    const priority = todoistItem.priority || 4;
    const isDdayProject = todoistItem.project === 'D-day' || todoistItem.project === '기념일';
    
    return (
      <View style={styles.taskItem}>
        <TouchableOpacity 
          style={styles.taskCheckbox} 
          onPress={() => handleTaskComplete(item)}
        >
          <View style={[
            styles.checkboxCircle, 
            item.completed && styles.checkboxCompleted
          ]}>
            {item.completed && <Text style={styles.checkmark}>✓</Text>}
          </View>
        </TouchableOpacity>
        
        <View style={styles.taskContent}>
          <View style={styles.taskHeader}>
            <Text style={[
              styles.taskTitle, 
              item.completed && styles.taskCompleted
            ]}>
              {item.title}
            </Text>
            <View style={styles.taskActions}>
              {/* 우선순위 배지 */}
              {priority && (
                <View style={[styles.priorityBadge, { borderColor: getPriorityColor(Number(priority as any)) }]}>
                  <Text style={[styles.priorityBadgeText, { color: getPriorityColor(Number(priority as any)) }]}>{`P${priority}`}</Text>
                </View>
              )}
              {/* 점3개 컨텍스트 메뉴 */}
              <TouchableOpacity 
                style={styles.moreButton}
                onPress={() => { try { setTaskMenu({ id: item.id, title: item.title, project: (todoistItem.project||'Inbox'), priority: Number(priority as any)||4, note: item.note||'', labels: (item as any).labels||[], dueDate: (todoistItem.dueDate as any)||'' }); setShowTaskMenu(true);} catch {} }}
              >
                <MoreHorizontal size={16} color="#6B7280" />
              </TouchableOpacity>
            </View>
          </View>
          
          {item.note && (
            <Text style={styles.taskNote}>{item.note}</Text>
          )}
          
          <View style={styles.taskMeta}>
            {/* 프로젝트 배지 제거 */}
            {isDdayProject && todoistItem.dueDate && (
              (() => { const diff = getItemDiffParts((todoistItem as any).dueDate as any); return (
              <View style={styles.ddayGroup}>
                <View style={styles.ddayClockWrap}>
                  <Text style={[styles.ddayClockText, { color: diff.color }]} allowFontScaling={false}>{diff.ymd} {diff.hms}</Text>
                </View>
                <View style={styles.ddayContainer}>
                  <Text style={[
                    styles.ddayText,
                    { color: calculateDday(todoistItem.dueDate).color }
                  ]}>
                    {calculateDday(todoistItem.dueDate).text}
                  </Text>
                </View>
              </View>
              ); })()
            )}
            {/* 디버깅용 - D-day 조건 확인 */}
            {isDdayProject && !todoistItem.dueDate && (
              <View style={styles.ddayContainer}>
                <Text style={[styles.ddayText, { color: '#FF6B6B' }]}>
                  날짜 필요
                </Text>
              </View>
            )}
            {!isDdayProject && todoistItem.dueDate && (
              <View style={styles.dueDateTag}>
                <Clock size={12} color="#6B7280" />
                <Text style={styles.dueDateText}>{todoistItem.dueDate}</Text>
              </View>
            )}
            {/* 라벨 배지 */}
            {Array.isArray((item as any).labels) && (item as any).labels.length>0 && (
              <View style={styles.labelsWrap}>
                {(item as any).labels.map((lb:string, idx:number)=> (
                  <View key={idx} style={styles.labelChip}><Text style={styles.labelChipText}>{lb}</Text></View>
                ))}
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      {/* 앱 상단바 */}
      <TopBar 
        title={username} 
        onMenuPress={() => setMenuOpen(true)}
        onProfilePress={() => setProfileOpen(true)}
        avatarUri={avatarUri} 
      />
      
      {/* Todoist 스타일 헤더 */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerLeft}>
            <ThemedText type="title" style={styles.headerTitle}>{currentUser?.email?.split('@')[0] || 'User'} {t('todo', language)}</ThemedText>
            <TouchableOpacity onPress={() => setShowCompletedOnly(v=>!v)}>
              <View style={[styles.karmaContainer, showCompletedOnly && { backgroundColor: '#2E2E2E', borderColor:'#FFD700', borderWidth:1 }] }>
                <Star size={16} color="#FFD700" fill="#FFD700" />
                <Text style={styles.karmaText}>{karma}</Text>
              </View>
            </TouchableOpacity>
          </View>
          <View style={styles.headerIcons}>
            <TouchableOpacity style={styles.searchButton} onPress={() => setShowSearchModal(true)}>
              <Search size={20} color="#6B7280" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.alarmButton} onPress={() => setShowAlarmModal(true)}>
              <Bell size={20} color="#6B7280" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.settingsButton} onPress={() => setShowSettingsModal(true)}>
              <Settings size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>
        </View>
        
        {/* 탭 네비게이션 */}
        <View style={styles.tabContainer}>
          <View style={styles.tabScrollContent}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'todo' && styles.tabActive]}
              onPress={() => setActiveTab('todo')}
            >
              <CheckSquare size={16} color={activeTab === 'todo' ? '#FFD700' : '#6B7280'} />
              <Text style={[styles.tabText, activeTab === 'todo' && styles.tabTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{t('todo', language)}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.tab, activeTab === 'diary' && styles.tabActive]}
              onPress={() => setActiveTab('diary')}
            >
              <BookOpen size={16} color={activeTab === 'diary' ? '#FFD700' : '#6B7280'} />
              <Text style={[styles.tabText, activeTab === 'diary' && styles.tabTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{t('diary', language)}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.tab, activeTab === 'money' && styles.tabActive]}
              onPress={() => setActiveTab('money')}
            >
              <DollarSign size={16} color={activeTab === 'money' ? '#FFD700' : '#6B7280'} />
              <Text style={[styles.tabText, activeTab === 'money' && styles.tabTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{t('money', language)}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.tab, activeTab === 'memo' && styles.tabActive]}
              onPress={() => setActiveTab('memo')}
            >
              <StickyNote size={16} color={activeTab === 'memo' ? '#FFD700' : '#6B7280'} />
              <Text style={[styles.tabText, activeTab === 'memo' && styles.tabTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{t('memo', language)}</Text>
            </TouchableOpacity>
          </View>
        </View>
        
        {/* 빠른 추가 입력창 (Todo 탭에서만 표시) */}
        {activeTab === 'todo' && (
          <View style={styles.quickAddContainer}>
            <TouchableOpacity 
              style={styles.quickAddButton}
              onPress={() => {
                // 기념일 프로젝트에서 추가 시, 달력 선택 날짜를 기본 due로 설정
                try {
                  if (selectedProject === '기념일') {
                    setDueY(String(calYear));
                    setDueM(String(calMonth));
                    setDueD(String(calDay));
                  }
                } catch {}
                setShowAddModal(true);
              }}
            >
              <Plus size={16} color="#6B7280" />
              <Text style={styles.quickAddText}>{t('addTask', language)}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* 콘텐츠 영역 */}
      <View style={styles.contentArea}>
        {/* 프로젝트 사이드바 (Todo 탭에서만 표시) */}
        {activeTab === 'todo' && (
          sidebarMode === 'min' ? (
            <View style={styles.sidebarCollapsed}>
              <TouchableOpacity style={styles.expandBtnBig} onPress={() => setSidebarMode('mid')}>
                <Text style={styles.expandBtnText}>{'>>'}</Text>
              </TouchableOpacity>
              
              {/* 최소화된 프로젝트 색상들 */}
              <View style={styles.minimizedProjectList}>
                {projects
                  .sort((a, b) => {
                    // 기본 프로젝트를 맨 위로
                    if (a.name === defaultProject) return -1;
                    if (b.name === defaultProject) return 1;
                    return 0;
                  })
                  .map((project, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.minimizedProjectItem,
                        selectedProject === project.name && styles.minimizedProjectItemActive
                      ]}
                      onPress={() => setSelectedProject(project.name)}
                    >
                      <View style={[styles.projectColor, { backgroundColor: project.color, width: 12, height: 12, borderRadius: 6 }]} />
                    </TouchableOpacity>
                  ))}
              </View>
              
            </View>
          ) : (
            <View style={[styles.sidebar, { flex: sidebarFlex }]}>
              <View style={styles.sidebarControls}>
                <TouchableOpacity style={[styles.modeBtn, sidebarMode === 'min' && styles.modeBtnActive]} onPress={() => setSidebarMode('min')}>
                  <Text style={[styles.modeBtnText, sidebarMode === 'min' && styles.modeBtnTextActive]}>—</Text>
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
              </View>
              <ScrollView style={styles.projectList}>
                {projects
                  .sort((a, b) => {
                    // 기본 프로젝트를 맨 위로
                    if (a.name === defaultProject) return -1;
                    if (b.name === defaultProject) return 1;
                    return 0;
                  })
                  .map((project, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.projectItem,
                      selectedProject === project.name && styles.projectItemActive
                    ]}
                    onPress={() => setSelectedProject(project.name)}
                  >
                    <View style={[styles.projectColor, { backgroundColor: project.color }]} />
                    <Text style={[
                      styles.projectName,
                      selectedProject === project.name && styles.projectNameActive
                    ]} allowFontScaling={false} numberOfLines={1}>
                      {getProjectName(project.name)}
                    </Text>
                    <Text style={styles.projectCount} allowFontScaling={false} numberOfLines={1}>{project.count}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )
        )}

        {/* 메인 콘텐츠 */}
        <View style={[
          styles.mainContent, 
          activeTab !== 'todo' && styles.mainContentFull,
          activeTab === 'todo' && { flex: mainFlex }
        ]}>
        {activeTab === 'todo' && (
          <>
            <View style={styles.contentHeader}>
              <Text style={styles.contentTitle} numberOfLines={1} ellipsizeMode="tail">{getProjectName(selectedProject)}</Text>
              <View style={{ flexDirection:'row', alignItems:'center', gap: 8 }}>
                <Text style={styles.taskCount}>{filtered.length} {t('tasks', language)}</Text>
                <TouchableOpacity onPress={() => setShowCompletedOnly(v=>!v)} style={[styles.addButton, { paddingVertical:4, paddingHorizontal:10 }]}> 
                  <Text style={styles.addButtonText}>{showCompletedOnly ? t('todo', language) : t('completed', language)}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 헤더 대형 시계 제거 */}

            {/* 기념일 전용 달력 UI */}
            {selectedProject === '기념일' && (
              <View style={styles.calendarContainer}>
                <View style={styles.calendarHeader}>
                  <TouchableOpacity onPress={()=>{ let y=calYear, m=calMonth-1; if (m<=0){ m=12; y--; } setCalYear(y); setCalMonth(m); }}><Text style={styles.calendarNav}>{'<'}</Text></TouchableOpacity>
                  <Text style={styles.calendarTitle}>{calYear}년 {calMonth}월</Text>
                  <TouchableOpacity onPress={()=>{ let y=calYear, m=calMonth+1; if (m>12){ m=1; y++; } setCalYear(y); setCalMonth(m); }}><Text style={styles.calendarNav}>{'>'}</Text></TouchableOpacity>
                </View>
                <View style={styles.dowRow}>
                  {['일','월','화','수','목','금','토'].map((d)=> (<Text key={d} style={styles.dowText}>{d}</Text>))}
                </View>
                {(() => {
                  const firstBlank = startDow(calYear, calMonth); // 0~6
                  const dim = daysInMonth(calYear, calMonth);
                  const cells: Array<{key:string; label:string; day?:number; muted?:boolean}> = [];
                  for (let i=0;i<firstBlank;i++) cells.push({ key:`b-${i}`, label:'' , muted:true});
                  for (let d=1; d<=dim; d++) cells.push({ key:`d-${d}`, label:String(d), day:d });
                  while (cells.length % 7 !== 0) cells.push({ key:`t-${cells.length}`, label:'', muted:true});
                  const rows = [] as any[];
                  for (let r=0; r<cells.length; r+=7) rows.push(cells.slice(r,r+7));
                  return (
                    <View style={styles.weeksWrap}>
                      {rows.map((row, idx)=> (
                        <View key={`row-${idx}`} style={styles.weekRow}>
                          {row.map((c:any)=> (
                            <TouchableOpacity key={c.key} disabled={!c.day} onPress={()=> c.day && setCalDay(c.day)} style={[styles.dayCell, c.muted && { opacity:0.3 }, (()=>{ if (!c.day) return undefined; const k=formatDate(calYear, calMonth, c.day); const p = dayPriorityByDate[k]; return p ? { borderWidth: 1, borderColor: getPriorityColor(p) } : undefined; })(), (c.day===calDay) && styles.dayCellSelected ]}>
                              <Text style={styles.dayText}>{c.label}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      ))}
                    </View>
                  );
                })()}
              </View>
            )}
            
            <FlatList
              data={filtered}
              keyExtractor={i => i.id}
              renderItem={renderTaskItem}
              contentContainerStyle={styles.taskList}
              showsVerticalScrollIndicator={false}
            />
          </>
        )}
        
        {activeTab === 'diary' && (
          <View style={styles.tabContent}>
            <View style={styles.contentHeader}>
              <TextInput style={styles.searchInline} placeholder={t('search', language)} placeholderTextColor="#6B7280" value={diaryQuery} onChangeText={setDiaryQuery} />
              {diaryMoodFilter && (
                <TouchableOpacity onPress={()=>setDiaryMoodFilter(null)} style={[styles.chip, { marginRight: 8, backgroundColor:'transparent', borderColor:'#FFFFFF' }]}>
                  <Text style={{ color:'#FFFFFF', fontSize: 12, fontWeight:'700' }}>{t('clearFilter', language)}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.addButton} onPress={() => setShowDiaryModal(true)}>
                <Plus size={16} color="#FFD700" />
                <Text style={styles.addButtonText}>{t('newEntry', language)}</Text>
              </TouchableOpacity>
            </View>
            
            {diaryEntries.length === 0 ? (
              <View style={styles.placeholderContent}>
                <BookOpen size={48} color="#6B7280" />
                <Text style={styles.placeholderTitle}>{t('noDiaryEntries', language)}</Text>
                <Text style={styles.placeholderText}>{t('startWritingDiary', language)}</Text>
                <TouchableOpacity 
                  style={styles.primaryButton}
                  onPress={() => setShowDiaryModal(true)}
                >
                  <Text style={styles.primaryButtonText}>{t('writeFirstEntry', language)}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <FlatList
                data={diaryFiltered}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContainer}
                renderItem={({ item }) => (
                  <TouchableOpacity activeOpacity={0.9} onPress={()=>setDiaryPreview(item)}>
                  <View style={styles.diaryCard}>
                    <View style={styles.diaryHeader}>
                      <TouchableOpacity onPress={()=> setDiaryEntries(list=> list.map(e=> e.id===item.id? { ...e, fav: !e.fav }: e))} style={{ marginRight: 8 }}>
                        <Text style={styles.favStar}>{item.fav? '★':'☆'}</Text>
                      </TouchableOpacity>
                      <Text style={styles.diaryTitle}>{item.title}</Text>
                      <TouchableOpacity onPress={()=> setDiaryMoodFilter(item.mood)}>
                        <View style={[styles.moodIndicator, { backgroundColor: getMoodColor(item.mood) }]} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={()=>setDiaryMenu(item)} style={{ marginLeft: 8 }}>
                        <Text style={{ color:'#FFD700', fontWeight:'900', fontSize: 18 }}>⋯</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.diaryDate}>{item.date}</Text>
                    <Text style={styles.diaryContent}>{item.content}</Text>
                    {item.tags.length > 0 && (
                      <View style={styles.tagsContainer}>
                        {item.tags.map((tag, index) => (
                          <View key={index} style={styles.tag}>
                            <Text style={styles.tagText}>{tag}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        )}
        
        {activeTab === 'money' && (
          <View style={styles.tabContent}>
            <View style={styles.contentHeader}>
              <TextInput style={styles.searchInline} placeholder={t('search', language)} placeholderTextColor="#6B7280" value={expenseQuery} onChangeText={setExpenseQuery} />
              <TouchableOpacity style={styles.addButton} onPress={() => setShowExpenseModal(true)}>
                <Plus size={16} color="#FFD700" />
                <Text style={styles.addButtonText}>{t('addEntry', language)}</Text>
              </TouchableOpacity>
            </View>
            {/* 잔액 표시 */}
            <View style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>{t('currentBalance', language)}</Text>
              <Text style={[styles.balanceValue, { color: moneyBalance >= 0 ? '#10B981' : '#EF4444' }]}>
                {moneyBalance >= 0 ? '+' : '-'}{getCurrencySymbol(currency)}{formatMoney(Math.abs(moneyBalance))}
              </Text>
            </View>
            
            {expenseEntries.length === 0 ? (
              <View style={styles.placeholderContent}>
                <DollarSign size={48} color="#6B7280" />
                <Text style={styles.placeholderTitle}>{t('noExpensesTracked', language)}</Text>
                <Text style={styles.placeholderText}>{t('startTrackingExpenses', language)}</Text>
                <TouchableOpacity 
                  style={styles.primaryButton}
                  onPress={() => setShowExpenseModal(true)}
                >
                  <Text style={styles.primaryButtonText}>{t('addFirstEntry', language)}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <FlatList
                data={expenseFiltered}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContainer}
                renderItem={({ item }) => (
                  <View style={styles.expenseCard}>
                    <View style={styles.expenseHeader}>
                      <View style={styles.expenseHeaderLeft}>
                        <TouchableOpacity onPress={()=> setExpenseEntries(list=> list.map(e=> e.id===item.id? { ...e, fav: !e.fav }: e))}>
                          <Text style={styles.favStar}>{item.fav? '★':'☆'}</Text>
                        </TouchableOpacity>
                        <Text style={styles.expenseDescription}>{item.description}</Text>
                      </View>
                      <View style={styles.expenseRight}>
                        <Text numberOfLines={1} ellipsizeMode="clip" style={[
                        styles.expenseAmount,
                        { color: item.type === 'income' ? '#10B981' : '#EF4444' }
                      ]}>
                        {item.type === 'income' ? '+' : '-'}{getCurrencySymbol(currency)}{formatMoney(item.amount)}
                      </Text>
                        <TouchableOpacity onPress={()=>setExpenseMenu(item)} style={styles.expenseMenuBtn}>
                        <Text style={{ color:'#FFD700', fontWeight:'900', fontSize: 18 }}>⋯</Text>
                      </TouchableOpacity>
                      </View>
                    </View>
                    <View style={styles.expenseMeta}>
                      <TouchableOpacity onPress={()=> setCategoryDetail(item.category)}>
                        <View style={[styles.categoryTag, { backgroundColor: getCategoryColor(item.category) }]}> 
                          <Text style={styles.categoryText}>{item.category}</Text>
                        </View>
                      </TouchableOpacity>
                      <Text style={styles.expenseDate}>{item.date}</Text>
                    </View>
                  </View>
                )}
              />
            )}
          </View>
        )}
        
        {activeTab === 'memo' && (
          <View style={styles.tabContent}>
            <View style={styles.contentHeader}>
              <TextInput style={styles.searchInline} placeholder={t('search', language)} placeholderTextColor="#6B7280" value={memoQuery} onChangeText={setMemoQuery} />
              <TouchableOpacity style={styles.addButton} onPress={() => setShowMemoModal(true)}>
                <Plus size={16} color="#FFD700" />
                <Text style={styles.addButtonText}>{t('newMemo', language)}</Text>
              </TouchableOpacity>
            </View>
            
            {memoEntries.length === 0 ? (
              <View style={styles.placeholderContent}>
                <StickyNote size={48} color="#6B7280" />
                <Text style={styles.placeholderTitle}>{t('noMemosYet', language)}</Text>
                <Text style={styles.placeholderText}>{t('jotDownNotes', language)}</Text>
                <TouchableOpacity 
                  style={styles.primaryButton}
                  onPress={() => setShowMemoModal(true)}
                >
                  <Text style={styles.primaryButtonText}>{t('createFirstMemo', language)}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <FlatList
                data={memoFiltered}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContainer}
                numColumns={2}
                renderItem={({ item }) => (
                  <TouchableOpacity activeOpacity={0.9} onPress={()=> setMemoPreview(item)}>
                    {(() => { const long = String(item.title||'').length >= 20; return (
                    <View style={[styles.memoCard, long && styles.memoCardFull, { backgroundColor: item.color }]}>
                      <View style={{ flexDirection:'row', alignItems:'center', gap:6 }}>
                        <TouchableOpacity onPress={()=> setMemoEntries(list=> list.map(e=> e.id===item.id? { ...e, fav: !e.fav }: e))}>
                          <Text style={[styles.favStar, { color:'#0D0D0D' }]}>{item.fav? '★':'☆'}</Text>
                        </TouchableOpacity>
                        <Text style={styles.memoTitle}>{item.title}</Text>
                      </View>
                    <Text style={styles.memoContent}>{item.content}</Text>
                      <Text style={styles.memoDate}>
                        {new Date(item.createdAt).toLocaleDateString()}
                      </Text>
                      <TouchableOpacity onPress={()=>setMemoMenu(item)} style={{ position:'absolute', right: 8, top: 8 }}>
                        <Text style={{ color:'#0D0D0D', backgroundColor:'#FFD700', paddingHorizontal:6, paddingVertical:2, borderRadius:6, fontWeight:'900' }}>⋯</Text>
                      </TouchableOpacity>
                    </View>
                    ); })()}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        )}
        </View>
      </View>

      {/* 작업 컨텍스트 메뉴 */}
      <Modal visible={showTaskMenu} transparent animationType="fade" onRequestClose={()=>setShowTaskMenu(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.taskMenuCard}>
            <Text style={styles.taskMenuTitle}>{taskMenu?.title || t('title', language)}</Text>
            <View style={{ gap: 8 }}>
              <TouchableOpacity style={styles.menuBtnRow} onPress={()=>{ try { setEditDraft(taskMenu); setShowEditModal(true);} catch {} }}>
                <Text style={styles.menuBtnText}>{t('edit', language)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuBtnRow} onPress={()=>{ try { const p = Number(prompt('우선순위 1(높음)~4(낮음)', String(taskMenu?.priority||4))||'4'); if (taskMenu?.id) { update(taskMenu.id, { priority: p as any }); setTaskMenu((cur:any)=> cur? { ...cur, priority: p }: cur); } } catch {} }}>
                <Text style={styles.menuBtnText}>{t('changePriority', language)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuBtnRow} onPress={()=>{ try { const lb = (prompt('라벨 추가 (쉼표로 구분)', '')||'').split(',').map(x=>x.trim()).filter(Boolean); if (taskMenu?.id) { const cur = (items.find(i=>i.id===taskMenu.id) as any)?.labels||[]; const next = Array.from(new Set([...(cur||[]), ...lb])); update(taskMenu.id, { labels: next } as any); setTaskMenu((c:any)=> c? { ...c, labels: next }: c); } } catch {} }}>
                <Text style={styles.menuBtnText}>{t('addLabel', language)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuBtnRow} onPress={()=>{ try { setShowProjectSelector(true); setEditingTaskId(taskMenu?.id||''); } catch {} }}>
                <Text style={styles.menuBtnText}>{t('moveToProject', language)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.menuBtnRow, { borderColor:'#7A1F1F' }]} onPress={()=>{ try { if (taskMenu?.id) remove(taskMenu.id); } catch {} }}>
                <Text style={[styles.menuBtnText, { color:'#FF6B6B' }]}>{t('delete', language)}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={[styles.addModalCancel, { marginTop: 12 }]} onPress={()=>setShowTaskMenu(false)}>
              <Text style={styles.addModalCancelText}>{t('close', language)}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Memo Preview Modal */}
      <Modal visible={!!memoPreview} transparent animationType="fade" onRequestClose={()=>setMemoPreview(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.addModalContainer, { maxHeight: '85%' }] }>
            <View style={styles.addModalHeader}>
              <Text style={styles.addModalTitle}>{t('previewMemo', language)}</Text>
              <TouchableOpacity onPress={()=>setMemoPreview(null)}><Text style={styles.addModalClose}>✕</Text></TouchableOpacity>
            </View>
            <ScrollView style={{ paddingHorizontal: 20, paddingVertical: 16 }}>
              <Text style={styles.previewTitle}>{memoPreview?.title}</Text>
              <Text style={styles.previewDate}>{memoPreview ? new Date(memoPreview.createdAt).toLocaleString() : ''}</Text>
              <Text style={styles.previewContent}>{memoPreview?.content}</Text>
            </ScrollView>
            <View style={styles.addModalActions}>
              <TouchableOpacity style={styles.addModalCancel} onPress={()=>setMemoPreview(null)}><Text style={styles.addModalCancelText}>{t('close', language)}</Text></TouchableOpacity>
              <TouchableOpacity style={styles.addModalSave} onPress={()=>{ if (memoPreview) { setMemoEdit(memoPreview); setMemoPreview(null); } }}><Text style={styles.addModalSaveText}>{t('edit', language)}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Expense Category Detail Modal */}
      <Modal visible={!!categoryDetail} transparent animationType="slide" onRequestClose={()=>setCategoryDetail(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.addModalContainer}>
            <View style={styles.addModalHeader}>
              <Text style={styles.addModalTitle}>{getCategoryName((categoryDetail||'other') as any)} {t('details', language)}</Text>
              <TouchableOpacity onPress={()=>setCategoryDetail(null)}><Text style={styles.addModalClose}>✕</Text></TouchableOpacity>
            </View>
            <View style={{ padding: 16 }}>
              {(() => {
                const parseYM = (s:string) => { const d = new Date(s); return { y: d.getFullYear(), m: d.getMonth()+1 }; };
                const inMonth = (s:string, y:number, m:number) => { const d = new Date(s); return d.getFullYear()===y && (d.getMonth()+1)===m; };
                const allCats = Array.from(new Set(expenseEntries.map(e=> e.category)));
                const prevCat = () => { if (!categoryDetail) return; const idx = allCats.indexOf(categoryDetail); const ni = (idx-1+allCats.length)%allCats.length; setCategoryDetail(allCats[ni]); };
                const nextCat = () => { if (!categoryDetail) return; const idx = allCats.indexOf(categoryDetail); const ni = (idx+1)%allCats.length; setCategoryDetail(allCats[ni]); };

                const listAll = expenseEntries.filter(e=> e.category === categoryDetail);
                const monthsAvail = Array.from(new Set(listAll.map(e=> `${parseYM(e.date).y}-${parseYM(e.date).m}`)));
                const list = listAll.filter(e=> inMonth(e.date, catYear, catMonth));
                const totalAbs = list.reduce((s,e)=> s + e.amount, 0);
                const spent = list.filter(e=> e.type==='expense').reduce((s,e)=> s+e.amount, 0);
                const incomeSum = list.filter(e=> e.type==='income').reduce((s,e)=> s+e.amount, 0);
                const totalFlow = incomeSum + spent; // use absolute for ratio length
                const incomePct = totalFlow>0 ? Math.round((incomeSum/totalFlow)*100) : 0;
                const expensePct = totalFlow>0 ? 100 - incomePct : 0;
                return (
                  <>
                    {/* 카테고리 네비게이션 */}
                    <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom: 10 }}>
                      <TouchableOpacity onPress={prevCat}><Text style={{ color:'#FFD700', fontSize:20 }}>‹</Text></TouchableOpacity>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex:1, marginHorizontal: 8 }}>
                        <View style={{ flexDirection:'row', gap: 8 }}>
                          {allCats.map((c)=> (
                            <TouchableOpacity key={String(c)} onPress={()=> setCategoryDetail(c)} style={[styles.chip, categoryDetail===c && styles.chipActive]}> 
                              <Text style={[styles.chipText, categoryDetail===c && styles.chipTextActive]}>{getCategoryName(c as any)}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </ScrollView>
                      <TouchableOpacity onPress={nextCat}><Text style={{ color:'#FFD700', fontSize:20 }}>›</Text></TouchableOpacity>
                    </View>

                    {/* 월별 필터 */}
                    <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom: 10 }}>
                      <TouchableOpacity onPress={()=>{ let y=catYear, m=catMonth-1; if (m<=0){ m=12; y--; } setCatYear(y); setCatMonth(m); }}><Text style={{ color:'#FFD700', fontSize:18 }}>‹</Text></TouchableOpacity>
                      <Text style={{ color:'#FFFFFF', fontWeight:'700' }}>{catYear}년 {catMonth}월</Text>
                      <TouchableOpacity onPress={()=>{ let y=catYear, m=catMonth+1; if (m>12){ m=1; y++; } setCatYear(y); setCatMonth(m); }}><Text style={{ color:'#FFD700', fontSize:18 }}>›</Text></TouchableOpacity>
                    </View>

                    {/* 수입/지출 비율 그래프 (원형) */}
                    {(() => {
                      const size = 120; const cx = size/2; const cy = size/2; const r = 54; const c = 2*Math.PI*r; const incomeLen = Math.max(0, Math.min(1, incomePct/100)) * c;
                      const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">\n  <circle cx="${cx}" cy="${cy}" r="${r}" stroke="#EF4444" stroke-width="12" fill="none" transform="rotate(-90 ${cx} ${cy})" opacity="0.9"/>\n  <circle cx="${cx}" cy="${cy}" r="${r}" stroke="#10B981" stroke-width="12" fill="none" stroke-dasharray="${incomeLen} ${c}" transform="rotate(-90 ${cx} ${cy})"/>\n  <circle cx="${cx}" cy="${cy}" r="${r-10}" fill="#0D0D0D"/>\n  <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="#FFFFFF" font-size="14" font-weight="700">${incomePct}%</text>\n</svg>`;
                      return (
                        <View style={{ alignItems:'center', marginTop: 8, marginBottom: 12 }}>
                          {(() => { let uri = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg); try { if (typeof btoa !== 'undefined') { uri = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg))); } } catch {} return (
                            <Image source={{ uri }} style={{ width: size, height: size }} />
                          ); })()}
                          <View style={{ flexDirection:'row', gap: 12, marginTop: 6 }}>
                            <Text style={{ color:'#10B981' }}>수입 {incomePct}%</Text>
                            <Text style={{ color:'#EF4444' }}>지출 {expensePct}%</Text>
                          </View>
                        </View>
                      );
                    })()}

                    <Text style={{ color:'#9CA3AF', marginBottom: 6 }}>합계</Text>
                    <Text style={{ color:'#22C55E', fontSize: 22, fontWeight:'900', marginBottom: 12 }}>
                      {getCurrencySymbol(currency)}{formatMoney(incomeSum - spent)}
                    </Text>

                    {list.length === 0 ? (
                      <Text style={{ color:'#6B7280' }}>내역이 없습니다.</Text>
                    ) : (
                      list.map((e, idx)=> {
                        const amt = (e.type==='income'? 1 : -1) * e.amount;
                        const color = amt>=0? '#10B981':'#EF4444';
                        const pct = totalAbs>0? Math.round((e.amount/totalAbs)*100):0;
                        return (
                          <View key={e.id||idx} style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#1A1A1A' }}>
                            <View style={{ flexDirection:'row', alignItems:'center', gap: 8 }}>
                              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: getCategoryColor(e.category), alignItems:'center', justifyContent:'center' }}>
                                <Text style={{ color:'#0D0D0D', fontWeight:'900' }}>{pct}%</Text>
                              </View>
                              <View>
                                <Text style={{ color:'#FFFFFF', fontWeight:'700' }}>{e.description}</Text>
                                <Text style={{ color:'#6B7280', fontSize:12 }}>{e.date}</Text>
                              </View>
                            </View>
                            <Text style={{ color, fontWeight:'900' }}>{amt>=0? '+':'-'}{getCurrencySymbol(currency)}{formatMoney(Math.abs(amt))}</Text>
                          </View>
                        );
                      })
                    )}
                  </>
                );
              })()}
            </View>
            <View style={styles.addModalActions}>
              <TouchableOpacity style={styles.addModalCancel} onPress={()=>setCategoryDetail(null)}><Text style={styles.addModalCancelText}>{t('close', language)}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Diary Context Menu */}
      <Modal visible={!!diaryMenu} transparent animationType="fade" onRequestClose={()=>setDiaryMenu(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.taskMenuCard}>
            <Text style={styles.taskMenuTitle}>{diaryMenu?.title || '일기'}</Text>
            <View style={{ gap: 8 }}>
              <TouchableOpacity style={styles.menuBtnRow} onPress={()=>{ if (diaryMenu) { setDiaryEdit(diaryMenu); setDiaryMenu(null); } }}>
                <Text style={styles.menuBtnText}>{t('edit', language)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.menuBtnRow, { borderColor:'#7A1F1F' }]} onPress={()=>{ if (diaryMenu) { setDiaryEntries(list=> list.filter(e=> e.id!==diaryMenu.id)); setDiaryMenu(null); } }}>
                <Text style={[styles.menuBtnText, { color:'#FF6B6B' }]}>삭제</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={[styles.addModalCancel, { marginTop: 12 }]} onPress={()=>setDiaryMenu(null)}>
              <Text style={styles.addModalCancelText}>{t('close', language)}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Expense Context Menu */}
      <Modal visible={!!expenseMenu} transparent animationType="fade" onRequestClose={()=>setExpenseMenu(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.taskMenuCard}>
            <Text style={styles.taskMenuTitle}>{expenseMenu?.description || '항목'}</Text>
            <View style={{ gap: 8 }}>
              <TouchableOpacity style={styles.menuBtnRow} onPress={()=>{ if (expenseMenu) { setExpenseEdit(expenseMenu); setExpenseMenu(null); } }}>
                <Text style={styles.menuBtnText}>{t('edit', language)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.menuBtnRow, { borderColor:'#7A1F1F' }]} onPress={()=>{ if (expenseMenu) { setExpenseEntries(list=> list.filter(e=> e.id!==expenseMenu.id)); setExpenseMenu(null); } }}>
                <Text style={[styles.menuBtnText, { color:'#FF6B6B' }]}>삭제</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={[styles.addModalCancel, { marginTop: 12 }]} onPress={()=>setExpenseMenu(null)}>
              <Text style={styles.addModalCancelText}>{t('close', language)}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Memo Context Menu */}
      <Modal visible={!!memoMenu} transparent animationType="fade" onRequestClose={()=>setMemoMenu(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.taskMenuCard}>
            <Text style={styles.taskMenuTitle}>{memoMenu?.title || '메모'}</Text>
            <View style={{ gap: 8 }}>
              <TouchableOpacity style={styles.menuBtnRow} onPress={()=>{ if (memoMenu) { setMemoEdit(memoMenu); setMemoMenu(null); } }}>
                <Text style={styles.menuBtnText}>{t('edit', language)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.menuBtnRow, { borderColor:'#7A1F1F' }]} onPress={()=>{ if (memoMenu) { setMemoEntries(list=> list.filter(e=> e.id!==memoMenu.id)); setMemoMenu(null); } }}>
                <Text style={[styles.menuBtnText, { color:'#FF6B6B' }]}>삭제</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={[styles.addModalCancel, { marginTop: 12 }]} onPress={()=>setMemoMenu(null)}>
              <Text style={styles.addModalCancelText}>{t('close', language)}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Diary Preview Modal */}
      <Modal visible={!!diaryPreview} transparent animationType="fade" onRequestClose={()=>setDiaryPreview(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.addModalContainer, { maxHeight: '85%' }]}>
            <View style={styles.addModalHeader}>
              <Text style={styles.addModalTitle}>{t('previewDiary', language)}</Text>
              <TouchableOpacity onPress={()=>setDiaryPreview(null)}><Text style={styles.addModalClose}>✕</Text></TouchableOpacity>
            </View>
            <ScrollView style={{ paddingHorizontal: 20, paddingVertical: 16 }}>
              <Text style={styles.previewTitle}>{diaryPreview?.title}</Text>
              <Text style={styles.previewDate}>{diaryPreview?.date}</Text>
              {diaryPreview?.tags?.length ? (
                <View style={[styles.tagsContainer, { marginTop: 8 }]}>
                  {diaryPreview.tags.map((tag, idx)=> (
                    <View key={idx} style={styles.tag}><Text style={styles.tagText}>{tag}</Text></View>
                  ))}
                </View>
              ) : null}
              <Text style={styles.previewContent}>{diaryPreview?.content}</Text>
            </ScrollView>
            <View style={styles.addModalActions}>
              <TouchableOpacity style={styles.addModalCancel} onPress={()=>setDiaryPreview(null)}><Text style={styles.addModalCancelText}>{t('close', language)}</Text></TouchableOpacity>
              <TouchableOpacity style={styles.addModalSave} onPress={()=>{ if (diaryPreview) { setDiaryEdit(diaryPreview); setDiaryPreview(null); } }}><Text style={styles.addModalSaveText}>{t('edit', language)}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Diary Edit Modal */}
      <Modal visible={!!diaryEdit} transparent animationType="slide" onRequestClose={()=>setDiaryEdit(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.addModalContainer}>
            <View style={styles.addModalHeader}>
              <Text style={styles.addModalTitle}>{t('editDiary', language)}</Text>
              <TouchableOpacity onPress={()=>setDiaryEdit(null)}><Text style={styles.addModalClose}>✕</Text></TouchableOpacity>
            </View>
            <View style={styles.addModalContent}>
              <TextInput style={styles.addModalInput} placeholder="제목" placeholderTextColor="#6B7280" value={diaryEdit?.title||''} onChangeText={(t)=> setDiaryEdit(prev=> prev? { ...prev, title: t }: prev)} />
              <TextInput style={styles.addModalNote} placeholder="내용" placeholderTextColor="#6B7280" value={diaryEdit?.content||''} onChangeText={(t)=> setDiaryEdit(prev=> prev? { ...prev, content: t }: prev)} multiline />
              <TextInput style={styles.addModalInput} placeholder="태그(쉼표)" placeholderTextColor="#6B7280" value={(diaryEdit?.tags||[]).join(', ')} onChangeText={(t)=> setDiaryEdit(prev=> prev? { ...prev, tags: t.split(',').map(x=>x.trim()).filter(Boolean) }: prev)} />
            </View>
            <View style={styles.addModalActions}>
              <TouchableOpacity style={styles.addModalCancel} onPress={()=>setDiaryEdit(null)}><Text style={styles.addModalCancelText}>취소</Text></TouchableOpacity>
              <TouchableOpacity style={styles.addModalSave} onPress={()=>{ if (diaryEdit) { setDiaryEntries(list=> list.map(e=> e.id===diaryEdit.id? diaryEdit: e)); setDiaryEdit(null); setDiaryMenu(null); setDiaryPreview(null); } }}><Text style={styles.addModalSaveText}>저장</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Expense Edit Modal */}
      <Modal visible={!!expenseEdit} transparent animationType="slide" onRequestClose={()=>setExpenseEdit(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.addModalContainer}>
            <View style={styles.addModalHeader}>
              <Text style={styles.addModalTitle}>{t('editExpense', language)}</Text>
              <TouchableOpacity onPress={()=>setExpenseEdit(null)}><Text style={styles.addModalClose}>✕</Text></TouchableOpacity>
            </View>
            <View style={styles.addModalContent}>
              <TextInput style={styles.addModalInput} placeholder="금액" placeholderTextColor="#6B7280" keyboardType="decimal-pad" value={expenseEdit? String(expenseEdit.amount): ''} onChangeText={(t)=> setExpenseEdit(prev=> prev? { ...prev, amount: Number((t||'0').replace(/,/g,'')||0) }: prev)} />
              <TextInput style={styles.addModalInput} placeholder="카테고리" placeholderTextColor="#6B7280" value={expenseEdit?.category||'other'} onChangeText={(t)=> setExpenseEdit(prev=> prev? { ...prev, category: (t||'other') as any }: prev)} />
              <TextInput style={styles.addModalInput} placeholder="설명" placeholderTextColor="#6B7280" value={expenseEdit?.description||''} onChangeText={(t)=> setExpenseEdit(prev=> prev? { ...prev, description: t }: prev)} />
              <View style={styles.rowWrap}>
                <TouchableOpacity style={[styles.projectSelector, styles.toggleBtnSmall]} onPress={()=> setExpenseEdit(prev=> prev? { ...prev, type: (prev.type==='expense'?'income':'expense') }: prev)}>
                  <Text style={styles.projectSelectorText}>{expenseEdit?.type==='income'? '수입':'지출'}</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.addModalActions}>
              <TouchableOpacity style={styles.addModalCancel} onPress={()=>setExpenseEdit(null)}><Text style={styles.addModalCancelText}>취소</Text></TouchableOpacity>
              <TouchableOpacity style={styles.addModalSave} onPress={()=>{ if (expenseEdit) { setExpenseEntries(list=> list.map(e=> e.id===expenseEdit.id? expenseEdit: e)); setExpenseEdit(null); setExpenseMenu(null); } }}><Text style={styles.addModalSaveText}>저장</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Memo Edit Modal */}
      <Modal visible={!!memoEdit} transparent animationType="slide" onRequestClose={()=>setMemoEdit(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.addModalContainer}>
            <View style={styles.addModalHeader}>
              <Text style={styles.addModalTitle}>{t('editMemo', language)}</Text>
              <TouchableOpacity onPress={()=>setMemoEdit(null)}><Text style={styles.addModalClose}>✕</Text></TouchableOpacity>
            </View>
            <View style={styles.addModalContent}>
              <TextInput style={styles.addModalInput} placeholder="제목" placeholderTextColor="#6B7280" value={memoEdit?.title||''} onChangeText={(t)=> setMemoEdit(prev=> prev? { ...prev, title: t }: prev)} />
              <TextInput style={styles.addModalNote} placeholder="내용" placeholderTextColor="#6B7280" value={memoEdit?.content||''} onChangeText={(t)=> setMemoEdit(prev=> prev? { ...prev, content: t }: prev)} multiline />
            </View>
            <View style={styles.addModalActions}>
              <TouchableOpacity style={styles.addModalCancel} onPress={()=>setMemoEdit(null)}><Text style={styles.addModalCancelText}>취소</Text></TouchableOpacity>
              <TouchableOpacity style={styles.addModalSave} onPress={()=>{ if (memoEdit) { setMemoEntries(list=> list.map(e=> e.id===memoEdit.id? { ...e, title: memoEdit.title, content: memoEdit.content }: e)); setMemoEdit(null); setMemoMenu(null); } }}><Text style={styles.addModalSaveText}>저장</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 작업 편집 모달 */}
      <Modal visible={showEditModal} transparent animationType="slide" onRequestClose={()=>setShowEditModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.addModalContainer}>
            <View style={styles.addModalHeader}>
              <Text style={styles.addModalTitle}>제목 수정</Text>
              <TouchableOpacity onPress={()=>setShowEditModal(false)}><Text style={styles.addModalClose}>✕</Text></TouchableOpacity>
            </View>
            <View style={styles.addModalContent}>
              <TextInput style={styles.addModalInput} placeholder="작업명" placeholderTextColor="#6B7280" value={editDraft?.title||''} onChangeText={(t)=>setEditDraft({ ...(editDraft||{}), title:t })} />
              <TextInput style={styles.addModalNote} placeholder="메모" placeholderTextColor="#6B7280" value={editDraft?.note||''} onChangeText={(t)=>setEditDraft({ ...(editDraft||{}), note:t })} multiline />
              <View style={styles.addModalOptions}>
                <View style={styles.optionRow}>
                  <Text style={styles.optionLabel}>우선순위</Text>
                  <View style={styles.priorityOptions}>
                    {[1,2,3,4].map(p=> (
                      <TouchableOpacity key={p} style={[styles.priorityOption, { backgroundColor: getPriorityColor(p) }, (editDraft?.priority||4)===p && styles.priorityOptionActive]} onPress={()=>setEditDraft({ ...(editDraft||{}), priority: p as any })} />
                    ))}
                  </View>
                </View>
                <View style={styles.optionRow}>
                  <Text style={styles.optionLabel}>라벨(쉼표)</Text>
                  <TextInput style={styles.addModalInput} placeholder="work, home" value={(editDraft?.labels||[]).join(', ')} onChangeText={(t)=>setEditDraft({ ...(editDraft||{}), labels: t.split(',').map(x=>x.trim()).filter(Boolean) })} />
                </View>
                <View style={styles.optionRow}>
                  <Text style={styles.optionLabel}>마감/날짜</Text>
                  <TextInput style={styles.addModalInput} placeholder="YYYY-MM-DD 또는 텍스트" value={String(editDraft?.dueDate||'')} onChangeText={(t)=>setEditDraft({ ...(editDraft||{}), dueDate:t })} />
                </View>
              </View>
            </View>
            <View style={styles.addModalActions}>
              <TouchableOpacity style={styles.addModalCancel} onPress={()=>setShowEditModal(false)}><Text style={styles.addModalCancelText}>취소</Text></TouchableOpacity>
              <TouchableOpacity style={styles.addModalSave} onPress={()=>{ try { if (editDraft?.id) update(editDraft.id, { title: editDraft.title, note: editDraft.note, priority: editDraft.priority as any, labels: editDraft.labels as any, dueDate: editDraft.dueDate as any }); setShowEditModal(false);} catch {} }}><Text style={styles.addModalSaveText}>저장</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* Todoist 스타일 추가 모달 */}
      <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => setShowAddModal(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
            style={{ width: '100%' }}
          >
          <View style={[styles.addModalContainer, { paddingBottom: Math.max(insets.bottom, 0) }]}>
            <View style={styles.addModalHeader}>
              <Text style={styles.addModalTitle}>{t('addTodo', language)}</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Text style={styles.addModalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={{ maxHeight: '74%' }} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.addModalContent, { paddingBottom: 24 + keyboardInset }]}>
              <TextInput
                style={styles.addModalInput}
                placeholder={t('taskName', language)}
                placeholderTextColor="#6B7280"
                value={newTask.title}
                onChangeText={(text) => setNewTask({...newTask, title: text})}
                autoFocus
              />
              
              <TextInput
                style={styles.addModalNote}
                placeholder={t('addNote', language)}
                placeholderTextColor="#6B7280"
                value={newTask.note}
                onChangeText={(text) => setNewTask({...newTask, note: text})}
                multiline
              />
              
            <View style={styles.addModalOptions}>
                <View style={styles.optionRow}>
                  <Text style={styles.optionLabel}>{t('priority', language)}</Text>
                  <View style={styles.priorityOptions}>
                    {[1, 2, 3, 4].map((p) => (
                      <TouchableOpacity
                        key={p}
                        style={[
                          styles.priorityOption,
                          { backgroundColor: getPriorityColor(p) },
                          newTask.priority === p && styles.priorityOptionActive
                        ]}
                        onPress={() => setNewTask({...newTask, priority: p as 1|2|3|4})}
                      />
                    ))}
                  </View>
                </View>
                
                <View style={styles.optionRow}>
                  <Text style={styles.optionLabel}>{t('project', language)}</Text>
                  <TouchableOpacity 
                    style={styles.projectSelector}
                    onPress={() => setShowProjectSelector(true)}
                  >
                    <Text style={styles.projectSelectorText}>{getProjectName(newTask.project)}</Text>
                  </TouchableOpacity>
                </View>

              {/* 라벨 입력 */}
              <View style={styles.optionRow}>
                <Text style={styles.optionLabel}>라벨(쉼표)</Text>
                <TextInput
                  style={styles.addModalInput}
                  placeholder="work, home"
                  value={newTaskLabels}
                  onChangeText={setNewTaskLabels}
                />
              </View>

              {/* 마감/날짜 입력: 년/월/일 (+선택 시: 시:분:초) */}
              <View style={[styles.optionRow, { alignItems: 'center' }]}>
                <Text style={styles.optionLabel}>마감/날짜</Text>
              </View>
              <View style={styles.rowWrap}>
                <TextInput style={[styles.addModalInput, styles.inputThird]} placeholder="YYYY" keyboardType="number-pad" value={dueY} onChangeText={setDueY} />
                <TextInput style={[styles.addModalInput, styles.inputThird]} placeholder="MM" keyboardType="number-pad" value={dueM} onChangeText={setDueM} />
                <TextInput style={[styles.addModalInput, styles.inputThird]} placeholder="DD" keyboardType="number-pad" value={dueD} onChangeText={setDueD} />
              </View>
              <View style={styles.rowWrap}>
                <TouchableOpacity style={[styles.projectSelector, styles.toggleBtnSmall]} onPress={()=>setDueWithTime(v=>!v)}>
                  <Text style={styles.projectSelectorText}>{dueWithTime? '시간 입력 해제':'시간 입력'}</Text>
                </TouchableOpacity>
                {dueWithTime && (
                  <>
                    <TextInput style={[styles.addModalInput, styles.inputThird]} placeholder="hh" keyboardType="number-pad" value={dueH} onChangeText={setDueH} />
                    <TextInput style={[styles.addModalInput, styles.inputThird]} placeholder="mm" keyboardType="number-pad" value={dueMin} onChangeText={setDueMin} />
                    <TextInput style={[styles.addModalInput, styles.inputThird]} placeholder="ss" keyboardType="number-pad" value={dueS} onChangeText={setDueS} />
                  </>
                )}
              </View>
              </View>
            </ScrollView>
            
            <View style={styles.addModalActions}>
              <TouchableOpacity 
                style={styles.addModalCancel}
                onPress={() => setShowAddModal(false)}
              >
                <Text style={styles.addModalCancelText}>{t('cancel', language)}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.addModalSave}
                onPress={addNewTask}
              >
                <Text style={styles.addModalSaveText}>{t('addTodo', language)}</Text>
              </TouchableOpacity>
            </View>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* 일기 추가 모달 */}
      <Modal visible={showDiaryModal} transparent animationType="slide" onRequestClose={() => setShowDiaryModal(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0} style={{ width: '100%' }}>
          <View style={[styles.addModalContainer, { paddingBottom: Math.max(insets.bottom, 0) }]}>
            <View style={styles.addModalHeader}>
              <Text style={styles.addModalTitle}>{t('newDiaryEntry', language)}</Text>
              <TouchableOpacity onPress={() => setShowDiaryModal(false)}>
                <Text style={styles.addModalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={{ maxHeight: '74%' }} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.addModalContent, { paddingBottom: 24 + keyboardInset }]}>
              <TextInput
                style={styles.addModalInput}
                placeholder={t('entryTitle', language)}
                placeholderTextColor="#6B7280"
                value={newDiaryEntry.title}
                onChangeText={(text) => setNewDiaryEntry({...newDiaryEntry, title: text})}
                autoFocus
              />
              
              <TextInput
                style={styles.addModalNote}
                placeholder={t('writeYourThoughts', language)}
                placeholderTextColor="#6B7280"
                value={newDiaryEntry.content}
                onChangeText={(text) => setNewDiaryEntry({...newDiaryEntry, content: text})}
                multiline
              />
              
              <View style={styles.addModalOptions}>
                <View style={styles.optionRow}>
                  <Text style={styles.optionLabel}>{t('mood', language)}</Text>
                  <View style={styles.moodOptions}>
                    {(['happy', 'sad', 'neutral', 'excited', 'tired'] as const).map((mood) => (
                      <TouchableOpacity
                        key={mood}
                        style={[
                          styles.moodOption,
                          { backgroundColor: getMoodColor(mood) },
                          newDiaryEntry.mood === mood && styles.moodOptionActive
                        ]}
                        onPress={() => setNewDiaryEntry({...newDiaryEntry, mood})}
                      />
                    ))}
                  </View>
                </View>
              </View>
            </ScrollView>
            
            <View style={styles.addModalActions}>
              <TouchableOpacity 
                style={styles.addModalCancel}
                onPress={() => setShowDiaryModal(false)}
              >
                <Text style={styles.addModalCancelText}>{t('cancel', language)}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.addModalSave}
                onPress={addDiaryEntry}
              >
                <Text style={styles.addModalSaveText}>{t('saveEntry', language)}</Text>
              </TouchableOpacity>
            </View>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* 가계부 추가 모달 */}
      <Modal visible={showExpenseModal} transparent animationType="slide" onRequestClose={() => setShowExpenseModal(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0} style={{ width: '100%' }}>
          <View style={[styles.addModalContainer, { paddingBottom: Math.max(insets.bottom, 0) }]}>
            <View style={styles.addModalHeader}>
              <Text style={styles.addModalTitle}>{t('addExpenseRecord', language)}</Text>
              <TouchableOpacity onPress={() => setShowExpenseModal(false)}>
                <Text style={styles.addModalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={{ maxHeight: '74%' }} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.addModalContent, { paddingBottom: 24 + keyboardInset }]}>
              <View style={styles.optionRow}>
                <Text style={styles.optionLabel}>{t('type', language)}</Text>
                <View style={styles.typeOptions}>
                  <TouchableOpacity
                    style={[
                      styles.typeOption,
                      newExpenseEntry.type === 'expense' && styles.typeOptionActive
                    ]}
                    onPress={() => setNewExpenseEntry({...newExpenseEntry, type: 'expense'})}
                  >
                    <Text style={[
                      styles.typeOptionText,
                      newExpenseEntry.type === 'expense' && styles.typeOptionTextActive
                    ]}>{t('expense', language)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.typeOption,
                      newExpenseEntry.type === 'income' && styles.typeOptionActive
                    ]}
                    onPress={() => setNewExpenseEntry({...newExpenseEntry, type: 'income'})}
                  >
                    <Text style={[
                      styles.typeOptionText,
                      newExpenseEntry.type === 'income' && styles.typeOptionTextActive
                    ]}>{t('income', language)}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TextInput
                style={styles.addModalInput}
                placeholder={`${t('expenseAmount', language)} (${getCurrencySymbol(currency)})`}
                placeholderTextColor="#6B7280"
                value={newExpenseEntry.amount}
                onChangeText={handleAmountChange}
                keyboardType="numeric"
              />
              
              <TextInput
                style={styles.addModalInput}
                placeholder={t('description', language)}
                placeholderTextColor="#6B7280"
                value={newExpenseEntry.description}
                onChangeText={(text) => setNewExpenseEntry({...newExpenseEntry, description: text})}
              />
              
              <View style={styles.optionRow}>
                <Text style={styles.optionLabel}>{t('category', language)}</Text>
                <View style={styles.categoryOptions}>
                  {((newExpenseEntry.type === 'income'
                    ? (['salary','bonus','interest','dividend','investment','gift','other'] as const)
                    : (['food','transport','shopping','entertainment','health','other'] as const))
                  ).map((category) => (
                    <TouchableOpacity
                      key={category}
                      style={[
                        styles.categoryOption,
                        { backgroundColor: getCategoryColor(category) },
                        newExpenseEntry.category === category && !showCustomCategory && styles.categoryOptionActive
                      ]}
                      onPress={() => {
                        setNewExpenseEntry({...newExpenseEntry, category});
                        setShowCustomCategory(false);
                        setSelectedCategoryName(getCategoryName(category));
                      }}
                    />
                  ))}
                  <TouchableOpacity
                    style={[
                      styles.categoryOption,
                      { backgroundColor: '#6B7280' },
                      showCustomCategory && styles.categoryOptionActive
                    ]}
                    onPress={() => {
                      setShowCustomCategory(true);
                      setSelectedCategoryName('');
                    }}
                  />
                </View>
                
                {/* 카테고리 이름 표시/입력 공간 */}
                {showCustomCategory ? (
                  <TextInput
                    style={styles.categoryInputField}
                    placeholder={t('enterCategoryName', language)}
                    placeholderTextColor="#6B7280"
                    value={customCategory}
                    onChangeText={(text) => {
                      setCustomCategory(text);
                      setSelectedCategoryName(text);
                    }}
                    autoFocus
                  />
                ) : (
                  <Text style={styles.categoryNameText}>
                    {selectedCategoryName || getCategoryName(newExpenseEntry.category)}
                  </Text>
                )}
              </View>
            </ScrollView>
            
            <View style={styles.addModalActions}>
              <TouchableOpacity 
                style={styles.addModalCancel}
                onPress={() => setShowExpenseModal(false)}
              >
                <Text style={styles.addModalCancelText}>{t('cancel', language)}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.addModalSave}
                onPress={addExpenseEntry}
              >
                <Text style={styles.addModalSaveText}>{t('addExpenseRecord', language)}</Text>
              </TouchableOpacity>
            </View>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* 메모 추가 모달 */}
      <Modal visible={showMemoModal} transparent animationType="slide" onRequestClose={() => setShowMemoModal(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0} style={{ width: '100%' }}>
          <View style={[styles.addModalContainer, { paddingBottom: Math.max(insets.bottom, 0) }]}>
            <View style={styles.addModalHeader}>
              <Text style={styles.addModalTitle}>{t('newMemo', language)}</Text>
              <TouchableOpacity onPress={() => setShowMemoModal(false)}>
                <Text style={styles.addModalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={{ maxHeight: '74%' }} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.addModalContent, { paddingBottom: 24 + keyboardInset }]}>
              <TextInput
                style={styles.addModalInput}
                placeholder={t('memoTitle', language)}
                placeholderTextColor="#6B7280"
                value={newMemoEntry.title}
                onChangeText={(text) => setNewMemoEntry({...newMemoEntry, title: text})}
                autoFocus
              />
              
              <TextInput
                style={styles.addModalNote}
                placeholder={t('writeYourMemo', language)}
                placeholderTextColor="#6B7280"
                value={newMemoEntry.content}
                onChangeText={(text) => setNewMemoEntry({...newMemoEntry, content: text})}
                multiline
              />
              
              <View style={styles.optionRow}>
                <Text style={styles.optionLabel}>{t('color', language)}</Text>
                <View style={styles.colorOptions}>
                  {['#FFD700', '#EF4444', '#10B981', '#3B82F6', '#8B5CF6', '#F59E0B'].map((color) => (
                    <TouchableOpacity
                      key={color}
                      style={[
                        styles.colorOption,
                        { backgroundColor: color },
                        newMemoEntry.color === color && styles.colorOptionActive
                      ]}
                      onPress={() => setNewMemoEntry({...newMemoEntry, color})}
                    />
                  ))}
                </View>
              </View>
            </ScrollView>
            
            <View style={styles.addModalActions}>
              <TouchableOpacity 
                style={styles.addModalCancel}
                onPress={() => setShowMemoModal(false)}
              >
                <Text style={styles.addModalCancelText}>{t('cancel', language)}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.addModalSave}
                onPress={addMemoEntry}
              >
                <Text style={styles.addModalSaveText}>{t('createMemo', language)}</Text>
              </TouchableOpacity>
            </View>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Profile Sheet */}
      <ProfileSheet 
        visible={profileOpen}
        onClose={() => setProfileOpen(false)}
        onSaved={async (newAvatarUri) => {
          setAvatarUri(newAvatarUri);
          setProfileOpen(false);
          
          // username도 다시 로드
          if (currentUser?.uid) {
            const info = await AsyncStorage.getItem(`u:${currentUser.uid}:profile.info`);
            if (info) {
              try {
                const parsedInfo = JSON.parse(info);
                setUsername(parsedInfo.username || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User');
              } catch {
                setUsername(currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User');
              }
            }
          }
        }}
      />

      {/* Hamburger Menu */}
      <HamburgerMenu 
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        avatarUri={avatarUri}
      />

      {/* Search Modal */}
      <Modal visible={showSearchModal} transparent animationType="slide" onRequestClose={() => setShowSearchModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.searchModalContainer}>
            <View style={styles.searchModalHeader}>
              <Text style={styles.searchModalTitle}>Search</Text>
              <TouchableOpacity onPress={() => setShowSearchModal(false)}>
                <Text style={styles.searchModalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.searchInputContainer}>
              <Search size={20} color="#6B7280" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search tasks, diary, expenses, memos..."
                placeholderTextColor="#6B7280"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus
              />
            </View>
            
            <ScrollView style={styles.searchResults}>
              {searchQuery.trim() ? (
                getSearchResults().length > 0 ? (
                  getSearchResults().map((result, index) => (
                    <View key={index} style={styles.searchResultSection}>
                      <Text style={styles.searchResultSectionTitle}>
                        {result.title} ({result.count})
                      </Text>
                      {result.items.map((item, itemIndex) => (
                        <TouchableOpacity 
                          key={itemIndex} 
                          style={styles.searchResultItem}
                          onPress={() => {
                            setActiveTab(result.type as any);
                            setShowSearchModal(false);
                          }}
                        >
                          <Text style={styles.searchResultItemTitle}>
                            {result.type === 'tasks' ? item.title : 
                             result.type === 'diary' ? item.title :
                             result.type === 'money' ? item.description :
                             result.type === 'memo' ? item.title : ''}
                          </Text>
                          {result.type === 'tasks' && item.note && (
                            <Text style={styles.searchResultItemSubtitle} numberOfLines={1}>
                              {item.note}
                            </Text>
                          )}
                          {result.type === 'diary' && (
                            <Text style={styles.searchResultItemSubtitle} numberOfLines={1}>
                              {item.content}
                            </Text>
                          )}
                          {result.type === 'money' && (
                            <Text style={styles.searchResultItemSubtitle}>
                              {getCurrencySymbol(currency)}{formatMoney(item.amount)} • {item.category}
                            </Text>
                          )}
                          {result.type === 'memo' && (
                            <Text style={styles.searchResultItemSubtitle} numberOfLines={1}>
                              {item.content}
                            </Text>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  ))
                ) : (
                  <View style={styles.noResultsContainer}>
                    <Search size={48} color="#6B7280" />
                    <Text style={styles.noResultsTitle}>No results found</Text>
                    <Text style={styles.noResultsText}>Try searching for something else</Text>
                  </View>
                )
              ) : (
                <View style={styles.noResultsContainer}>
                  <Search size={48} color="#6B7280" />
                  <Text style={styles.noResultsTitle}>Search everything</Text>
                  <Text style={styles.noResultsText}>Search across tasks, diary entries, expenses, and memos</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Settings Modal */}
      <Modal visible={showSettingsModal} transparent animationType="slide" onRequestClose={() => setShowSettingsModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.settingsModalContainer}>
            <View style={styles.settingsModalHeader}>
              <Text style={styles.settingsModalTitle}>{t('todoSettings', language)}</Text>
              <TouchableOpacity onPress={() => setShowSettingsModal(false)}>
                <Text style={styles.settingsModalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.settingsContent}>
              <View style={styles.settingsSection}>
                <Text style={styles.settingsSectionTitle}>{t('display', language)}</Text>
                <TouchableOpacity 
                  style={styles.settingsItem}
                  onPress={() => setShowDefaultProjectModal(true)}
                >
                  <Text style={styles.settingsItemLabel}>{t('defaultProject', language)}</Text>
                  <View style={styles.settingsItemValueContainer}>
                    <Text style={styles.settingsItemValue}>{getProjectName(defaultProject)}</Text>
                    <Text style={styles.settingsItemArrow}>›</Text>
                  </View>
                </TouchableOpacity>
                <View style={styles.settingsItem}>
                  <Text style={styles.settingsItemLabel}>{t('sidebarMode', language)}</Text>
                  <Text style={styles.settingsItemValue}>{sidebarMode}</Text>
                </View>
              </View>
              
              <View style={styles.settingsSection}>
                <Text style={styles.settingsSectionTitle}>{t('data', language)}</Text>
                <View style={styles.settingsItem}>
                  <Text style={styles.settingsItemLabel}>{t('totalTasks', language)}</Text>
                  <Text style={styles.settingsItemValue}>{items.length}</Text>
                </View>
                <View style={styles.settingsItem}>
                  <Text style={styles.settingsItemLabel}>{t('completedTasks', language)}</Text>
                  <Text style={styles.settingsItemValue}>{items.filter(item => item.completed).length}</Text>
                </View>
                <View style={styles.settingsItem}>
                  <Text style={styles.settingsItemLabel}>{t('diaryEntries', language)}</Text>
                  <Text style={styles.settingsItemValue}>{diaryEntries.length}</Text>
                </View>
                <View style={styles.settingsItem}>
                  <Text style={styles.settingsItemLabel}>{t('expenseEntries', language)}</Text>
                  <Text style={styles.settingsItemValue}>{expenseEntries.length}</Text>
                </View>
                <View style={styles.settingsItem}>
                  <Text style={styles.settingsItemLabel}>{t('memoEntries', language)}</Text>
                  <Text style={styles.settingsItemValue}>{memoEntries.length}</Text>
                </View>
              </View>
              
              <View style={styles.settingsSection}>
                <Text style={styles.settingsSectionTitle}>{t('projectManagement', language)}</Text>
                <TouchableOpacity 
                  style={styles.settingsActionButton}
                  onPress={() => setShowProjectManagementModal(true)}
                >
                  <Text style={styles.settingsActionButtonText}>{t('manageProjects', language)}</Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.settingsSection}>
                <Text style={styles.settingsSectionTitle}>{t('actions', language)}</Text>
                <TouchableOpacity style={styles.settingsActionButton}>
                  <Text style={styles.settingsActionButtonText}>{t('clearCompletedTasks', language)}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.settingsActionButton}>
                  <Text style={styles.settingsActionButtonText}>{t('exportData', language)}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.settingsActionButton}>
                  <Text style={styles.settingsActionButtonText}>{t('resetAllData', language)}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Project Management Modal */}
      <Modal visible={showProjectManagementModal} transparent animationType="slide" onRequestClose={() => setShowProjectManagementModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.settingsModalContainer}>
            <View style={styles.settingsModalHeader}>
              <Text style={styles.settingsModalTitle}>{t('projectManagement', language)}</Text>
              <TouchableOpacity onPress={() => setShowProjectManagementModal(false)}>
                <Text style={styles.settingsModalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.settingsContent}>
              {/* Add New Project */}
              <View style={styles.settingsSection}>
                <Text style={styles.settingsSectionTitle}>{t('addNewProject', language)}</Text>
                <View style={styles.addProjectContainer}>
                  <TextInput
                    style={styles.addProjectInput}
                    placeholder={t('enterProjectName', language) as any}
                    value={newProjectName}
                    onChangeText={setNewProjectName}
                    onSubmitEditing={addProject}
                  />
                  <TouchableOpacity 
                    style={[styles.addProjectButton, !newProjectName.trim() && styles.addProjectButtonDisabled]}
                    onPress={addProject}
                    disabled={!newProjectName.trim()}
                  >
                    <Text style={styles.addProjectButtonText}>{t('add', language)}</Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              {/* Project List */}
              <View style={styles.settingsSection}>
                <Text style={styles.settingsSectionTitle}>{t('existingProjects', language)}</Text>
                {projects.map((project, index) => (
                  <View key={index} style={styles.mgmtProjectItem}>
                    <View style={styles.mgmtProjectInfo}>
                      <View style={[styles.mgmtProjectColorDot, { backgroundColor: project.color }]} />
                      {editingProject?.name === project.name ? (
                        <TextInput
                          style={styles.mgmtProjectNameInput}
                          value={editingProject.name}
                          onChangeText={(text) => setEditingProject({ ...editingProject, name: text })}
                          onSubmitEditing={() => renameProject(project.name, editingProject.name)}
                          autoFocus
                        />
                      ) : (
                        <Text style={styles.mgmtProjectName}>{getProjectName(project.name)}</Text>
                      )}
                      <Text style={styles.mgmtProjectCount}>({project.count})</Text>
                    </View>
                    <View style={styles.mgmtProjectActions}>
                      {project.name !== 'Inbox' && (
                        <>
                          <TouchableOpacity 
                            style={styles.mgmtProjectActionButton}
                            onPress={() => setEditingProject({ name: project.name, color: project.color })}
                          >
                            <Text style={styles.mgmtProjectActionText}>{t('rename', language)}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                            style={[styles.mgmtProjectActionButton, styles.deleteButton]}
                            onPress={() => deleteProject(project.name)}
                          >
                            <Text style={[styles.mgmtProjectActionText, styles.deleteButtonText]}>{t('delete', language)}</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Default Project Selection Modal */}
      <Modal visible={showDefaultProjectModal} transparent animationType="slide" onRequestClose={() => setShowDefaultProjectModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.settingsModalContainer}>
            <View style={styles.settingsModalHeader}>
              <Text style={styles.settingsModalTitle}>{t('selectDefaultProject', language)}</Text>
              <TouchableOpacity onPress={() => setShowDefaultProjectModal(false)}>
                <Text style={styles.settingsModalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.settingsContent}>
              <View style={styles.settingsSection}>
                <Text style={styles.settingsSectionTitle}>{t('chooseDefaultProject', language)}</Text>
                {projects
                  .slice()
                  .sort((a,b)=>{
                    const pin = (name:string)=> (name==='D-day'||name==='기념일')?0:1;
                    const pa = pin(a.name), pb = pin(b.name);
                    if (pa!==pb) return pa-pb;
                    if (a.name===defaultProject) return -1;
                    if (b.name===defaultProject) return 1;
                    return a.name.localeCompare(b.name);
                  })
                  .map((project, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.defaultProjectItem,
                      defaultProject === project.name && styles.defaultProjectItemActive
                    ]}
                    onPress={() => {
                      changeDefaultProject(project.name);
                      setShowDefaultProjectModal(false);
                    }}
                  >
                    <View style={styles.defaultProjectInfo}>
                      <View style={[styles.projectColorDot, { backgroundColor: project.color }]} />
                      <Text style={[
                        styles.defaultProjectName,
                        defaultProject === project.name && styles.defaultProjectNameActive
                      ]}>
                        {getProjectName(project.name)}
                      </Text>
                    </View>
                    {defaultProject === project.name && (
                      <Text style={styles.defaultProjectCheck}>✓</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Alarm Modal */}
      <Modal visible={showAlarmModal} transparent animationType="slide" onRequestClose={() => setShowAlarmModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.alarmModalContainer}>
            <View style={styles.alarmModalHeader}>
              <Text style={styles.alarmModalTitle}>{t('setAlarmTitle', language)}</Text>
              <TouchableOpacity onPress={() => setShowAlarmModal(false)}>
                <Text style={styles.alarmModalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.alarmModalContent}>
              <View style={styles.alarmInputGroup}>
                <Text style={styles.alarmLabel}>{t('timeLabel', language)}</Text>
                <TextInput
                  style={styles.alarmInput}
                  placeholder={`HH:MM (e.g., 09:30)`}
                  placeholderTextColor="#6B7280"
                  value={alarmTime}
                  onChangeText={(t)=> setAlarmTime(formatHhMm(t))}
                />
              </View>
              
              <View style={styles.alarmInputGroup}>
                <Text style={styles.alarmLabel}>{t('messageLabel', language)}</Text>
                <TextInput
                  style={styles.alarmInput}
                  placeholder={`${t('messageLabel', language)}...`}
                  placeholderTextColor="#6B7280"
                  value={alarmMessage}
                  onChangeText={setAlarmMessage}
                />
              </View>
              
              <View style={styles.alarmPreview}>
                <Bell size={24} color="#FFD700" />
                <Text style={styles.alarmPreviewText}>
                  {alarmTime ? `${t('alarmSetFor', language)} ${alarmTime}` : t('setAlarmTime', language)}
                </Text>
                {alarmMessage && (
                  <Text style={styles.alarmPreviewMessage}>{alarmMessage}</Text>
                )}
              </View>

              {/* Alarm List */}
              <View style={{ marginTop: 12 }}>
                <Text style={{ color:'#FFD700', fontWeight:'700', marginBottom: 8 }}>{t('alarmList', language)}</Text>
                {alarms.length === 0 ? (
                  <Text style={{ color:'#6B7280' }}>{t('noAlarms', language)}</Text>
                ) : (
                  alarms
                    .slice()
                    .sort((a,b)=>a.time-b.time)
                    .map((a)=>{
                      const d = new Date(a.time);
                      const hh = String(d.getHours()).padStart(2,'0');
                      const mm = String(d.getMinutes()).padStart(2,'0');
                      return (
                        <View key={a.id} style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingVertical:8, borderBottomWidth:1, borderColor:'#1A1A1A' }}>
                          <View style={{ flex:1 }}>
                            <Text style={{ color:'#FFFFFF', fontWeight:'600' }}>{hh}:{mm}</Text>
                            {!!a.message && <Text style={{ color:'#9CA3AF', fontSize:12 }}>{a.message}</Text>}
                          </View>
                          <View style={{ flexDirection:'row', gap:8 }}>
                            <TouchableOpacity onPress={()=>{
                              setEditingAlarm(a);
                              const dh = String(new Date(a.time).getHours()).padStart(2,'0');
                              const dm = String(new Date(a.time).getMinutes()).padStart(2,'0');
                              setAlarmTime(`${dh}:${dm}`);
                              setAlarmMessage(a.message||'');
                            }} style={[styles.notiMiniBtn,{ borderColor:'#CFCFFF' }]}>
                              <Text style={[styles.notiMiniBtnText,{ color:'#CFCFFF' }]}>{t('edit', language)}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={()=>{
                              setAlarms(list=> list.map(x=> x.id===a.id ? { ...x, enabled: !x.enabled, time: (!x.enabled && x.time <= Date.now()) ? (new Date(Date.now()+24*3600*1000).setHours(new Date(a.time).getHours(), new Date(a.time).getMinutes(), 0, 0)) : x.time } : x));
                            }} style={[styles.notiMiniBtn,{ borderColor:'#77DD77' }]}>
                              <Text style={[styles.notiMiniBtnText,{ color:'#77DD77' }]}>{a.enabled ? t('disable', language) : t('enable', language)}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={()=> setAlarms(list=> list.filter(x=> x.id!==a.id))} style={[styles.notiMiniBtn,{ borderColor:'#E6E6FA' }]}>
                              <Text style={[styles.notiMiniBtnText,{ color:'#E6E6FA' }]}>{t('delete', language)}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })
                )}
              </View>
            </View>
            
            <View style={styles.alarmModalActions}>
              <TouchableOpacity 
                style={styles.alarmModalCancel}
                onPress={() => setShowAlarmModal(false)}
              >
                <Text style={styles.alarmModalCancelText}>{t('cancel', language)}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.alarmModalSave}
                onPress={() => {
                  const tms = parseAlarmTime(alarmTime);
                  if (!tms) { try { Alert.alert('Alarm', 'HH:MM'); } catch {} return; }
                  if (editingAlarm) {
                    setAlarms(list => list.map(a => a.id===editingAlarm.id ? { ...a, time: tms, message: alarmMessage, enabled: true } : a));
                    setEditingAlarm(null);
                  } else {
                    const id = String(Date.now());
                    setAlarms(list => [{ id, time: tms, message: alarmMessage, enabled: true, createdAt: Date.now() }, ...list]);
                  }
                  setShowAlarmModal(false);
                  setAlarmTime('');
                  setAlarmMessage('');
                }}
              >
                <Text style={styles.alarmModalSaveText}>{t('setAlarm', language)}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Project Selector Modal */}
      <Modal visible={showProjectSelector} transparent animationType="slide" onRequestClose={() => setShowProjectSelector(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.projectSelectorModalContainer}>
            <View style={styles.projectSelectorModalHeader}>
              <Text style={styles.projectSelectorModalTitle}>{t('selectProject', language)}</Text>
              <TouchableOpacity onPress={() => setShowProjectSelector(false)}>
                <Text style={styles.projectSelectorModalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.projectSelectorModalContent}>
              {projects.map((project, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.projectOption,
                    ((editingTaskId? ((items.find(i=>i.id===editingTaskId) as any)?.project) : newTask.project) === project.name) && styles.projectOptionActive
                  ]}
                  onPress={() => {
                    if (editingTaskId) {
                      try { update(editingTaskId, { project: project.name }); } catch {}
                      setEditingTaskId('');
                    } else {
                      setNewTask({...newTask, project: project.name});
                    }
                    setShowProjectSelector(false);
                  }}
                >
                  <View style={[styles.projectColor, { backgroundColor: project.color }]} />
                  <Text style={[
                    styles.projectOptionText,
                    newTask.project === project.name && styles.projectOptionTextActive
                  ]}>
                    {getProjectName(project.name)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  // 메인 컨테이너
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  
  // 헤더 스타일
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    backgroundColor: '#0D0D0D',
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  karmaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  karmaText: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: '600',
  },
  headerIcons: {
    flexDirection: 'row',
    gap: 8,
  },
  searchButton: {
    padding: 8,
  },
  alarmButton: {
    padding: 8,
  },
  settingsButton: {
    padding: 8,
  },
  
  // 탭 스타일
  tabContainer: {
    marginTop: 16,
    width: '100%',
  },
  tabScrollContent: {
    paddingHorizontal: 0,
    gap: 0,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    marginHorizontal: 4,
  },
  tabActive: {
    backgroundColor: '#2A2A2A',
    borderColor: '#FFD700',
  },
  tabText: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#FFD700',
    fontWeight: '600',
  },
  
  // 빠른 추가
  quickAddContainer: {
    marginTop: 8,
  },
  quickAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  quickAddText: {
    color: '#6B7280',
    fontSize: 16,
  },
  
  // 콘텐츠 영역
  contentArea: {
    flex: 1,
    flexDirection: 'row',
  },
  
  // 사이드바
  sidebar: {
    flex: 3, // 기본값(렌더 직후 sidebarMode로 덮어씀)
    backgroundColor: '#000000',
    borderRightWidth: 1,
    borderRightColor: '#D4AF37',
    flexDirection: 'column',
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
  collapsedMenu: {
    marginTop: 8,
    gap: 6,
    alignItems: 'center',
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
  modeBtnCollapsed: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  modeBtnText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '600',
  },
  modeBtnTextActive: {
    color: '#0D0D0D',
  },
  projectList: {
    paddingTop: 2,
  },
  projectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    gap: 4,
    minHeight: 22,
    backgroundColor: '#000000',
  },
  projectItemActive: {
    backgroundColor: '#000000',
  },
  projectColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 6,
  },
  projectName: {
    flex: 1,
    color: '#CFCFCF',
    fontSize: 12,
    lineHeight: 14,
    includeFontPadding: false,
    textAlignVertical: 'center',
    paddingTop: 0,
    paddingBottom: 0,
    marginTop: 0,
    marginBottom: 0,
    // tiny label for sidebar projects
  },
  projectNameActive: {
    color: '#FFFFFF',
  },
  projectCount: {
    color: '#6B7280',
    fontSize: 12,
    lineHeight: 14,
    includeFontPadding: false,
  },
  
  // 메인 콘텐츠
  mainContent: {
    flex: 7, // 기본값(렌더 직후 sidebarMode로 덮어씀)
    backgroundColor: '#0D0D0D',
  },
  mainContentFull: {
    flex: 1,
  },
  tabContent: {
    flex: 1,
  },
  placeholderContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  placeholderTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 16,
    marginBottom: 8,
  },
  placeholderText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  contentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  contentTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    flexShrink: 1,
  },
  digitalClockWrap: {
    marginLeft: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#0A0A0A',
    borderWidth: 1,
    borderColor: '#0E2A2F',
  },
  digitalClockText: {
    color: '#3BE7FF',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 2,
    textShadowColor: '#00B9FF',
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 0 },
    // 고정폭 숫자
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  searchInline: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 8,
    color: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 10,
  },
  // 가계부 잔액 카드
  balanceCard: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 12,
    backgroundColor: '#111',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E1E1E',
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  balanceLabel: { color: '#9CA3AF', fontSize: 13 },
  balanceValue: { fontSize: 22, fontWeight: '900' },
  favStar: { color: '#FFD700', fontSize: 16, fontWeight: '900' },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor:'#2A2A2A', backgroundColor:'#1A1A1A' },
  chipActive: { borderColor:'#FFD700', backgroundColor:'#2A2A2A' },
  chipText: { color:'#CFCFCF', fontSize: 12 },
  chipTextActive: { color:'#FFD700', fontWeight:'700' },
  ratioWrap: { height: 10, backgroundColor:'#1A1A1A', borderRadius: 6, overflow:'hidden', flexDirection:'row', borderWidth:1, borderColor:'#2A2A2A' },
  ratioIncome: { backgroundColor:'#10B981' },
  ratioExpense: { backgroundColor:'#EF4444' },
  bigClockWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  bigClockText: {
    fontSize: 62,
    fontWeight: '900',
    letterSpacing: 3,
    textShadowColor: '#00B9FF',
    textShadowRadius: 16,
    textShadowOffset: { width: 0, height: 0 },
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  taskCount: {
    color: '#6B7280',
    fontSize: 14,
  },
  // Calendar styles for Anniversary
  calendarContainer: { marginHorizontal: 20, marginTop: 8, marginBottom: 12, backgroundColor:'#111', borderRadius:12, borderWidth:1, borderColor:'#1E1E1E', padding: 10 },
  calendarHeader: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom: 6 },
  calendarTitle: { color:'#FFFFFF', fontSize:16, fontWeight:'700' },
  calendarNav: { color:'#FFD700', fontSize:18, fontWeight:'800', paddingHorizontal:10 },
  dowRow: { flexDirection:'row', justifyContent:'space-between', marginBottom: 4 },
  dowText: { width: `${100/7}%`, textAlign:'center', color:'#B8B8B8', fontSize:12 },
  weeksWrap: { gap: 4 },
  weekRow: { flexDirection:'row', justifyContent:'space-between' },
  dayCell: { width: `${100/7}%`, aspectRatio: 1, alignItems:'center', justifyContent:'center', borderRadius: 6, backgroundColor:'#1A1A1A', position:'relative' },
  dayCellSelected: { backgroundColor:'#2A2A2A', borderWidth:1, borderColor:'#FFD700' },
  dayCellHasEvent: { borderWidth: 1, borderColor: '#D4AF37' },
  dayText: { color:'#E0E0E0', fontSize: 12, fontWeight: '600' },
  dayBadge: { position:'absolute', top: 4, right: 4, minWidth: 18, height:18, borderRadius: 9, backgroundColor:'#FFD700', alignItems:'center', justifyContent:'center', paddingHorizontal: 5 },
  dayBadgeText: { color:'#000', fontSize:11, fontWeight:'700' },
  dayDot: { position:'absolute', bottom: 6, width: 6, height: 6, borderRadius: 3, backgroundColor:'#FFD700' },
  taskList: {
    padding: 20,
    paddingBottom: 120,
  },
  
  // 작업 아이템
  taskItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  taskCheckbox: {
    marginRight: 12,
    marginTop: 2,
  },
  checkboxCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxCompleted: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  taskContent: {
    flex: 1,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  taskTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 22,
  },
  taskCompleted: {
    textDecorationLine: 'line-through',
    color: '#6B7280',
  },
  taskActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  priorityBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'transparent',
  },
  priorityBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  priorityFlag: {
    width: 4,
    height: 16,
    borderRadius: 2,
  },
  moreButton: {
    padding: 4,
  },
  taskNote: {
    color: '#9CA3AF',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  taskMeta: {
    flexDirection: 'row',
    gap: 8,
  },
  ddayGroup: { flexDirection: 'column', gap: 6, alignItems: 'flex-start' },
  projectTag: {
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  projectText: {
    color: '#CFCFCF',
    fontSize: 4,
    lineHeight: 6,
  },
  dueDateTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  dueDateText: {
    color: '#6B7280',
    fontSize: 12,
  },
  ddayContainer: {
    backgroundColor: '#1F2937',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FFD700'
  },
  ddayText: {
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    textAlign: 'center'
  },
  ddayClockWrap: {
    backgroundColor: '#0A0A0A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#0E2A2F'
  },
  ddayClockText: {
    color: '#3BE7FF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
    textShadowColor: '#00B9FF',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 0 },
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  labelsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  labelChip: { backgroundColor: '#1A1A1A', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1, borderColor: '#2A2A2A' },
  labelChipText: { color: '#B8B8B8', fontSize: 11 },
  
  // 모달 스타일
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  addModalContainer: {
    backgroundColor: '#0D0D0D',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  taskMenuCard: { backgroundColor:'#0D0D0D', margin:20, borderRadius:12, padding:16, borderWidth:1, borderColor:'#2A2A2A' },
  taskMenuTitle: { color:'#FFFFFF', fontSize:16, fontWeight:'700', marginBottom:10 },
  menuBtnRow: { paddingVertical:10, paddingHorizontal:12, borderWidth:1, borderColor:'#333', borderRadius:8 },
  menuBtnText: { color:'#CFCFCF', fontSize:14, fontWeight:'600' },
  addModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  addModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  addModalClose: {
    fontSize: 20,
    color: '#6B7280',
  },
  addModalContent: {
    padding: 20,
  },
  addModalInput: {
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 16,
    marginBottom: 16,
  },
  addModalNote: {
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 14,
    height: 80,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  addModalOptions: {
    gap: 16,
  },
  rowWrap: { flexDirection:'row', alignItems:'center', flexWrap:'wrap', gap:8, marginTop: 6 },
  inputThird: { flexGrow: 1, flexBasis: '30%', minWidth: 84 },
  toggleBtnSmall: { paddingHorizontal: 10, paddingVertical: 8 },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  optionLabel: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  priorityOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityOption: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  priorityOptionActive: {
    borderColor: '#FFFFFF',
  },
  projectSelector: {
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  projectSelectorText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  addModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
  },
  addModalCancel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  addModalCancelText: {
    color: '#6B7280',
    fontSize: 14,
  },
  addModalSave: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  addModalSaveText: {
    color: '#0D0D0D',
    fontSize: 14,
    fontWeight: '600',
  },
  
  // 추가 버튼 스타일
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  addButtonText: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  primaryButtonText: {
    color: '#0D0D0D',
    fontSize: 16,
    fontWeight: '600',
  },
  
  // 리스트 컨테이너
  listContainer: {
    padding: 20,
    paddingBottom: 120,
  },
  
  // 일기 카드 스타일
  diaryCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  diaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  diaryTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  moodIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  diaryDate: {
    color: '#6B7280',
    fontSize: 12,
    marginBottom: 8,
  },
  diaryContent: {
    color: '#9CA3AF',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tagText: {
    color: '#6B7280',
    fontSize: 12,
  },
  
  // 가계부 카드 스타일
  expenseCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  expenseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  expenseHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  expenseDescription: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  expenseRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    maxWidth: '50%',
    minWidth: 120,
  },
  expenseAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'right',
    flexShrink: 1,
  },
  expenseMenuBtn: { marginLeft: 0 },
  expenseMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  categoryText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  expenseDate: {
    color: '#6B7280',
    fontSize: 12,
  },
  
  // 메모 카드 스타일
  memoCard: {
    flex: 1,
    margin: 6,
    borderRadius: 12,
    padding: 16,
    minHeight: 120,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  memoCardFull: {
    flexBasis: '100%',
    maxWidth: '100%',
  },
  memoTitle: {
    color: '#0D0D0D',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  memoContent: {
    color: '#0D0D0D',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
    flex: 1,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  memoDate: {
    color: '#0D0D0D',
    fontSize: 12,
    opacity: 0.7,
  },
  
  // 모달 옵션 스타일
  moodOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  moodOption: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  moodOptionActive: {
    borderColor: '#FFFFFF',
  },
  typeOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  typeOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  typeOptionActive: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },
  typeOptionText: {
    color: '#6B7280',
    fontSize: 12,
  },
  typeOptionTextActive: {
    color: '#0D0D0D',
    fontWeight: '600',
  },
  categoryOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryOption: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  categoryOptionActive: {
    borderColor: '#FFFFFF',
  },
  colorOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  colorOption: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorOptionActive: {
    borderColor: '#FFFFFF',
  },
  
  // 검색 모달 스타일
  searchModalContainer: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    marginTop: 100,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  searchModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  searchModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  searchModalClose: {
    fontSize: 24,
    color: '#6B7280',
    fontWeight: 'bold',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
    paddingVertical: 8,
  },
  searchResults: {
    flex: 1,
    paddingHorizontal: 20,
  },
  searchResultSection: {
    marginTop: 20,
  },
  searchResultSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFD700',
    marginBottom: 12,
  },
  searchResultItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    marginBottom: 8,
  },
  searchResultItemTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  searchResultItemSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  noResultsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  noResultsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 16,
    marginBottom: 8,
  },
  noResultsText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  
  // 설정 모달 스타일
  settingsModalContainer: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    marginTop: 100,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  settingsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  settingsModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  settingsModalClose: {
    fontSize: 24,
    color: '#6B7280',
    fontWeight: 'bold',
  },
  settingsContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  settingsSection: {
    marginTop: 24,
  },
  settingsSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFD700',
    marginBottom: 12,
  },
  settingsItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  settingsItemLabel: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  settingsItemValue: {
    fontSize: 16,
    color: '#6B7280',
  },
  settingsActionButton: {
    backgroundColor: '#1A1A1A',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  settingsActionButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  
  // 알람 모달 스타일
  alarmModalContainer: {
    backgroundColor: '#0D0D0D',
    marginHorizontal: 20,
    marginTop: 150,
    borderRadius: 20,
    maxHeight: '70%',
  },
  alarmModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  alarmModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  alarmModalClose: {
    fontSize: 24,
    color: '#6B7280',
    fontWeight: 'bold',
  },
  alarmModalContent: {
    padding: 20,
  },
  alarmInputGroup: {
    marginBottom: 20,
  },
  alarmLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  alarmInput: {
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  alarmPreview: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  alarmPreviewText: {
    fontSize: 16,
    color: '#FFFFFF',
    marginTop: 8,
    textAlign: 'center',
  },
  alarmPreviewMessage: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
    textAlign: 'center',
  },
  alarmModalActions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
    gap: 12,
  },
  alarmModalCancel: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  alarmModalCancelText: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '600',
  },
  alarmModalSave: {
    flex: 1,
    backgroundColor: '#FFD700',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  alarmModalSaveText: {
    fontSize: 16,
    color: '#0D0D0D',
    fontWeight: '600',
  },
  
  // 프로젝트 선택 모달 스타일
  projectSelectorModalContainer: {
    backgroundColor: '#1A1A1A',
    margin: 20,
    borderRadius: 12,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: '#333333'
  },
  projectSelectorModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333333'
  },
  projectSelectorModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF'
  },
  projectSelectorModalClose: {
    fontSize: 20,
    color: '#6B7280',
    fontWeight: 'bold'
  },
  projectSelectorModalContent: {
    padding: 20
  },
  projectOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8
  },
  projectOptionActive: {
    backgroundColor: '#FFD70020',
    borderWidth: 1,
    borderColor: '#FFD700'
  },
  projectOptionText: {
    fontSize: 16,
    color: '#FFFFFF',
    marginLeft: 12
  },
  projectOptionTextActive: {
    color: '#FFD700',
    fontWeight: '600'
  },
  
  // Project Management Styles
  addProjectContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16
  },
  addProjectInput: {
    flex: 1,
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#333333'
  },
  addProjectButton: {
    backgroundColor: '#FFD700',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center'
  },
  addProjectButtonDisabled: {
    backgroundColor: '#333333',
    opacity: 0.5
  },
  addProjectButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '600'
  },
  mgmtProjectItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    marginBottom: 8
  },
  mgmtProjectInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  mgmtProjectColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12
  },
  mgmtProjectName: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '500',
    flex: 1
  },
  mgmtProjectNameInput: {
    fontSize: 16,
    color: '#FFFFFF',
    backgroundColor: '#333333',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    flex: 1,
    marginRight: 8
  },
  mgmtProjectCount: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 8
  },
  mgmtProjectActions: {
    flexDirection: 'row',
    gap: 8
  },
  mgmtProjectActionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#333333'
  },
  mgmtProjectActionText: {
    fontSize: 14,
    color: '#FFFFFF'
  },
  deleteButton: {
    backgroundColor: '#EF4444'
  },
  deleteButtonText: {
    color: '#FFFFFF'
  },
  
  // Default Project Selection Styles
  settingsItemValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  settingsItemArrow: {
    fontSize: 18,
    color: '#6B7280'
  },
  defaultProjectItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    marginBottom: 8
  },
  defaultProjectItemActive: {
    backgroundColor: '#FFD70020',
    borderWidth: 1,
    borderColor: '#FFD700'
  },
  defaultProjectInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  defaultProjectName: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '500',
    marginLeft: 12
  },
  defaultProjectNameActive: {
    color: '#FFD700',
    fontWeight: '600'
  },
  defaultProjectCheck: {
    fontSize: 18,
    color: '#FFD700',
    fontWeight: 'bold'
  },
  // Diary Preview Styles
  previewTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4
  },
  previewDate: {
    color: '#9CA3AF',
    fontSize: 12,
    marginBottom: 12
  },
  previewContent: {
    color: '#E5E7EB',
    fontSize: 14,
    lineHeight: 22,
    marginTop: 6
  },
  
  // Category Name Display Styles
  categoryNameText: {
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'right',
    marginTop: 8
  },
  categoryInputField: {
    backgroundColor: '#FFFFFF',
    color: '#000000',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    marginTop: 8,
    textAlign: 'left'
  },
  
  // Minimized Project List Styles
  minimizedProjectList: {
    paddingTop: 6,
    alignItems: 'center'
  },
  minimizedProjectItem: {
    paddingVertical: 3,
    paddingHorizontal: 2,
    marginBottom: 2,
    borderRadius: 4,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center'
  },
  minimizedProjectItemActive: {
    backgroundColor: '#1A1A1A'
  },
  memoCardFull: {
    flex: 1,
    margin: 6,
    borderRadius: 12,
    padding: 16,
    minHeight: 120,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
});


