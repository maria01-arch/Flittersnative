import { View, StyleSheet } from 'react-native';
import Text from '@/components/AppText';
import { useTheme } from '@/lib/ThemeContext';

// A small bar chart made of plain Views (no chart library): one bar per day.
export default function MiniBars({ values, labels, height = 120, color }: { values: number[]; labels?: string[]; height?: number; color?: string }) {
  const { colors } = useTheme();
  const max = Math.max(1, ...values);
  const tint = color || colors.primary;
  const gap = values.length > 45 ? 1 : values.length > 20 ? 2 : 4;
  return (
    <View>
      <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap }}>
        {values.map((v, i) => (
          <View key={i} style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
            <View style={{ height: Math.max(v > 0 ? 3 : 1, (v / max) * height), borderRadius: 3, backgroundColor: v > 0 ? tint : colors.border, opacity: v > 0 ? 1 : 0.6 }} />
          </View>
        ))}
      </View>
      {labels && labels.length > 1 ? (
        <View style={styles.axis}>
          <Text style={{ color: colors.faint, fontSize: 11 }}>{labels[0]}</Text>
          <Text style={{ color: colors.faint, fontSize: 11 }}>{labels[labels.length - 1]}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 } });
