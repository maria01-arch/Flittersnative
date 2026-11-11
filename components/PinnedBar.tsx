import { useEffect, useRef, useState } from 'react';
import { Animated, View, TouchableOpacity, StyleSheet } from 'react-native';
import Text from '@/components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';
import { spacing } from '@/lib/theme';
import type { PinnedItem } from '@/lib/pins';

// One preview line for up to 3 pinned messages. The little stripes on the left
// show how many are stacked and which one you are looking at. Tap it: the chat
// jumps to that message and the next pinned message slides up.
export default function PinnedBar({ items, onJump }: { items: PinnedItem[]; onJump: (id: string) => void }) {
  const { colors } = useTheme();
  const [idx, setIdx] = useState(0);
  const anim = useRef(new Animated.Value(1)).current;
  const n = items.length;

  useEffect(() => {
    if (idx >= n) setIdx(0);
  }, [n, idx]);

  if (!n) return null;
  const at = Math.min(idx, n - 1);
  const cur = items[at];

  const press = () => {
    onJump(cur.id);
    if (n > 1) {
      setIdx((at + 1) % n);
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    }
  };

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={press} style={[styles.bar, { backgroundColor: colors.bubbleTheirs, borderBottomColor: colors.border }]}>
      {n > 1 && (
        <View style={styles.tracker}>
          {items.map((it, i) => (
            <View key={it.id} style={[styles.seg, { backgroundColor: i === at ? colors.primary : colors.faint, opacity: i === at ? 1 : 0.45 }]} />
          ))}
        </View>
      )}
      <Ionicons name="pin" size={14} color={colors.primary} />
      <Animated.View
        style={{ flex: 1, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}
      >
        <Text style={[styles.label, { color: colors.primary }]}>{n > 1 ? `Pinned message #${at + 1}` : 'Pinned message'}</Text>
        <Text style={[styles.text, { color: colors.text }]} numberOfLines={1}>
          {cur.label}
        </Text>
      </Animated.View>
      {n > 1 && (
        <Text style={[styles.count, { color: colors.subtext }]}>
          {at + 1}/{n}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.lg, paddingVertical: 7, borderBottomWidth: 1, minHeight: 46 },
  tracker: { width: 3, height: 30, gap: 2 },
  seg: { flex: 1, borderRadius: 2 },
  label: { fontSize: 11, fontWeight: '700' },
  text: { fontSize: 13, marginTop: 1 },
  count: { fontSize: 11, fontWeight: '700' },
});
