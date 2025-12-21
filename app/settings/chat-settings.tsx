import React from 'react';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { router } from 'expo-router';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import ChatSettingsScreen from '@/app/chat/settings';

export default function ChatSettingsEntry() {
  return (
    <ThemedView style={{ flex:1, backgroundColor:'#0D0D0D' }}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={()=>router.back()} style={styles.backBtn}><ThemedText style={styles.backText}>←</ThemedText></TouchableOpacity>
        <ThemedText style={styles.headerTitle}>Chat Settings</ThemedText>
      </View>
      <ChatSettingsScreen />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  headerRow: { padding: 8, flexDirection:'row', alignItems:'center', gap:8 },
  backBtn: { width: 32, height: 32, alignItems:'center', justifyContent:'center', borderWidth:1, borderColor:'#2A2A2A', borderRadius:6, backgroundColor:'#111' },
  backText: { color:'#FFD700', fontSize:18, fontWeight:'900' },
  headerTitle: { color:'#FFFFFF', fontWeight:'800', fontSize:18 },
});


