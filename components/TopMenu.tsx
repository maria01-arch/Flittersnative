import { Modal, View, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import Text from '@/components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';

export type TopMenuOption = {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
};

// A small menu that drops down from the top-right (under the three dots),
// instead of rising from the bottom like ActionSheet.
export default function TopMenu({ visible, options, onClose }: { visible: boolean; options: TopMenuOption[]; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.menu, { backgroundColor: colors.card, borderColor: colors.border, top: insets.top + 52 }]} onPress={() => {}}>
          {options.map((opt, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}
              onPress={() => {
                onClose();
                opt.onPress();
              }}
            >
              {opt.icon && <Ionicons name={opt.icon} size={20} color={opt.destructive ? colors.danger : colors.text} />}
              <Text style={[styles.text, { color: opt.destructive ? colors.danger : colors.text }]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' },
  menu: { position: 'absolute', right: 12, minWidth: 210, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', elevation: 8, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  text: { fontSize: 15.5, fontWeight: '600' },
});
