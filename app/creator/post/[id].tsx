import { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import Text from '@/components/AppText';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';
import { spacing } from '@/lib/theme';
import { fmtCount } from '@/lib/formatCount';
import MiniBars from '@/components/MiniBars';
import { PostStats, fetchPostStats } from '@/lib/creator';

type Series = 'views' | 'likes' | 'comments';

export default function CreatorPostStats() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [stats, setStats] = useState<PostStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<Series>('views');

  useEffect(() => {
    if (!id) return;
    let alive = true;
    fetchPostStats(String(id)).then((res) => {
      if (!alive) return;
      if (res.error) setError(res.error.includes('post_not_found') ? 'This post is not available.' : "Couldn't load the stats. Try again later.");
      else setStats(res.data);
    });
    return () => { alive = false; };
  }, [id]);

  const rate = stats ? Math.round((1000 * (stats.likes + stats.comments + stats.reposts + stats.quotes)) / Math.max(stats.views, 1)) / 10 : 0;
  const Tile = ({ label, value }: { label: string; value: number | string }) => (
    <View style={[styles.tile, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={{ color: colors.subtext, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 2 }}>{typeof value === 'number' ? fmtCount(value) : value}</Text>
    </View>
  );

  const series = stats?.series || [];
  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Post stats</Text>
        <TouchableOpacity onPress={() => id && router.push(`/post/${id}`)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="open-outline" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>
      {error ? (
        <View style={styles.center}><Text style={{ color: colors.subtext, textAlign: 'center', paddingHorizontal: 30 }}>{error}</Text></View>
      ) : !stats ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
          <Text style={{ color: colors.subtext, marginBottom: 12 }}>Posted {new Date(stats.created_at).toLocaleDateString()}</Text>
          <View style={styles.grid}>
            <Tile label="Views" value={stats.views} />
            <Tile label="Likes" value={stats.likes} />
            <Tile label="Comments" value={stats.comments} />
            <Tile label="Reposts" value={stats.reposts} />
            <Tile label="Quotes" value={stats.quotes} />
            <Tile label="Engagement" value={`${rate}%`} />
          </View>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.wrap}>
              {(['views', 'likes', 'comments'] as Series[]).map((m) => (
                <TouchableOpacity key={m} onPress={() => setMetric(m)} style={[styles.chip, { borderColor: metric === m ? colors.primary : colors.border, backgroundColor: metric === m ? colors.primary + '22' : 'transparent' }]}>
                  <Text style={{ color: metric === m ? colors.primary : colors.subtext, fontWeight: '600', fontSize: 13 }}>{m === 'views' ? 'Views' : m === 'likes' ? 'Likes' : 'Comments'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <MiniBars values={series.map((p) => p[metric])} labels={series.length ? [series[0].day.slice(5), series[series.length - 1].day.slice(5)] : []} />
            <Text style={{ color: colors.faint, fontSize: 12 }}>Per day since you posted (up to 30 days).</Text>
          </View>
          <Text style={{ color: colors.faint, fontSize: 12, marginTop: 20, lineHeight: 17 }}>
            Engagement is likes, comments, reposts and quotes divided by views. Your own activity is not counted.
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '31%', flexGrow: 1, borderWidth: 1, borderRadius: 14, padding: 12 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 14, gap: 14 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 18, paddingVertical: 7, paddingHorizontal: 14 },
});
