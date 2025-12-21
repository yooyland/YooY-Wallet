import React from 'react';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { isAdmin } from '@/constants/admins';
import { router, Redirect, useRootNavigationState } from 'expo-router';

export default function AdminReports() {
  const { currentUser } = useAuth();
  const admin = currentUser?.email ? isAdmin(currentUser.email) : false;
  const navState = useRootNavigationState();
  if (!navState?.key) return null;
  if (!admin) return <Redirect href="/(tabs)/dashboard" />;

  return (
    <ThemedView style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={()=>router.back()} style={styles.backBtn}><ThemedText style={styles.backText}>←</ThemedText></TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Reports</ThemedText>
      </View>
      <View style={styles.card}><ThemedText style={{ color:'#9CA3AF' }}>준비 중입니다.</ThemedText></View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:'#0D0D0D' },
  headerRow: { flexDirection:'row', alignItems:'center', gap:8, padding:16, paddingBottom:8 },
  backBtn: { width:32, height:32, borderRadius:6, borderWidth:1, borderColor:'#2A2A2A', alignItems:'center', justifyContent:'center', backgroundColor:'#111' },
  backText: { color:'#FFD700', fontWeight:'900', fontSize:16 },
  headerTitle: { color:'#FFFFFF', fontWeight:'900', fontSize:18 },
  card: { backgroundColor:'#111', borderWidth:1, borderColor:'#1E1E1E', borderRadius:12, padding:12, marginHorizontal:16, marginBottom:12 },
});


