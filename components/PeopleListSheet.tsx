import { Modal, View, TouchableOpacity, StyleSheet, Pressable, FlatList, ActivityIndicator } from 'react-native';
import Text from '@/components/AppText';
import { router } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import Avatar from './Avatar';

export type PersonRow = { id: string; name: string; username?: string; avatar?: string | null; right?: string };

// A bottom sheet with a list of people: who saw a message, or who reacted to it.
export default function PeopleListSheet({
  visible,
  title,
  rows,
  loading,
  note,
  emptyText = 'Nobody yet.',
  onClose,
}: {
  visible: boolean;
  title: string;
  rows: PersonRow[];
  loading?: boolean;
  note?: string;
  emptyText?: string;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.card }]} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          {!!note && <Text style={{ color: colors.subtext, fontSize: 12, textAlign: 'center', marginBottom: 8 }}>{note}</Text>}
          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
          ) : rows.length === 0 ? (
            <Text style={{ color: colors.subtext, textAlign: 'center', paddingVertical: 24 }}>{emptyText}</Text>
          ) : (
            <FlatList
              data={rows}
              keyExtractor={(r, i) => r.id + ':' + i}
              style={{ maxHeight: 380 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => {
                    onClose();
                    router.push(`/user/${item.id}`);
                  }}
                >
                  <Avatar uri={item.avatar} size={38} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {!!item.username && (
                      <Text style={{ color: colors.subtext, fontSize: 12 }} numberOfLines={1}>
                        @{item.username}
                      </Text>
                    )}
                  </View>
                  {!!item.right && <Text style={{ fontSize: 22 }}>{item.right}</Text>}
                </TouchableOpacity>
              )}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingBottom: 28, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(128,128,128,0.4)', marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '800', textAlign: 'center', marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
});
