import React from 'react';
import { Platform, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { usePreferences, type WebLayoutMode } from '@/contexts/PreferencesContext';

export default function LayoutSettings() {
  const { language, webLayoutMode, setWebLayoutMode, webLayoutPercent, setWebLayoutPercent } = usePreferences();
  const title = language === 'ko' ? '화면 너비' : 'Layout width';

  const items: Array<{ key: WebLayoutMode; title: string; desc: string }> = [
    {
      key: 'phone',
      title: language === 'ko' ? '모바일 폭(폰처럼)' : 'Phone width',
      desc: language === 'ko' ? 'PC에서는 모바일 프레임처럼 고정 폭으로 표시' : 'On desktop, render in a phone-like fixed frame',
    },
    {
      key: 'fluid',
      title: language === 'ko' ? '브라우저 100%' : 'Browser 100%',
      desc: language === 'ko' ? 'PC에서는 화면 전체 폭으로 넓게 표시' : 'On desktop, expand to full browser width',
    },
    {
      key: 'custom',
      title: language === 'ko' ? '사용자 지정(%)' : 'Custom (%)',
      desc: language === 'ko' ? 'PC에서는 입력한 % 폭으로 표시 (예: 70%)' : 'On desktop, use the percentage width you set (e.g. 70%)',
    },
  ];

  return (
    <ThemedView style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ThemedText style={styles.backText}>←</ThemedText>
        </TouchableOpacity>
        <ThemedText style={styles.headerTitle}>{title}</ThemedText>
      </View>

      <View style={styles.card}>
        {items.map((it) => {
          const active = webLayoutMode === it.key;
          return (
            <TouchableOpacity
              key={it.key}
              style={[styles.row, active && styles.rowActive]}
              onPress={() => {
                void setWebLayoutMode(it.key);
              }}
            >
              <View style={[styles.radio, active && styles.radioActive]} />
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.rowTitle}>{it.title}</ThemedText>
                <ThemedText style={styles.rowDesc}>{it.desc}</ThemedText>
                {it.key === 'custom' && (
                  <View style={styles.customPctRow}>
                    <TextInput
                      value={String(webLayoutPercent)}
                      onChangeText={(t) => {
                        const n = Math.floor(Number(String(t || '').replace(/[^\d]/g, '')));
                        void setWebLayoutPercent(Number.isFinite(n) ? n : webLayoutPercent);
                      }}
                      onFocus={() => { if (webLayoutMode !== 'custom') void setWebLayoutMode('custom'); }}
                      keyboardType={Platform.OS === 'web' ? 'default' : 'number-pad'}
                      inputMode="numeric"
                      style={styles.pctInput}
                      placeholder="80"
                      placeholderTextColor="#555"
                      maxLength={3}
                    />
                    <ThemedText style={styles.pctSuffix}>%</ThemedText>
                    <View style={{ flex: 1 }} />
                    <TouchableOpacity
                      onPress={() => { void setWebLayoutPercent(60); if (webLayoutMode !== 'custom') void setWebLayoutMode('custom'); }}
                      style={styles.presetBtn}
                    >
                      <ThemedText style={styles.presetText}>60%</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => { void setWebLayoutPercent(80); if (webLayoutMode !== 'custom') void setWebLayoutMode('custom'); }}
                      style={styles.presetBtn}
                    >
                      <ThemedText style={styles.presetText}>80%</ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => { void setWebLayoutPercent(100); void setWebLayoutMode('fluid'); }}
                      style={styles.presetBtn}
                    >
                      <ThemedText style={styles.presetText}>100%</ThemedText>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D', padding: 16 },
  headerRow: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#2A2A2A', borderRadius: 6, backgroundColor: '#111' },
  backText: { color: '#FFD700', fontWeight: '900', fontSize: 18 },
  headerTitle: { color: '#FFFFFF', fontWeight: '800', fontSize: 18 },
  card: { backgroundColor: '#111', borderWidth: 1, borderColor: '#1E1E1E', borderRadius: 12, padding: 12, marginTop: 8, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#1E1E1E', backgroundColor: '#0F0F0F' },
  rowActive: { borderColor: '#3A2E00', backgroundColor: '#111' },
  radio: { width: 18, height: 18, borderRadius: 9, marginTop: 2, borderWidth: 2, borderColor: '#555', backgroundColor: 'transparent' },
  radioActive: { borderColor: '#D4AF37', backgroundColor: '#D4AF37' },
  rowTitle: { color: '#E5E7EB', fontWeight: '800' },
  rowDesc: { color: '#9CA3AF', fontSize: 12, marginTop: 4 },
  customPctRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  pctInput: {
    width: 72,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    backgroundColor: '#0B0B0B',
    color: '#E5E7EB',
    paddingHorizontal: 10,
    fontWeight: '800',
    textAlign: 'right',
  },
  pctSuffix: { color: '#D4AF37', fontWeight: '900' },
  presetBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: '#2A2A2A', backgroundColor: '#0B0B0B' },
  presetText: { color: '#CFCFCF', fontWeight: '800', fontSize: 12 },
});

