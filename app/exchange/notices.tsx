import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { isAdmin } from '@/constants/admins';
import { useAuth } from '@/contexts/AuthContext';
import { BoardPost, createPost, deletePost as deleteBoardPost, subscribePosts, updatePost } from '@/lib/boards';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

type Notice = BoardPost & { id: string };

export default function ExchangeNoticesPage() {
  const { currentUser } = useAuth();
  const canAdmin = useMemo(() => !!currentUser?.email && isAdmin(currentUser.email), [currentUser?.email]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    const unsub = subscribePosts('dex-notices', { visibleOnly: false, onData: (rows) => setNotices(rows as any) });
    return () => unsub();
  }, []);

  const submit = async () => {
    if (!canAdmin) return Alert.alert('Only admin', '관리자만 등록 가능합니다.');
    if (!title.trim()) return Alert.alert('필수 입력', '제목을 입력하세요.');
    try {
      await createPost('dex-notices', { title: title.trim(), body: content.trim(), author: currentUser?.email || '', visible: true, pinned: false });
      setTitle('');
      setContent('');
    } catch (e) {
      Alert.alert('오류', '등록에 실패했습니다.');
    }
  };

  const remove = async (id: string) => {
    if (!canAdmin) return;
    try { await deleteBoardPost('dex-notices', id); } catch {}
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.title}>DEX Notices</ThemedText>
      {canAdmin && (
        <View style={styles.form}>
          <TextInput style={styles.input} placeholder="Title" value={title} onChangeText={setTitle} />
          <TextInput style={[styles.input, { height: 80 }]} placeholder="Content" multiline value={content} onChangeText={setContent} />
          <TouchableOpacity style={styles.btn} onPress={submit}><ThemedText style={styles.btnText}>Post</ThemedText></TouchableOpacity>
        </View>
      )}

      <FlatList
        data={notices}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <ThemedText style={styles.cardTitle}>{item.title}</ThemedText>
            <ThemedText>{item.body}</ThemedText>
            {canAdmin && (
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                <TouchableOpacity style={styles.delBtn} onPress={() => updatePost('dex-notices', item.id!, { pinned: !item.pinned })}>
                  <ThemedText style={styles.delText}>{item.pinned ? 'Unpin' : 'Pin'}</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity style={styles.delBtn} onPress={() => updatePost('dex-notices', item.id!, { visible: item.visible === false ? true : false })}>
                  <ThemedText style={styles.delText}>{item.visible === false ? 'Show' : 'Hide'}</ThemedText>
                </TouchableOpacity>
              </View>
            )}
            {canAdmin && (
              <TouchableOpacity style={styles.delBtn} onPress={() => remove(item.id)}>
                <ThemedText style={styles.delText}>Delete</ThemedText>
              </TouchableOpacity>
            )}
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  form: { borderWidth: 1, borderColor: '#D4AF37', borderRadius: 8, padding: 12, marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#444', borderRadius: 8, padding: 10, marginBottom: 8 },
  btn: { backgroundColor: '#D4AF37', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  btnText: { color: '#000', fontWeight: '700' },
  card: { borderWidth: 1, borderColor: '#333', borderRadius: 8, padding: 12 },
  cardTitle: { fontWeight: '700', marginBottom: 6 },
  delBtn: { marginTop: 8, alignSelf: 'flex-end' },
  delText: { color: '#e74c3c' },
});

// (Duplicate legacy AsyncStorage-based notices removed)
