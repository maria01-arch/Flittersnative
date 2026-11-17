import { useCallback, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Alert, Image, RefreshControl } from 'react-native';
import Text from '@/components/AppText';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';
import { spacing } from '@/lib/theme';
import SchedulePicker from '@/components/SchedulePicker';
import { Scheduled, cancelScheduled, fetchScheduled, reschedulePost, whenText } from '@/lib/scheduled';

// Posts waiting to go live (and what went out or failed in the last 7 days).
export default function ScheduledPosts() {
  const { colors } = useTheme();
  const [items, setItems] = useState<Scheduled[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<Scheduled | null>(null);

  const load = useCallback(async () => {
    const r = await fetchScheduled();
    if (r.data) { setItems(r.data); setError(null); } else setError(r.error);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const cancel = (s: Scheduled) =>
    Alert.alert('Cancel this scheduled post?', 'It will not be posted.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel post', style: 'destructive', onPress: async () => { const r = await cancelScheduled(s.id); if (!r.ok) Alert.alert("Couldn't cancel", r.error); load(); } },
    ]);

  const move = async (d: Date) => {
    const s = editing;
    setEditing(null);
    if (!s) return;
    const r = await reschedulePost(s.id, d);
    if (!r.ok) Alert.alert("Couldn't change the time", r.error);
    load();
  };

  const label = (s: Scheduled) => {
    if (s.status === 'pending') return whenText(s.scheduled_for);
    if (s.status === 'published') return 'Posted ' + whenText(s.published_at || s.scheduled_for);
    if (s.status === 'cancelled') return 'Cancelled';
    return s.error === 'account_suspended' ? "Not posted: your account was suspended at that time" : "Couldn't be posted";
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Scheduled posts</Text>
        <View style={{ width: 24 }} />
      </View>
      {items === null ? (
        <View style={styles.center}>
          {error ? <Text style={{ color: colors.subtext, textAlign: 'center', paddingHorizontal: 30 }}>{error}</Text> : <ActivityIndicator color={colors.primary} />}
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: spacing.lg, gap: 12, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 70, paddingHorizontal: 30, gap: 8 }}>
              <Ionicons name="time-outline" size={50} color={colors.faint} />
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>Nothing scheduled</Text>
              <Text style={{ color: colors.subtext, textAlign: 'center' }}>When writing a post, tap the clock at the top to pick when it goes live.</Text>
            </View>
          }
          renderItem={({ item: s }) => {
            const first = s.items[0];
            const pending = s.status === 'pending';
            return (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: pending ? 1 : 0.75 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name={pending ? 'time' : s.status === 'published' ? 'checkmark-circle' : 'alert-circle'} size={16} color={s.status === 'failed' ? colors.danger : colors.primary} />
                  <Text style={{ color: s.status === 'failed' ? colors.danger : colors.primary, fontWeight: '700', fontSize: 13, flex: 1 }}>{label(s)}</Text>
                </View>
                {!!first?.content && <Text style={{ color: colors.text, marginTop: 8, lineHeight: 21 }} numberOfLines={4}>{first.content}</Text>}
                {!!first?.image_url && <Image source={{ uri: first.image_url }} style={[styles.thumb, { backgroundColor: colors.border }]} />}
                {!!first?.video_url && !first.image_url && <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 6 }}>Includes a video</Text>}
                {s.items.length > 1 ? <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 6 }}>Thread of {s.items.length} posts</Text> : null}
                {pending ? (
                  <View style={styles.row}>
                    <TouchableOpacity onPress={() => setEditing(s)} style={[styles.btn, { backgroundColor: colors.inputBg }]}><Text style={{ color: colors.text, fontWeight: '700' }}>Change time</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => cancel(s)} style={[styles.btn, { backgroundColor: colors.inputBg }]}><Text style={{ color: colors.danger, fontWeight: '700' }}>Cancel</Text></TouchableOpacity>
                  </View>
                ) : s.status === 'published' && s.post_id ? (
                  <TouchableOpacity onPress={() => router.push(`/post/${s.post_id}` as any)} style={{ marginTop: 10 }}><Text style={{ color: colors.primary, fontWeight: '700' }}>View post</Text></TouchableOpacity>
                ) : null}
              </View>
            );
          }}
        />
      )}
      <SchedulePicker visible={!!editing} initial={editing ? new Date(editing.scheduled_for) : null} onCancel={() => setEditing(null)} onConfirm={move} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingHorizontal: spacing.lg, paddingBottom: 12, borderBottomWidth: 1 },
  title: { fontSize: 16, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: 16, padding: 14 },
  thumb: { width: '100%', height: 140, borderRadius: 10, marginTop: 8 },
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12 },
});
