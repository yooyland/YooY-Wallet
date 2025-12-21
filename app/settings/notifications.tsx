import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { StyleSheet, Switch, View, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { t } from '@/i18n';
import { usePreferences } from '@/contexts/PreferencesContext';

export default function NotificationsScreen() {
  const { language } = usePreferences();
  const [orderFilled, setOrderFilled] = React.useState(true);
  const [priceAlerts, setPriceAlerts] = React.useState(false);
  const [newsAlerts, setNewsAlerts] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('prefs.notifications');
        if (raw) {
          const j = JSON.parse(raw);
          setOrderFilled(!!j.orderFilled);
          setPriceAlerts(!!j.priceAlerts);
          setNewsAlerts(!!j.newsAlerts);
        }
      } catch {}
    })();
  }, []);

  const persist = async (next: any) => {
    try { await AsyncStorage.setItem('prefs.notifications', JSON.stringify(next)); } catch {}
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={()=>router.back()} style={styles.backBtn}><ThemedText style={styles.backText}>←</ThemedText></TouchableOpacity>
        <ThemedText style={styles.headerTitle}>{t('notifications', language)}</ThemedText>
      </View>
      <View style={styles.card}>
        <View style={styles.row}>
          <ThemedText style={styles.label}>{t('orderFilled', language) || 'Order filled'}</ThemedText>
          <Switch value={orderFilled} onValueChange={(v)=>{ setOrderFilled(v); persist({ orderFilled:v, priceAlerts, newsAlerts }); }} />
        </View>
        <View style={styles.row}>
          <ThemedText style={styles.label}>{t('priceAlerts', language) || 'Price alerts'}</ThemedText>
          <Switch value={priceAlerts} onValueChange={(v)=>{ setPriceAlerts(v); persist({ orderFilled, priceAlerts:v, newsAlerts }); }} />
        </View>
        <View style={styles.row}>
          <ThemedText style={styles.label}>{t('news', language) || 'News'}</ThemedText>
          <Switch value={newsAlerts} onValueChange={(v)=>{ setNewsAlerts(v); persist({ orderFilled, priceAlerts, newsAlerts:v }); }} />
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#0D0D0D' },
  headerRow: { height: 36, flexDirection:'row', alignItems:'center', gap:8, marginBottom:8 },
  backBtn: { width: 32, height: 32, alignItems:'center', justifyContent:'center', borderWidth:1, borderColor:'#2A2A2A', borderRadius:6, backgroundColor:'#111' },
  backText: { color:'#FFD700', fontSize:18, fontWeight:'900' },
  headerTitle: { color: '#FFFFFF', fontWeight: '800', fontSize: 18 },
  card: { backgroundColor:'#111', borderWidth:1, borderColor:'#1E1E1E', borderRadius:12, padding:12, marginBottom:12 },
  row: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#1A1A1A' },
  label: { color:'#E5E7EB' },
});


