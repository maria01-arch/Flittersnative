import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';
import { spacing } from '@/lib/theme';

export type ActionSheetOption = {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
};

// Replaces Alert.alert for anything with more than a simple yes/no —
// Android's native alert dialog silently breaks past 3 buttons (it's
// built for positive/negative/neutral, not an arbitrary list), which is
// why a 4-option menu (Block/Delete/Report/Cancel) was quietly losing its
// Cancel button. This has no such limit, and looks like part of the app
// instead of a bare OS popup.
export default function ActionSheet({
  visible,
  title,
  options,
  onClose,
}: {
  visible: boolean;
  title?: string;
  options: ActionSheetOption[];
  onClose: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.card }]} onPress={() => {}}>
          <View style={styles.handle} />
          {title ? <Text style={[styles.title, { color: colors.subtext }]}>{title}</Text> : null}
          {options.map((opt, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.row, { borderTopColor: colors.border }, i === 0 && !title && styles.firstRow]}
              onPress={() => {
                onClose();
                opt.onPress();
              }}
            >
              {opt.icon && <Ionicons name={opt.icon} size={20} color={opt.destructive ? colors.danger : colors.text} />}
              <Text style={[styles.rowText, { color: opt.destructive ? colors.danger : colors.text }]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[styles.cancelBtn, { backgroundColor: colors.inputBg }]} onPress={onClose}>
            <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34, paddingTop: 8 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(150,150,150,0.4)', alignSelf: 'center', marginBottom: 8 },
  title: { textAlign: 'center', fontSize: 13, fontWeight: '600', paddingBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, paddingHorizontal: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth },
  firstRow: { borderTopWidth: 0 },
  rowText: { fontSize: 16, fontWeight: '600' },
  cancelBtn: { marginHorizontal: spacing.lg, marginTop: 12, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  cancelText: { fontSize: 16, fontWeight: '700' },
});
