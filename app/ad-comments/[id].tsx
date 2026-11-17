import { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, TextInput, Alert } from 'react-native';
import Text from '@/components/AppText';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';
import { useAuth } from '@/lib/AuthContext';
import { spacing } from '@/lib/theme';
import { postTime } from '@/lib/timeAgo';
import KeyboardWrap from '@/components/KeyboardWrap';
import Avatar from '@/components/Avatar';
import { AdComment, addAdComment, bumpAdComments, deleteAdComment, fetchAdComments } from '@/lib/adEngagement';

export default function AdComments() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const uid = session?.user?.id;
  const { id } = useLocalSearchParams<{ id: string }>();
  const [items, setItems] = useState<AdComment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetchAdComments(String(id));
    if (r.error) setError("Couldn't load comments. Check your connection."); else { setItems(r.data); setError(null); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const send = async () => {
    const body = text.trim();
    if (!body || busy || !uid) return;
    setBusy(true);
    const r = await addAdComment(String(id), uid, body);
    setBusy(false);
    if (!r.ok) { Alert.alert("Couldn't comment", r.error); return; }
    setText('');
    bumpAdComments(String(id), 1);
    load();
  };

  const remove = (c: AdComment) => {
    Alert.alert('Delete comment?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        if (!uid) return;
        if (await deleteAdComment(c.id, uid)) { setItems((l) => (l || []).filter((x) => x.id !== c.id)); bumpAdComments(String(id), -1); }
        else Alert.alert("Couldn't delete", 'Try again.');
      } },
    ]);
  };

  return (
    <KeyboardWrap style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Comments</Text>
        <View style={{ width: 24 }} />
      </View>

      {items === null ? (
        <View style={styles.center}>
          {error ? <Text style={{ color: colors.subtext, textAlign: 'center', paddingHorizontal: 30 }}>{error}</Text> : <ActivityIndicator color={colors.primary} />}
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: spacing.lg, gap: 16, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={{ color: colors.faint, textAlign: 'center', marginTop: 40 }}>No comments yet. Be the first.</Text>}
          renderItem={({ item: c }) => (
            <View style={styles.item}>
              <TouchableOpacity disabled={!c.author?.id} onPress={() => c.author?.id && router.push(`/user/${c.author.id}` as any)}>
                <Avatar uri={c.author?.avatar_url} size={36} />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
                  {c.author?.display_name || c.author?.username || 'Someone'}
                  <Text style={{ color: colors.faint, fontWeight: '400', fontSize: 12 }}>{'  '}{postTime(c.created_at)}</Text>
                </Text>
                <Text style={{ color: colors.text, lineHeight: 21, marginTop: 2 }}>{c.content}</Text>
              </View>
              {c.user_id === uid ? (
                <TouchableOpacity onPress={() => remove(c)} hitSlop={10}>
                  <Ionicons name="trash-outline" size={18} color={colors.faint} />
                </TouchableOpacity>
              ) : null}
            </View>
          )}
        />
      )}

      <View style={[styles.composer, { borderTopColor: colors.border, backgroundColor: colors.bg }]}>
        <TextInput value={text} onChangeText={setText} placeholder="Add a comment…" placeholderTextColor={colors.faint} multiline maxLength={500}
          style={[styles.input, { color: colors.text, backgroundColor: colors.inputBg }]} />
        <TouchableOpacity onPress={send} disabled={busy || !text.trim()} style={[styles.send, { backgroundColor: colors.primary, opacity: busy || !text.trim() ? 0.5 : 1 }]}>
          {busy ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="arrow-up" size={20} color="#fff" />}
        </TouchableOpacity>
      </View>
    </KeyboardWrap>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingHorizontal: spacing.lg, paddingBottom: 12, borderBottomWidth: 1 },
  title: { fontSize: 16, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  item: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1 },
  input: { flex: 1, maxHeight: 120, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
