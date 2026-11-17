import { View, StyleSheet } from 'react-native';
import Text from '@/components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';

// A small flame with the number of days. Dimmed when today's messages are not both in yet.
export default function StreakFlame({ days, atRisk, size = 13 }: { days: number; atRisk?: boolean; size?: number }) {
  if (days < 2) return null;
  const c = atRisk ? '#9CA3AF' : '#F97316';
  return (
    <View style={styles.wrap}>
      <Ionicons name="flame" size={size + 2} color={c} />
      <Text style={{ color: c, fontSize: size, fontWeight: '800' }}>{days}</Text>
    </View>
  );
}
const styles = StyleSheet.create({ wrap: { flexDirection: 'row', alignItems: 'center', gap: 1 } });
