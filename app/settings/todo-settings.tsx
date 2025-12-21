import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { router } from 'expo-router';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { t } from '@/i18n';
import { usePreferences } from '@/contexts/PreferencesContext';

export default function TodoSettingsEntry() {
  const { language } = usePreferences();
  return (
    <ThemedView style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={()=>router.back()} style={styles.backBtn}><ThemedText style={styles.backText}>←</ThemedText></TouchableOpacity>
        <ThemedText style={styles.headerTitle}>{t('todoSettings', language) || 'To-Do Settings'}</ThemedText>
      </View>
      <ThemedText style={styles.desc}>{t('manageOnTodoPage', language) || 'Manage calendar/projects inside the To-Do page.'}</ThemedText>
      <TouchableOpacity style={styles.button} onPress={()=>router.push('/(tabs)/todo')}>
        <ThemedText style={styles.buttonText}>{t('openTodo', language) || 'Open To-Do'}</ThemedText>
      </TouchableOpacity>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:'#0D0D0D', padding:16 },
  headerRow: { height:36, flexDirection:'row', alignItems:'center', gap:8, marginBottom:8 },
  backBtn: { width: 32, height: 32, alignItems:'center', justifyContent:'center', borderWidth:1, borderColor:'#2A2A2A', borderRadius:6, backgroundColor:'#111' },
  backText: { color:'#FFD700', fontWeight:'900', fontSize:18 },
  headerTitle: { color:'#FFFFFF', fontWeight:'800', fontSize:18 },
  desc: { color:'#9CA3AF', marginBottom:12 },
  button: { backgroundColor:'#FFD700', borderRadius:8, paddingVertical:10, alignItems:'center' },
  buttonText: { color:'#000', fontWeight:'800' }
});


