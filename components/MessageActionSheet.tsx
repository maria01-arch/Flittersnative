import { useEffect, useState } from 'react';
import { Modal, View, TouchableOpacity, StyleSheet, Pressable, FlatList } from 'react-native';
import Text from '@/components/AppText';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EMOJI_CATEGORIES } from '@/lib/emojiData';
import Emoji from '@/components/Emoji';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';

const DEFAULT_QUICK = ['❤️', '😂', '😮', '😢', '🙏', '👍'];
const RECENT_KEY = 'recent_reactions';
const ALL_EMOJIS: string[] = EMOJI_CATEGORIES.flatMap((c: any) => c.emojis.map((e: any) => (typeof e === 'string' ? e : e.emoji || e.char || String(e))));

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
  onReport,
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
  onReport?: () => void;
  isPinned: boolean;
}) {
  const { colors } = useTheme();
  // The quick row shows the emojis you reacted with most recently (newest
  // first), filled up with the defaults. The "+" opens every emoji.
  const [recent, setRecent] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => {
    if (visible) AsyncStorage.getItem(RECENT_KEY).then((raw) => setRecent(raw ? JSON.parse(raw) : [])).catch(() => {});
  }, [visible]);
  const quick = [...recent, ...DEFAULT_QUICK.filter((d) => !recent.includes(d))].slice(0, 6);
  const react = (emoji: string) => {
    const next = [emoji, ...recent.filter((x) => x !== emoji)].slice(0, 6);
    setRecent(next);
    AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
    setPickerOpen(false);
    onReact(emoji);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.card }]} onPress={() => {}}>
          <View style={styles.emojiRow}>
            {quick.map((e) => (
              <TouchableOpacity key={e} onPress={() => react(e)} style={styles.emojiBtn}>
                <Emoji emoji={e} size={34} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setPickerOpen(true)} style={[styles.emojiBtn, { backgroundColor: colors.inputBg, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="add" size={22} color={colors.text} />
            </TouchableOpacity>
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
          {!isMine && onReport && (
            <TouchableOpacity style={styles.row} onPress={onReport}>
              <Ionicons name="flag-outline" size={20} color="#EF4444" />
              <Text style={[styles.rowText, { color: '#EF4444' }]}>Report</Text>
            </TouchableOpacity>
          )}
        </Pressable>
      </Pressable>
      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.card, height: '55%' }]} onPress={() => {}}>
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16, textAlign: 'center', marginBottom: 8 }}>Pick a reaction</Text>
            <FlatList
              data={ALL_EMOJIS}
              keyExtractor={(e, i) => e + i}
              numColumns={8}
              initialNumToRender={64}
              windowSize={7}
              renderItem={({ item }) => (
                <TouchableOpacity onPress={() => react(item)} style={{ width: '12.5%', alignItems: 'center', paddingVertical: 6 }}>
                  <Text style={{ fontSize: 26 }}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
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
