import { Image } from 'expo-image';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  title?: string;
  onMenuPress?: () => void;
  onAvatarPress?: () => void;
  avatarUri?: string | null;
};

export default function TopBar({ title = 'admin', onMenuPress, onAvatarPress, avatarUri }: Props) {
  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.left} onPress={onAvatarPress}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={styles.defaultAvatar}>
            <Text style={styles.defaultAvatarText}>U</Text>
          </View>
        )}
        <Text style={styles.name}>{title}</Text>
      </TouchableOpacity>
      <Image source={require('@/assets/images/logo.png')} style={styles.logo} contentFit="contain" />
      <TouchableOpacity onPress={onMenuPress} style={styles.menuBtn}>
        <View style={styles.menuLine} />
        <View style={styles.menuLine} />
        <View style={styles.menuLine} />
      </TouchableOpacity>
    </View>
  );
}

const GOLD = '#D4AF37';

const styles = StyleSheet.create({
  container: {
    height: 56,
    backgroundColor: '#0A0A0A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: GOLD,
  },
  left: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 28, height: 28, borderRadius: 14, marginRight: 8, borderWidth: 1, borderColor: GOLD },
  defaultAvatar: { width: 28, height: 28, borderRadius: 14, marginRight: 8, borderWidth: 1, borderColor: GOLD, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' },
  defaultAvatarText: { color: '#0A0A0A', fontWeight: 'bold', fontSize: 14 },
  name: { color: '#ffffff', fontWeight: '600' },
  logo: { width: 60, height: 28 },
  menuBtn: { padding: 6 },
  menuLine: { width: 18, height: 2, backgroundColor: GOLD, marginVertical: 2 },
});


