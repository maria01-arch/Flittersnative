import { TouchableOpacity, View, StyleSheet } from 'react-native';
import Text from '@/components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';

// Round button that appears when you've scrolled up in a chat. Tap it to
// jump to the newest message. While you're up there, new messages from other
// people add to the "+N" shown on it.
export default function JumpToBottom({ visible, count, onPress, bottom = 96 }: { visible: boolean; count: number; onPress: () => void; bottom?: number }) {
  const { colors } = useTheme();
  if (!visible) return null;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.btn, { bottom, backgroundColor: colors.card, borderColor: colors.border }]}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      {count > 0 ? <Text style={[styles.plus, { color: colors.primary }]}>+{count > 99 ? '99' : count}</Text> : <Ionicons name="chevron-down" size={22} color={colors.text} />}
      {count > 0 && <View style={[styles.dot, { backgroundColor: colors.primary }]} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { position: 'absolute', right: 14, width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  plus: { fontSize: 14, fontWeight: '900' },
  dot: { position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: 4 },
});
