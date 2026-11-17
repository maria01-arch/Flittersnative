import { useCallback, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Image } from 'react-native';
import Text from '@/components/AppText';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import { spacing } from '@/lib/theme';
import { fmtCount } from '@/lib/formatCount';
import MiniBars from '@/components/MiniBars';
import {
  CATEGORIES, CreatorPost, Metric, Overview, PostSort,
  fetchCreatorPosts, fetchOverview, setProfessional, trend,
} from '@/lib/creator';

const RANGES = [7, 28, 90];
const METRICS: { key: Metric; label: string }[] = [
  { key: 'views', label: 'Views' },
  { key: 'likes', label: 'Likes' },
  { key: 'comments', label: 'Comments' },
  { key: 'reposts', label: 'Reposts' },
  { key: 'followers', label: 'Followers' },
];
const SORTS: { key: PostSort; label: string }[] = [
  { key: 'engagement', label: 'Best overall' },
  { key: 'views', label: 'Most viewed' },
  { key: 'likes', label: 'Most liked' },
  { key: 'comments', label: 'Most comments' },
  { key: 'reposts', label: 'Most reposts' },
  { key: 'recent', label: 'Newest' },
];
const PAGE = 15;

export default function CreatorDashboard() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const uid = session?.user?.id;

  const [loading, setLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [pickCategory, setPickCategory] = useState<string>('Creator');
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState(28);
  const [metric, setMetric] = useState<Metric>('views');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [sort, setSort] = useState<PostSort>('engagement');
  const [posts, setPosts] = useState<CreatorPost[]>([]);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPosts = useCallback(async (s: PostSort, offset: number) => {
    const res = await fetchCreatorPosts(s, PAGE, offset);
    if (res.error || !res.data) return;
    setPosts((prev) => (offset === 0 ? res.data! : [...prev, ...res.data!]));
    setMore(res.data.length === PAGE);
  }, []);

  const load = useCallback(async (range: number, s: PostSort) => {
    if (!uid) return;
    setError(null);
    const { data: prof, error: pe } = await supabase.from('profiles').select('is_professional,professional_category').eq('id', uid).single();
    if (pe || !prof) {
      setError("Couldn't load your profile. Check your connection and try again.");
      setLoading(false);
      return;
    }
    setIsPro(!!(prof as any).is_professional);
    setCategory((prof as any).professional_category || null);
    if ((prof as any).is_professional) {
      const [ov] = await Promise.all([fetchOverview(range), loadPosts(s, 0)]);
      if (ov.error) {
        setError(ov.notProfessional ? null : "Creator tools aren't available on the server yet. Run 02_creators.sql in Supabase, then pull to reopen this screen.");
      } else {
        setOverview(ov.data);
      }
    }
    setLoading(false);
  }, [uid, loadPosts]);

  useFocusEffect(useCallback(() => { load(days, sort); }, [load, days, sort]));

  const turnOn = async () => {
    if (!uid || busy) return;
    setBusy(true);
    const { error: e } = await setProfessional(uid, true, pickCategory);
    setBusy(false);
    if (e) {
      Alert.alert("Couldn't turn on professional mode", /column|schema/i.test(e.message) ? 'The server is missing the creator update (02_creators.sql).' : e.message);
      return;
    }
    setLoading(true);
    load(days, sort);
  };

  const turnOff = () => {
    Alert.alert('Turn off professional mode?', 'Your dashboard is hidden. Your posts and numbers are kept, and you can turn it back on any time.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Turn off', style: 'destructive',
        onPress: async () => {
          if (!uid) return;
          const { error: e } = await setProfessional(uid, false);
          if (e) { Alert.alert("Couldn't turn it off", e.message); return; }
          setOverview(null); setPosts([]); setIsPro(false);
        },
      },
    ]);
  };

  const Chip = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
    <TouchableOpacity onPress={onPress} style={[styles.chip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary + '22' : 'transparent' }]}>
      <Text style={{ color: active ? colors.primary : colors.subtext, fontWeight: '600', fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  );

  const Kpi = ({ label, now, before }: { label: string; now: number; before: number }) => {
    const t = trend(now, before);
    const tint = t.dir === 'up' ? colors.repost : t.dir === 'down' ? colors.danger : colors.faint;
    return (
      <View style={[styles.kpi, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={{ color: colors.subtext, fontSize: 12 }}>{label}</Text>
        <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800', marginTop: 2 }}>{fmtCount(now)}</Text>
        <Text style={{ color: tint, fontSize: 12, marginTop: 2, minHeight: 16 }}>{t.label ? `${t.label} vs previous ${days} days` : ' '}</Text>
      </View>
    );
  };

  const series = overview?.series || [];
  const barValues = series.map((p) => p[metric] as number);
  const labels = series.length ? [series[0].day.slice(5), series[series.length - 1].day.slice(5)] : [];

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Creator dashboard</Text>
        {isPro ? (
          <TouchableOpacity onPress={turnOff} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="settings-outline" size={22} color={colors.text} />
          </TouchableOpacity>
        ) : <View style={{ width: 22 }} />}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : error && !isPro ? (
        <View style={styles.center}>
          <Text style={{ color: colors.subtext, textAlign: 'center', paddingHorizontal: 30 }}>{error}</Text>
          <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary, marginTop: 16 }]} onPress={() => { setLoading(true); load(days, sort); }}>
            <Text style={styles.btnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : !isPro ? (
        <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
          <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="stats-chart" size={34} color={colors.primary} />
            <Text style={[styles.heroTitle, { color: colors.text }]}>Go professional</Text>
            <Text style={{ color: colors.subtext, textAlign: 'center', lineHeight: 20 }}>
              Turn on professional mode to see how your posts do: views, likes, comments, new followers, your best posts, and stats for each post.
            </Text>
          </View>
          <Text style={[styles.label, { color: colors.subtext }]}>What best describes you?</Text>
          <View style={styles.wrap}>
            {CATEGORIES.map((c) => <Chip key={c} label={c} active={pickCategory === c} onPress={() => setPickCategory(c)} />)}
          </View>
          <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary, marginTop: 24, opacity: busy ? 0.6 : 1 }]} onPress={turnOn} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Turn on professional mode</Text>}
          </TouchableOpacity>
          <Text style={{ color: colors.faint, fontSize: 12, textAlign: 'center', marginTop: 12 }}>Free. You can turn it off at any time.</Text>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
          {category ? <Text style={{ color: colors.subtext, marginBottom: 10 }}>{category} account</Text> : null}
          <TouchableOpacity activeOpacity={0.7} onPress={() => router.push('/creator/scheduled' as any)} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 0, marginBottom: 14 }]}>
            <Ionicons name="time-outline" size={22} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>Scheduled posts</Text>
              <Text style={{ color: colors.subtext, fontSize: 12 }}>See, change or cancel posts waiting to go live</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </TouchableOpacity>
          {error ? <Text style={{ color: colors.danger, marginBottom: 12 }}>{error}</Text> : null}

          <View style={styles.wrap}>
            {RANGES.map((r) => <Chip key={r} label={`${r} days`} active={days === r} onPress={() => { setDays(r); }} />)}
          </View>

          {overview ? (
            <>
              <View style={styles.grid}>
                <Kpi label="Views" now={overview.totals.views} before={overview.previous.views} />
                <Kpi label="Likes" now={overview.totals.likes} before={overview.previous.likes} />
                <Kpi label="Comments" now={overview.totals.comments} before={overview.previous.comments} />
                <Kpi label="Reposts" now={overview.totals.reposts} before={overview.previous.reposts} />
                <Kpi label="New followers" now={overview.totals.followers} before={overview.previous.followers} />
                <Kpi label="Posts" now={overview.totals.posts} before={overview.previous.posts} />
              </View>
              <Text style={{ color: colors.subtext, marginTop: 4 }}>{fmtCount(overview.followers_total)} followers in total</Text>

              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.wrap}>
                  {METRICS.map((m) => <Chip key={m.key} label={m.label} active={metric === m.key} onPress={() => setMetric(m.key)} />)}
                </View>
                <MiniBars values={barValues} labels={labels} />
                <Text style={{ color: colors.faint, fontSize: 12, marginTop: 8 }}>
                  {fmtCount(barValues.reduce((a, b) => a + b, 0))} {metric === 'followers' ? 'new followers' : metric} in the last {days} days
                </Text>
              </View>
            </>
          ) : null}

          <Text style={[styles.section, { color: colors.text }]}>Your posts</Text>
          <Text style={{ color: colors.subtext, fontSize: 12, marginBottom: 8 }}>Sort by</Text>
          <View style={styles.wrap}>
            {SORTS.map((s) => <Chip key={s.key} label={s.label} active={sort === s.key} onPress={() => setSort(s.key)} />)}
          </View>
          {posts.length === 0 ? (
            <Text style={{ color: colors.faint, marginTop: 14 }}>No posts yet. When you post, its numbers show up here.</Text>
          ) : posts.map((p, i) => (
            <TouchableOpacity key={p.id} activeOpacity={0.7} onPress={() => router.push(`/creator/post/${p.id}`)} style={[styles.postRow, { borderColor: colors.border }]}>
              <Text style={{ color: colors.faint, width: 22, fontWeight: '700' }}>{i + 1}</Text>
              {p.thumbnail_url || p.image_url ? (
                <Image source={{ uri: (p.thumbnail_url || p.image_url) as string }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, { backgroundColor: colors.inputBg, alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name={p.video_url ? 'videocam-outline' : 'text-outline'} size={18} color={colors.faint} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text numberOfLines={2} style={{ color: colors.text, fontSize: 14 }}>{p.content || (p.video_url ? 'Video post' : 'Photo post')}</Text>
                <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 4 }}>
                  {fmtCount(p.views)} views · {fmtCount(p.likes)} likes · {fmtCount(p.comments)} comments · {p.engagement_rate}%
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.faint} />
            </TouchableOpacity>
          ))}
          {more ? (
            <TouchableOpacity style={[styles.btn, { borderWidth: 1, borderColor: colors.border, marginTop: 14 }]} onPress={() => loadPosts(sort, posts.length)}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>Show more</Text>
            </TouchableOpacity>
          ) : null}

          <Text style={{ color: colors.faint, fontSize: 12, marginTop: 24, lineHeight: 17 }}>
            Views count each person once per post, and only people other than you. The percentage next to a post is likes, comments and reposts divided by views. Saves are not counted yet.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingHorizontal: spacing.lg, paddingBottom: 14, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { borderWidth: 1, borderRadius: 18, padding: 22, alignItems: 'center', gap: 10 },
  heroTitle: { fontSize: 20, fontWeight: '800' },
  label: { fontSize: 13, fontWeight: '600', marginTop: 24, marginBottom: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 18, paddingVertical: 7, paddingHorizontal: 14 },
  btn: { height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14, marginBottom: 6 },
  kpi: { width: '48%', flexGrow: 1, borderWidth: 1, borderRadius: 14, padding: 14 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 14, gap: 14 },
  section: { fontSize: 17, fontWeight: '800', marginTop: 26, marginBottom: 10 },
  postRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1 },
  thumb: { width: 46, height: 46, borderRadius: 8 },
});
