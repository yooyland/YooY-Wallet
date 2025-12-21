import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { Alert, Switch, View, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { t } from '@/i18n';
import { usePreferences } from '@/contexts/PreferencesContext';

export default function SecurityScreen() {
  const { language } = usePreferences();
  const [biometric, setBiometric] = React.useState(false);
  const [twoFactor, setTwoFactor] = React.useState(false);
  const [loginAlerts, setLoginAlerts] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        const b = await AsyncStorage.getItem('security.biometric');
        const tfa = await AsyncStorage.getItem('security.2fa');
        const la = await AsyncStorage.getItem('security.loginAlerts');
        if (b) setBiometric(b === 'true');
        if (tfa) setTwoFactor(tfa === 'true');
        if (la) setLoginAlerts(la === 'true');
      } catch {}
    })();
  }, []);

  const setAndSave = async (key: string, value: boolean, setter: (v: boolean) => void) => {
    setter(value);
    try { await AsyncStorage.setItem(key, String(value)); } catch {}
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={()=>router.back()} style={styles.backBtn}><ThemedText style={styles.backText}>‹</ThemedText></TouchableOpacity>
        <ThemedText style={styles.headerTitle}>{t('security', language) || 'Security'}</ThemedText>
      </View>
      <View style={styles.card}>
        <View style={styles.row}>
          <ThemedText style={styles.label}>{t('biometricLogin', language) || 'Biometric login'}</ThemedText>
          <Switch value={biometric} onValueChange={(v)=>setAndSave('security.biometric', v, setBiometric)} />
        </View>
        <View style={styles.row}>
          <ThemedText style={styles.label}>{t('twoFactor', language) || 'Two-factor (app code)'}</ThemedText>
          <Switch value={twoFactor} onValueChange={(v)=>setAndSave('security.2fa', v, setTwoFactor)} />
        </View>
        <View style={styles.row}>
          <ThemedText style={styles.label}>{t('loginAlerts', language) || 'Login alerts'}</ThemedText>
          <Switch value={loginAlerts} onValueChange={(v)=>setAndSave('security.loginAlerts', v, setLoginAlerts)} />
        </View>
      </View>
      <View style={styles.card}>
        <ThemedText style={styles.cardTitle}>{t('sessions', language) || 'Sessions'}</ThemedText>
        <TouchableOpacity style={styles.button} onPress={()=>Alert.alert(t('done', language) || 'Done', t('allSessionsSignedOut', language) || 'All sessions will be signed out on next sync.')}>
          <ThemedText style={styles.buttonText}>{t('signOutAll', language) || 'Sign out all devices'}</ThemedText>
        </TouchableOpacity>
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
  cardTitle: { color:'#FFD700', fontWeight:'800', marginBottom: 8 },
  button: { backgroundColor:'#FFD700', borderRadius:8, paddingVertical:10, alignItems:'center' },
  buttonText: { color:'#000', fontWeight:'800' },
});


