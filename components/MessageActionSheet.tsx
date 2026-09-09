import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';

const QUICK_EMOJIS = ['❤️', '😂', '😮', '😢', '🙏', '👍'];

export default function MessageActionSheet({
  visible,
  isMine,
  onClose,
  onReply,
  onCopy,
  onEdit,
  onDelete,
  onReact,
  onPin,
  isPinned,
}: {
  visible: boolean;
  isMine: boolean;
  onClose: () => void;
  onReply: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReact: (emoji: string) => void;
  onPin: () => void;
  isPinned: boolean;
}) {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.card }]} onPress={() => {}}>
          <View style={styles.emojiRow}>
            {QUICK_EMOJIS.map((e) => (
              <TouchableOpacity key={e} onPress={() => onReact(e)} style={styles.emojiBtn}>
                <Text style={styles.emojiText}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <TouchableOpacity style={styles.row} onPress={onReply}>
            <Ionicons name="arrow-undo-outline" size={20} color={colors.text} />
            <Text style={[styles.rowText, { color: colors.text }]}>Reply</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.row} onPress={onPin}>
            <Ionicons name={isPinned ? 'pin' : 'pin-outline'} size={20} color={colors.text} />
            <Text style={[styles.rowText, { color: colors.text }]}>{isPinned ? 'Unpin' : 'Pin'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.row} onPress={onCopy}>
            <Ionicons name="copy-outline" size={20} color={colors.text} />
            <Text style={[styles.rowText, { color: colors.text }]}>Copy</Text>
          </TouchableOpacity>
          {isMine && (
            <TouchableOpacity style={styles.row} onPress={onEdit}>
              <Ionicons name="create-outline" size={20} color={colors.text} />
              <Text style={[styles.rowText, { color: colors.text }]}>Edit</Text>
            </TouchableOpacity>
          )}
          {isMine && (
            <TouchableOpacity style={styles.row} onPress={onDelete}>
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
              <Text style={[styles.rowText, { color: '#EF4444' }]}>Delete</Text>
            </TouchableOpacity>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 16, paddingBottom: 30 },
  emojiRow: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 12, paddingBottom: 14 },
  emojiBtn: { padding: 6 },
  emojiText: { fontSize: 26 },
  divider: { height: 1, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: 20 },
  rowText: { fontSize: 16 },
});
