import { useEffect, useState } from 'react';
import { View, Text, TextInput, FlatList, Image, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import { spacing } from '@/lib/theme';

export default function SearchScreen() {
  const { session } = useAuth();
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [trending, setTrending] = useState<string[]>([]);
  const [suggested, setSuggested] = useState<any[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadDiscover();
  }, [session]);

  const loadDiscover = async () => {
    const { data: posts } = await supabase.from('posts').select('content').order('created_at', { ascending: false }).limit(200);
    const counts: Record<string, number> = {};
    (posts || []).forEach((p: any) => {
      const tags = (p.content || '').match(/#[a-zA-Z0-9_]+/g) || [];
      tags.forEach((t: string) => {
        const key = t.toLowerCase();
        counts[key] = (counts[key] || 0) + 1;
      });
    });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([tag]) => tag);
    setTrending(top);

    let followed = new Set<string>();
    if (session?.user?.id) {
      const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', session.user.id);
      followed = new Set((follows || []).map((f: any) => f.following_id));
      setFollowingIds(followed);
    }

    const { data: profiles } = await supabase.from('profiles').select('*').order('followers_count', { ascending: false }).limit(20);
    const filtered = (profiles || []).filter((p: any) => p.id !== session?.user?.id && !followed.has(p.id)).slice(0, 10);
    setSuggested(filtered);
  };

  const runSearch = async (text: string) => {
    setQuery(text);
    if (text.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .or(`display_name.ilike.%${text}%,username.ilike.%${text}%`)
      .limit(20);
    setResults(data || []);
    setLoading(false);
  };

  const toggleFollow = async (userId: string) => {
    if (!session?.user?.id) return;
    const isFollowing = followingIds.has(userId);
    const next = new Set(followingIds);
    if (isFollowing) next.delete(userId);
    else next.add(userId);
    setFollowingIds(next);
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', session.user.id).eq('following_id', userId);
    } else {
      await supabase.from('follows').insert({ follower_id: session.user.id, following_id: userId });
      await supabase.from('notifications').insert({ user_id: userId, actor_id: session.user.id, type: 'follow' });
    }
  };

  const showDiscover = query.trim().length < 2;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <View style={[styles.searchBox, { backgroundColor: colors.inputBg }]}>
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search people or #tags"
            placeholderTextColor={colors.faint}
            value={query}
            onChangeText={runSearch}
            autoCapitalize="none"
          />
        </View>
      </View>

      {showDiscover ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
          {trending.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Trending</Text>
              <View style={styles.trendingWrap}>
                {trending.map((tag) => (
                  <TouchableOpacity key={tag} style={[styles.trendingPill, { backgroundColor: colors.inputBg }]} onPress={() => runSearch(tag.slice(1))}>
                    <Text style={[styles.trendingText, { color: colors.primary }]}>{tag}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {suggested.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Suggested for you</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 12 }}>
                {suggested.map((u) => (
                  <View key={u.id} style={[styles.suggestedCard, { borderColor: colors.border }]}>
                    <TouchableOpacity onPress={() => router.push(`/user/${u.id}`)}>
                      <Image source={{ uri: u.avatar_url || 'https://placehold.co/100x100/6C5CE7/fff?text=' + (u.display_name?.[0] || '?') }} style={styles.suggestedAvatar} />
                      <Text style={[styles.suggestedName, { color: colors.text }]} numberOfLines={1}>{u.display_name}</Text>
                      <Text style={[styles.suggestedUsername, { color: colors.subtext }]} numberOfLines={1}>@{u.username}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.followBtn, { backgroundColor: colors.primary }]} onPress={() => toggleFollow(u.id)}>
                      <Text style={styles.followBtnText}>{followingIds.has(u.id) ? 'Following' : 'Follow'}</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </ScrollView>
      ) : (
        <>
          {loading && <ActivityIndicator style={{ marginTop: 20 }} color={colors.primary} />}
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 110 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={[styles.row, { borderBottomColor: colors.border }]} onPress={() => router.push(`/user/${item.id}`)}>
                <Image source={{ uri: item.avatar_url || 'https://placehold.co/80x80/6C5CE7/fff?text=' + (item.display_name?.[0] || '?') }} style={styles.avatar} />
                <View>
                  <Text style={[styles.displayName, { color: colors.text }]}>{item.display_name}</Text>
                  <Text style={[styles.username, { color: colors.subtext }]}>@{item.username}</Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={!loading ? <Text style={[styles.empty, { color: colors.subtext }]}>No users found</Text> : null}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { paddingTop: 56, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1 },
  searchBox: { borderRadius: 20, paddingHorizontal: 14 },
  searchInput: { paddingVertical: 10, fontSize: 15 },
  section: { marginTop: spacing.lg },
  sectionTitle: { fontSize: 17, fontWeight: '800', paddingHorizontal: spacing.lg, marginBottom: 10 },
  trendingWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: spacing.lg },
  trendingPill: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  trendingText: { fontWeight: '600', fontSize: 13 },
  suggestedCard: { width: 130, borderWidth: 1, borderRadius: 14, padding: 12, alignItems: 'center' },
  suggestedAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#ddd', marginBottom: 8 },
  suggestedName: { fontWeight: '700', fontSize: 13, textAlign: 'center' },
  suggestedUsername: { fontSize: 11, marginTop: 1, textAlign: 'center' },
  followBtn: { marginTop: 10, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 14 },
  followBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, paddingHorizontal: spacing.lg, gap: 12, borderBottomWidth: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#ddd' },
  displayName: { fontWeight: '700', fontSize: 15 },
  username: { fontSize: 13, marginTop: 1 },
  empty: { textAlign: 'center', marginTop: 40 },
});
