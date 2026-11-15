import { useEffect, useRef, useState } from 'react';
import { Animated, View, TouchableOpacity, StyleSheet } from 'react-native';
import Text from '@/components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';

export type ComposerAction = { key: string; icon: any; label: string; onPress: () => void };

// One "+" button in the typing bar instead of a row of icons (so the typing box stays wide).
// Tap it: it turns into an X and the options pop out above the bar with a little bounce.
export function PlusButton({ open, onPress, size = 28 }: { open: boolean; onPress: () => void; size?: number }) {
  const { colors } = useTheme();
  const spin = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(spin, { toValue: open ? 1 : 0, friction: 5, tension: 160, useNativeDriver: true }).start();
  }, [open, spin]);
  return (
    <TouchableOpacity onPress={onPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      <Animated.View style={{ transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] }) }] }}>
        <Ionicons name="add-circle" size={size} color={colors.primary} />
      </Animated.View>
    </TouchableOpacity>
  );
}

// The row that pops out above the typing bar. Put it right above the bar (not inside it).
export function ActionTray({ open, actions, onClose }: { open: boolean; actions: ComposerAction[]; onClose: () => void }) {
  const { colors } = useTheme();
  const [mounted, setMounted] = useState(open);
  const box = useRef(new Animated.Value(open ? 1 : 0)).current;
  const items = useRef<Animated.Value[]>([]);
  while (items.current.length < actions.length) items.current.push(new Animated.Value(open ? 1 : 0));

  useEffect(() => {
    if (open) {
      setMounted(true);
      items.current.forEach((v) => v.setValue(0));
      Animated.timing(box, { toValue: 1, duration: 140, useNativeDriver: false }).start();
      Animated.stagger(
        70,
        items.current.slice(0, actions.length).map((v) => Animated.spring(v, { toValue: 1, friction: 4, tension: 150, useNativeDriver: true }))
      ).start();
    } else {
      Animated.parallel([
        Animated.timing(box, { toValue: 0, duration: 140, useNativeDriver: false }),
        ...items.current.map((v) => Animated.timing(v, { toValue: 0, duration: 110, useNativeDriver: true })),
      ]).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [open]);

  if (!mounted) return null;
  return (
    <Animated.View style={[styles.tray, { backgroundColor: colors.card, borderTopColor: colors.border, height: box.interpolate({ inputRange: [0, 1], outputRange: [0, 84] }), opacity: box }]}>
      {actions.map((a, i) => (
        <Animated.View
          key={a.key}
          style={{
            opacity: items.current[i],
            transform: [
              { scale: items.current[i].interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
              { translateY: items.current[i].interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
            ],
          }}
        >
          <TouchableOpacity
            style={styles.item}
            onPress={() => {
              onClose();
              a.onPress();
            }}
          >
            <View style={[styles.circle, { backgroundColor: colors.primary + '22' }]}>
              <Ionicons name={a.icon} size={24} color={colors.primary} />
            </View>
            <Text style={{ color: colors.subtext, fontSize: 11, fontWeight: '600', marginTop: 4 }}>{a.label}</Text>
          </TouchableOpacity>
        </Animated.View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tray: { flexDirection: 'row', alignItems: 'center', gap: 22, paddingHorizontal: 20, borderTopWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  item: { alignItems: 'center', minWidth: 54 },
  circle: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
});
