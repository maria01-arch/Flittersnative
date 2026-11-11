import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Text from '@/components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';

// A slim bar above the input: "Paste copied image". Shows only when the
// clipboard holds a picture (see useClipboardImage).
export default function PasteImageChip({ onPaste, onDismiss }: { onPaste: () => void; onDismiss: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.bar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
      <TouchableOpacity style={[styles.pill, { backgroundColor: colors.inputBg }]} onPress={onPaste} activeOpacity={0.7}>
        <Ionicons name="clipboard-outline" size={16} color={colors.primary} />
        <Text style={[styles.text, { color: colors.text }]}>Paste copied image</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close" size={18} color={colors.subtext} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  text: { fontSize: 13, fontWeight: '600' },
});
