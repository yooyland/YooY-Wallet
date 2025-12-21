import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { usePreferences } from '@/contexts/PreferencesContext';
import { t } from '@/i18n';

export default function LanguageScreen() {
  const { language, setLanguage } = usePreferences();
  const langs: Array<'en'|'ko'|'ja'|'zh'> = ['en','ko','ja','zh'];
  return (
    <ThemedView style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={()=>router.back()} style={styles.backBtn}><ThemedText style={styles.backText}>←</ThemedText></TouchableOpacity>
        <ThemedText style={styles.headerTitle}>{t('language', language)}</ThemedText>
      </View>
      <View style={styles.list}>
        {langs.map(l => (
          <TouchableOpacity key={l} style={[styles.item, language===l && styles.itemActive]} onPress={()=>setLanguage(l)}>
            <ThemedText style={[styles.itemText, language===l && styles.itemTextActive]}>{l.toUpperCase()}</ThemedText>
            {language===l && <ThemedText style={styles.check}>✓</ThemedText>}
          </TouchableOpacity>
        ))}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#0D0D0D' },
  headerRow: { height: 36, flexDirection:'row', alignItems:'center', gap:8, marginBottom:8 },
  backBtn: { width: 32, height: 32, alignItems:'center', justifyContent:'center', borderWidth:1, borderColor:'#2A2A2A', borderRadius:6, backgroundColor:'#111' },
  backText: { color:'#FFD700', fontSize:18, fontWeight:'900' },
  headerTitle: { color:'#FFFFFF', fontWeight:'800', fontSize:18 },
  list: { backgroundColor:'#111', borderWidth:1, borderColor:'#1E1E1E', borderRadius:12 },
  item: { paddingVertical:14, paddingHorizontal:12, borderBottomWidth:1, borderBottomColor:'#1A1A1A', flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  itemActive: { backgroundColor:'#151515' },
  itemText: { color:'#E5E7EB' },
  itemTextActive: { color:'#FFD700', fontWeight:'800' },
  check: { color:'#FFD700', fontWeight:'800' }
});


