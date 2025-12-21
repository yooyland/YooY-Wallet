import React from 'react';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { t } from '@/i18n';
import { usePreferences } from '@/contexts/PreferencesContext';

export default function ThemeSettings() {
  const { language } = usePreferences();
  return (
    <ThemedView style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={()=>router.back()} style={styles.backBtn}><ThemedText style={styles.backText}>←</ThemedText></TouchableOpacity>
        <ThemedText style={styles.headerTitle}>{t('theme', language) || 'Theme'}</ThemedText>
      </View>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.iconSample} />
          <ThemedText style={styles.rowText}>{t('blackGoldTheme', language)} : {t('icon', language)}</ThemedText>
        </View>
        <ThemedText style={styles.desc}>{t('blackGoldTheme', language)} {t('isDefault', language) || 'is default. No other options.'}</ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:'#0D0D0D', padding:16 },
  headerRow: { height:36, flexDirection:'row', alignItems:'center', gap:8, marginBottom:8 },
  backBtn: { width: 32, height: 32, alignItems:'center', justifyContent:'center', borderWidth:1, borderColor:'#2A2A2A', borderRadius:6, backgroundColor:'#111' },
  backText: { color:'#FFD700', fontWeight:'900', fontSize:18 },
  headerTitle: { color:'#FFFFFF', fontWeight:'800', fontSize:18 },
  card: { backgroundColor:'#111', borderWidth:1, borderColor:'#1E1E1E', borderRadius:12, padding:12, marginTop:8 },
  row: { flexDirection:'row', alignItems:'center', gap:10, marginBottom:8 },
  iconSample: { width:16, height:16, borderRadius:4, backgroundColor:'#D4AF37', borderWidth:1, borderColor:'#3A2E00' },
  rowText: { color:'#E5E7EB' },
  desc: { color:'#9CA3AF', marginTop:4 },
});


