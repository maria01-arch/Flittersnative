import { useCallback, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import Text from '@/components/AppText';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { spacing } from '@/lib/theme';
import Avatar from '@/components/Avatar';
import { Streak, fetchStreaks, hasLiveCoverReward, streakHint, REWARD_DAYS } from '@/lib/streaks';

type Row = Streak & { name: string; avatar: string | null };

export default function StreaksScreen() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const [streaks, got] = await Promise.all([fetchStreaks(), hasLiveCoverReward(session?.user?.id)]);
      setUnlocked(got);
      const ids = Array.from(new Set(streaks.map((s) => s.other_id)));
      const { data: people } = ids.length ? await supabase.from('profiles').select('id,display_name,username,avatar_url').in('id', ids) : { data: [] as any[] };
      const byId = new Map((people || []).map((p: any) => [p.id, p]));
      setRows(streaks.map((s) => ({ ...s, name: (byId.get(s.other_id) as any)?.display_name || (byId.get(s.other_id) as any)?.username || 'Someone', avatar: (byId.get(s.other_id) as any)?.avatar_url || null })));
      setError(false);
    } catch {
      setError(true);
    }
  }, [session?.user?.id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const top = rows && rows.length ? Math.max(...rows.map((r) => r.streak)) : 0;
  const best = rows && rows.length ? Math.max(...rows.map((r) => r.best)) : 0;
  const pct = Math.min(1, top / REWARD_DAYS);

  const Header = (
    <View>
      <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="flame" size={38} color="#F97316" />
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>{top} day{top === 1 ? '' : 's'}</Text>
        <Text style={{ color: colors.subtext, textAlign: 'center', lineHeight: 20 }}>
          Your longest streak right now. Message each other every day to keep it going. Miss a whole day and it starts over. Streaks don't count between two accounts used on the same phone.
        </Text>
        <View style={[styles.bar, { backgroundColor: colors.inputBg }]}><View style={[styles.barFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: '#F97316' }]} /></View>
        {unlocked ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
            <Text style={{ color: colors.text, fontWeight: '700' }}>Live cover photo unlocked</Text>
          </View>
        ) : (
          <Text style={{ color: colors.subtext, fontSize: 12 }}>
            {top >= REWARD_DAYS ? 'Done!' : `${REWARD_DAYS - top} more day${REWARD_DAYS - top === 1 ? '' : 's'} in one chat unlocks a live cover photo`}
          </Text>
        )}
        {best > top ? <Text style={{ color: colors.faint, fontSize: 12 }}>Your best ever: {best} days</Text> : null}
      </View>
      <Text style={{ color: colors.subtext, fontSize: 12, fontWeight: '800', letterSpacing: 0.5, marginTop: 22, marginBottom: 8 }}>YOUR STREAKS</Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Chat streaks</Text>
        <View style={{ width: 24 }} />
      </View>
      {rows === null && !error ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : error ? (
        <View style={styles.center}><Text style={{ color: colors.subtext, textAlign: 'center', paddingHorizontal: 30 }}>Couldn't load your streaks. Check your connection.</Text></View>
      ) : (
        <FlatList
          data={rows || []}
          keyExtractor={(r) => r.conversation_id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
          ListHeaderComponent={Header}
          ListEmptyComponent={<Text style={{ color: colors.faint, textAlign: 'center', marginTop: 10 }}>No streaks yet. Start a chat and keep it going daily.</Text>}
          renderItem={({ item: r }) => (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push({ pathname: '/conversation/[id]', params: { id: r.conversation_id, name: r.name, otherId: r.other_id, otherAvatar: r.avatar || '' } } as any)}
              style={[styles.row, { borderColor: colors.border }]}
            >
              <Avatar uri={r.avatar} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={1}>{r.name}</Text>
                <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>{streakHint(r, r.name) || 'Going strong'}</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Ionicons name="flame" size={22} color={r.at_risk && !r.me_today ? '#9CA3AF' : '#F97316'} />
                <Text style={{ color: colors.text, fontWeight: '800' }}>{r.streak}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingHorizontal: spacing.lg, paddingBottom: 12, borderBottomWidth: 1 },
  title: { fontSize: 16, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { borderWidth: 1, borderRadius: 18, padding: 20, alignItems: 'center', gap: 8 },
  bar: { height: 8, borderRadius: 4, alignSelf: 'stretch', overflow: 'hidden', marginTop: 6 },
  barFill: { height: 8, borderRadius: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
