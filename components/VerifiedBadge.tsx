import { View, Image, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

export default function VerifiedBadges({ verified, isAuthentic, size = 14 }: { verified?: boolean; isAuthentic?: boolean; size?: number }) {
  if (!verified && !isAuthentic) return null;
  return (
    <View style={styles.row}>
      {verified && (
        <View style={[styles.goldBadge, { width: size + 4, height: size + 4, borderRadius: (size + 4) / 2 }]}>
          <Ionicons name="checkmark" size={size - 3} color="#C9A84C" />
        </View>
      )}
      {isAuthentic && <Ionicons name="shield-checkmark" size={size + 2} color="#1877F2" />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  goldBadge: {
    backgroundColor: '#16213e',
    borderWidth: 1.5,
    borderColor: '#C9A84C',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
