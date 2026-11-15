import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Text from '@/components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';

// For group admins: "3 people want to join". Tap to review them; the X hides it.
// With a pinned message it sits right on top of the pinned bar (overlay), so hiding
// it shows the pin again; without one it is just a bar of its own.
export default function JoinRequestsBanner({ count, overlay, onOpen, onDismiss }: { count: number; overlay: boolean; onOpen: () => void; onDismiss: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.bar, overlay ? styles.overlay : null, { backgroundColor: colors.primary }]}>
      <TouchableOpacity style={styles.main} activeOpacity={0.85} onPress={onOpen}>
        <Ionicons name="person-add" size={16} color="#fff" />
        <Text style={styles.text} numberOfLines={1}>
          {count} pending join {count === 1 ? 'request' : 'requests'} · tap to review
        </Text>
        <Ionicons name="chevron-forward" size={16} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={styles.x}>
        <Ionicons name="close" size={20} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingLeft: 14, paddingRight: 8 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 5 },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  text: { color: '#fff', fontWeight: '700', fontSize: 13, flex: 1 },
  x: { padding: 6 },
});
