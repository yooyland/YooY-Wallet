import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/AuthContext';
import { isAdmin } from '@/constants/admins';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, TextInput, TouchableOpacity, View, ScrollView } from 'react-native';
import { usePreferences } from '@/contexts/PreferencesContext';

type BoardType = 'bug' | 'inquiry' | 'report';

type Post = {
  id: string;
  uid: string;
  email: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  reply?: string;
  status?: 'open' | 'answered';
};

export default function Board({ boardType, title }: { boardType: BoardType; title: string }) {
  const { currentUser } = useAuth();
  const { language } = usePreferences();
  const L = useMemo(() => {
    if (language === 'ko') return {
      newPost: '새 글 쓰기', title: '제목', content: '내용', submit: '등록',
      edit: '수정', save: '저장', cancel: '취소',
      statusOpen: '대기', statusAnswered: '답변완료',
      reply: '답변', replySave: '답변 저장', adminReply: '관리자 답변',
      noPosts: '등록된 글이 없습니다.', replyPlaceholder: '답변을 입력하세요'
    };
    if (language === 'ja') return {
      newPost: '新規投稿', title: 'タイトル', content: '内容', submit: '登録',
      edit: '編集', save: '保存', cancel: 'キャンセル',
      statusOpen: '保留', statusAnswered: '回答済み',
      reply: '回答', replySave: '回答を保存', adminReply: '管理者の回答',
      noPosts: '投稿がありません。', replyPlaceholder: '回答を入力してください'
    };
    if (language === 'zh') return {
      newPost: '新建帖子', title: '标题', content: '内容', submit: '提交',
      edit: '编辑', save: '保存', cancel: '取消',
      statusOpen: '待处理', statusAnswered: '已回复',
      reply: '回复', replySave: '保存回复', adminReply: '管理员回复',
      noPosts: '暂无帖子。', replyPlaceholder: '请输入回复'
    };
    return {
      newPost: 'New Post', title: 'Title', content: 'Content', submit: 'Submit',
      edit: 'Edit', save: 'Save', cancel: 'Cancel',
      statusOpen: 'Open', statusAnswered: 'Answered',
      reply: 'Reply', replySave: 'Save Reply', adminReply: 'Admin Reply',
      noPosts: 'No posts yet.', replyPlaceholder: 'Type a reply'
    };
  }, [language]);
  const uid = currentUser?.uid || 'guest';
  const email = currentUser?.email || 'guest';
  const admin = currentUser?.email ? isAdmin(currentUser.email) : false;
  const storageKey = `board:${boardType}`;
  const { focus, id } = useLocalSearchParams<{ focus?: string; id?: string }>();
  const focusId = String(focus || id || '');
  const scrollRef = useRef<ScrollView | null>(null);
  const [positions, setPositions] = useState<Record<string, number>>({});
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const [posts, setPosts] = useState<Post[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(storageKey);
      const list: Post[] = raw ? JSON.parse(raw) : [];
      setPosts(list);
    } catch {}
  }, [storageKey]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (focusId && positions[focusId] != null) {
      scrollRef.current?.scrollTo({ y: Math.max(positions[focusId] - 12, 0), animated: true });
      setHighlightId(focusId);
      const timer = setTimeout(()=> setHighlightId(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [focusId, positions]);

  const visiblePosts = useMemo(() => {
    if (admin) return posts.slice().sort((a,b)=>b.createdAt-a.createdAt);
    return posts.filter(p => p.uid === uid).slice().sort((a,b)=>b.createdAt-a.createdAt);
  }, [posts, admin, uid]);

  const save = async (list: Post[]) => {
    setPosts(list);
    await AsyncStorage.setItem(storageKey, JSON.stringify(list));
  };

  const addPost = async () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    const now = Date.now();
    const post: Post = {
      id: `${now}`,
      uid, email,
      title: newTitle.trim(),
      content: newContent.trim(),
      createdAt: now,
      updatedAt: now,
      status: 'open',
    };
    await save([post, ...posts]);
    setNewTitle(''); setNewContent('');
  };

  const startEdit = (p: Post) => {
    setEditingId(p.id);
    setEditTitle(p.title);
    setEditContent(p.content);
  };

  const commitEdit = async () => {
    if (!editingId) return;
    const next = posts.map(p => p.id === editingId ? { ...p, title: editTitle.trim(), content: editContent.trim(), updatedAt: Date.now() } : p);
    await save(next);
    setEditingId(null);
    setEditTitle(''); setEditContent('');
  };

  const adminReply = async (id: string) => {
    const text = (replyDraft[id] || '').trim();
    const next = posts.map(p => p.id === id ? { ...p, reply: text, status: 'answered', updatedAt: Date.now() } : p);
    await save(next);
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={async()=>{ try { await AsyncStorage.setItem('ui.menuOpenOnce','1'); } catch{} router.push('/(tabs)/dashboard'); }} style={styles.backBtn}>
          <ThemedText style={styles.backText}>←</ThemedText>
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>{title}</ThemedText>
      </View>

      {/* New post form (users) */}
      <View style={styles.card}>
        <ThemedText style={styles.cardTitle}>{L.newPost}</ThemedText>
        <TextInput style={styles.input} value={newTitle} onChangeText={setNewTitle} placeholder={L.title} placeholderTextColor="#666" />
        <TextInput style={[styles.input, { height:100 }]} value={newContent} onChangeText={setNewContent} placeholder={L.content} placeholderTextColor="#666" multiline />
        <TouchableOpacity style={styles.button} onPress={addPost}><ThemedText style={styles.buttonText}>{L.submit}</ThemedText></TouchableOpacity>
      </View>

      {/* Posts list */}
      <ScrollView ref={scrollRef} style={{ flex:1 }} contentContainerStyle={{ paddingBottom: 20 }}>
        {visiblePosts.length === 0 ? (
          <View style={styles.card}><ThemedText style={{ color:'#9CA3AF' }}>{L.noPosts}</ThemedText></View>
        ) : (
          visiblePosts.map(p => (
            <View
              key={p.id}
              onLayout={e => setPositions(prev => ({ ...prev, [p.id]: e.nativeEvent.layout.y }))}
              style={[
                styles.card,
                (highlightId === p.id) && { borderColor:'#FFD700' }
              ]}
            >
              {editingId === p.id ? (
                <>
                  <TextInput style={styles.input} value={editTitle} onChangeText={setEditTitle} placeholder={L.title} placeholderTextColor="#666" />
                  <TextInput style={[styles.input, { height:100 }]} value={editContent} onChangeText={setEditContent} multiline placeholder={L.content} placeholderTextColor="#666" />
                  <View style={{ flexDirection:'row', gap:8 }}>
                    <TouchableOpacity style={[styles.button, { backgroundColor:'#333' }]} onPress={()=>{ setEditingId(null); }}><ThemedText style={{ color:'#fff', fontWeight:'800' }}>{L.cancel}</ThemedText></TouchableOpacity>
                    <TouchableOpacity style={styles.button} onPress={commitEdit}><ThemedText style={styles.buttonText}>{L.save}</ThemedText></TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
                    <ThemedText style={styles.postTitle}>{p.title}</ThemedText>
                    <ThemedText style={[styles.status, { color: p.status==='answered' ? '#22C55E' : '#FFD700' }]}>{p.status==='answered'?L.statusAnswered:L.statusOpen}</ThemedText>
                  </View>
                  <ThemedText style={styles.postMeta}>{p.email} · {new Date(p.createdAt).toLocaleString()}</ThemedText>
                  <ThemedText style={styles.postBody}>{p.content}</ThemedText>
                  {/* User can edit own post */}
                  {!admin && p.uid===uid && (
                    <TouchableOpacity style={[styles.smallBtn,{ alignSelf:'flex-end' }]} onPress={()=>startEdit(p)}>
                      <ThemedText style={styles.smallBtnText}>{L.edit}</ThemedText>
                    </TouchableOpacity>
                  )}
                  {/* Admin reply area */}
                  {admin && (
                    <View style={{ marginTop:8 }}>
                      <ThemedText style={{ color:'#FFD700', fontWeight:'800', marginBottom:4 }}>{L.reply}</ThemedText>
                      <TextInput
                        style={[styles.input, { height:80 }]}
                        value={replyDraft[p.id] ?? p.reply ?? ''}
                        onChangeText={(t)=>setReplyDraft(prev=>({ ...prev, [p.id]:t }))}
                        placeholder={L.replyPlaceholder}
                        placeholderTextColor="#666"
                        multiline
                      />
                      <TouchableOpacity style={[styles.button, { alignSelf:'flex-end' }]} onPress={()=>adminReply(p.id)}>
                        <ThemedText style={styles.buttonText}>{L.replySave}</ThemedText>
                      </TouchableOpacity>
                    </View>
                  )}
                  {/* Show reply to user */}
                  {!admin && p.reply && (
                    <View style={{ marginTop:8, borderTopWidth:1, borderTopColor:'#222', paddingTop:8 }}>
                      <ThemedText style={{ color:'#FFD700', fontWeight:'800', marginBottom:4 }}>{L.adminReply}</ThemedText>
                      <ThemedText style={{ color:'#E5E7EB' }}>{p.reply}</ThemedText>
                    </View>
                  )}
                </>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:'#0D0D0D' },
  headerRow: { flexDirection:'row', alignItems:'center', gap:8, padding:16, paddingBottom:8 },
  backBtn: { width: 32, height: 32, alignItems:'center', justifyContent:'center', borderWidth:1, borderColor:'#2A2A2A', borderRadius:6, backgroundColor:'#111' },
  backText: { color:'#FFD700', fontWeight:'900', fontSize:16 },
  headerTitle: { color:'#FFFFFF', fontWeight:'900', fontSize:18 },
  card: { backgroundColor:'#111', borderWidth:1, borderColor:'#1E1E1E', borderRadius:12, padding:12, marginHorizontal:16, marginBottom:12 },
  cardTitle: { color:'#FFFFFF', fontWeight:'800', marginBottom:8 },
  input: { backgroundColor:'#0F0F0F', borderWidth:1, borderColor:'#2A2A2A', color:'#FFFFFF', borderRadius:8, paddingHorizontal:10, paddingVertical:8, marginBottom:8 },
  button: { backgroundColor:'#FFD700', borderRadius:8, paddingVertical:10, paddingHorizontal:16, alignItems:'center' },
  buttonText: { color:'#000', fontWeight:'900' },
  postTitle: { color:'#FFFFFF', fontWeight:'800', fontSize:16 },
  postMeta: { color:'#9CA3AF', marginBottom:6 },
  postBody: { color:'#E5E7EB' },
  status: { fontWeight:'800' },
  smallBtn: { backgroundColor:'#1E1E1E', paddingHorizontal:10, paddingVertical:6, borderRadius:8, borderWidth:1, borderColor:'#333' },
  smallBtnText: { color:'#FFFFFF', fontWeight:'700' },
});


