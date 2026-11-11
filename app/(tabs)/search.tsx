import { useEffect, useRef, useState } from 'react';
import { View, TextInput, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, RefreshControl, LayoutAnimation, Keyboard, Alert } from 'react-native';
import Text from '@/components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import Avatar from '@/components/Avatar';
import { spacing } from '@/lib/theme';
import { ListSkeleton } from '@/components/Skeleton';
import { cleanSearchText } from '@/lib/searchText';
import { notifyOnce } from '@/lib/postActions';
import { sendFollowRequest } from '@/lib/followRequests';
import { recordInterest } from '@/lib/interests';
import { postTime } from '@/lib/timeAgo';

// Trending tags are worked out from recent posts. That is the heaviest thing
// this screen does, so it is remembered for 20 minutes instead of every time.
let trendingCache: { at: number; tags: string[] } | null = null;

export default function SearchScreen() {
  const { session } = useAuth();
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [trending, setTrending] = useState<string[]>([]);
  // Suggested people: a shuffled pool of candidates, of which the first 10
  // not yet dealt with are shown. Follow someone and their card shows
  // "Following" for a moment, then slides away and the next person takes
  // their place. The pool is topped up automatically when it runs low, and
  // can be reshuffled with the refresh button or pull-down.
  const [pool, setPool] = useState<any[]>([]);
  const [handled, setHandled] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Record<string, 'Following' | 'Requested'>>({});
  const [refreshingDiscover, setRefreshingDiscover] = useState(false);
  const loadingPool = useRef(false);
  const suggested = pool.filter((u) => !handled.has(u.id)).slice(0, 10);

  useEffect(() => {
    loadDiscover();
  }, [session]);

  const loadDiscover = async () => {
    if (trendingCache && Date.now() - trendingCache.at < 20 * 60 * 1000) {
      setTrending(trendingCache.tags);
      await loadSuggestions();
      return;
    }
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: posts } = await supabase.from('posts').select('content').gte('created_at', since).like('content', '%#%').order('created_at', { ascending: false }).limit(120);
    const counts: Record<string, number> = {};
    (posts || []).forEach((p: any) => {
      const tags = (p.content || '').match(/#[a-zA-Z0-9_]+/g) || [];
      tags.forEach((t: string) => {
        const key = t.toLowerCase();
        counts[key] = (counts[key] || 0) + 1;
      });
    });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([tag]) => tag);
    trendingCache = { at: Date.now(), tags: top };
    setTrending(top);

    await loadSuggestions();
  };

  const loadSuggestions = async () => {
    if (loadingPool.current) return;
    loadingPool.current = true;
    try {
      const me = session?.user?.id;
      let exclude = new Set<string>();
      if (me) {
        exclude.add(me);
        const [{ data: follows }, { data: requests }] = await Promise.all([
          supabase.from('follows').select('following_id').eq('follower_id', me),
          supabase.from('follow_requests').select('target_id').eq('requester_id', me),
        ]);
        (follows || []).forEach((f: any) => exclude.add(f.following_id));
        (requests || []).forEach((r: any) => exclude.add(r.target_id));
      }
      const { data: profiles } = await supabase.from('profiles').select('id,display_name,username,avatar_url,is_private,followers_count').order('followers_count', { ascending: false }).limit(40);
      const candidates = (profiles || []).filter((p: any) => !exclude.has(p.id));
      // Fisher–Yates shuffle, so each refresh shows different people.
      for (let k = candidates.length - 1; k > 0; k--) {
        const r = Math.floor(Math.random() * (k + 1));
        [candidates[k], candidates[r]] = [candidates[r], candidates[k]];
      }
      setPool(candidates);
      setHandled(new Set());
      setPending({});
    } finally {
      loadingPool.current = false;
    }
  };

  // Running low on people to suggest → quietly fetch a fresh batch.
  useEffect(() => {
    if (pool.length > 0 && suggested.length < 3 && Object.keys(pending).length === 0) loadSuggestions();
  }, [suggested.length]);

  const refreshDiscover = async () => {
    setRefreshingDiscover(true);
    trendingCache = null;
    await loadDiscover();
    setRefreshingDiscover(false);
  };

  // ---- Search: people and posts. Only the open tab is searched, and only
  // after you stop typing for a moment, so a search is one small request, not
  // one per letter. Posts load 15 at a time.
  const [tab, setTab] = useState<'people' | 'posts'>('people');
  const tabChosen = useRef(false);
  const [posts, setPosts] = useState<any[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postsMore, setPostsMore] = useState(false);
  const peopleFor = useRef('');
  const postsFor = useRef('');
  const searchSeq = useRef(0);
  const postSeq = useRef(0);

  const runSearch = (text: string) => {
    setQuery(text);
    if (!tabChosen.current) setTab(text.trim().startsWith('#') ? 'posts' : 'people');
  };

  const fetchPeople = async (clean: string) => {
    const seq = ++searchSeq.current;
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('id,display_name,username,avatar_url')
      .or(`display_name.ilike.%${clean}%,username.ilike.%${clean}%`)
      .limit(20);
    if (seq !== searchSeq.current) return;
    peopleFor.current = clean;
    setResults(data || []);
    setLoading(false);
  };

  const fetchPosts = async (clean: string, before?: string) => {
    const seq = ++postSeq.current;
    setPostsLoading(true);
    let q = supabase
      .from('posts')
      .select('id,content,created_at,image_url,video_url,author:profiles(id,display_name,username,avatar_url),likes(count),comments(count)')
      .ilike('content', `%${clean}%`)
      .or('thread_order.is.null,thread_order.eq.0')
      .order('created_at', { ascending: false })
      .limit(15);
    if (before) q = q.lt('created_at', before);
    const { data } = await q;
    if (seq !== postSeq.current) return;
    const rows = data || [];
    postsFor.current = clean;
    setPosts((prev) => (before ? [...prev, ...rows] : rows));
    setPostsMore(rows.length === 15);
    setPostsLoading(false);
  };

  useEffect(() => {
    const clean = cleanSearchText(query);
    if (clean.length < 2) {
      searchSeq.current++;
      postSeq.current++;
      peopleFor.current = '';
      postsFor.current = '';
      setResults([]);
      setPosts([]);
      setLoading(false);
      setPostsLoading(false);
      return;
    }
    const t = setTimeout(() => {
      if (tab === 'people' && peopleFor.current !== clean) fetchPeople(clean);
      if (tab === 'posts' && postsFor.current !== clean) fetchPosts(clean);
    }, 350);
    return () => clearTimeout(t);
  }, [query, tab]);

  const submitSearch = () => {
    const clean = cleanSearchText(query);
    if (clean.length >= 2) recordInterest(clean, 1);
    Keyboard.dismiss();
  };

  const openPost = (item: any) => {
    recordInterest(cleanSearchText(query), 1);
    router.push(`/post/${item.id}`);
  };

  const followSuggested = async (u: any) => {
    if (!session?.user?.id || pending[u.id]) return;
    // Private accounts have to approve you first — send a request (what the
    // profile screen does) instead of following straight away.
    const label: 'Following' | 'Requested' = u.is_private ? 'Requested' : 'Following';
    setPending((prev) => ({ ...prev, [u.id]: label }));
    const { error } = u.is_private
      ? await sendFollowRequest(session.user.id, u.id)
      : await supabase.from('follows').insert({ follower_id: session.user.id, following_id: u.id });
    if (error) {
      setPending((prev) => {
        const n = { ...prev };
        delete n[u.id];
        return n;
      });
      if ((error as any).code !== '23505') Alert.alert(u.is_private ? "Couldn't send request" : "Couldn't follow", (error as any).message || 'Try again.');
      return;
    }
    if (!u.is_private) await notifyOnce({ userId: u.id, actorId: session.user.id, type: 'follow' });
    // Let the new label register, then remove the card.
    setTimeout(() => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setHandled((prev) => new Set(prev).add(u.id));
      setPending((prev) => {
        const n = { ...prev };
        delete n[u.id];
        return n;
      });
    }, 700);
  };

  const showDiscover = query.trim().length < 2;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <View style={[styles.searchBox, { backgroundColor: colors.inputBg }]}>
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search people, posts or #tags"
            placeholderTextColor={colors.faint}
            value={query}
            onChangeText={runSearch}
            onSubmitEditing={submitSearch}
            returnKeyType="search"
            autoCapitalize="none"
          />
        </View>
      </View>

      {showDiscover ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 110 }}
          refreshControl={<RefreshControl refreshing={refreshingDiscover} onRefresh={refreshDiscover} tintColor={colors.primary} />}
        >
          {trending.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Trending</Text>
              <View style={styles.trendingWrap}>
                {trending.map((tag) => (
                  <TouchableOpacity key={tag} style={[styles.trendingPill, { backgroundColor: colors.inputBg }]} onPress={() => { tabChosen.current = true; setTab('posts'); recordInterest(tag, 1); setQuery(tag); }}>
                    <Text style={[styles.trendingText, { color: colors.primary }]}>{tag}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {suggested.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0, paddingHorizontal: 0 }]}>Suggested for you</Text>
                <TouchableOpacity onPress={refreshDiscover} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} disabled={refreshingDiscover}>
                  <Ionicons name="refresh" size={18} color={colors.primary} />
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 12 }}>
                {suggested.map((u) => (
                  <View key={u.id} style={[styles.suggestedCard, { borderColor: colors.border }]}>
                    <TouchableOpacity onPress={() => router.push(`/user/${u.id}`)}>
                      <View style={{ marginBottom: 8 }}>
                        <Avatar uri={u.avatar_url} size={56} />
                      </View>
                      <Text style={[styles.suggestedName, { color: colors.text }]} numberOfLines={1}>{u.display_name}</Text>
                      <Text style={[styles.suggestedUsername, { color: colors.subtext }]} numberOfLines={1}>@{u.username}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.followBtn, { backgroundColor: pending[u.id] ? colors.inputBg : colors.primary }]} onPress={() => followSuggested(u)}>
                      <Text style={[styles.followBtnText, pending[u.id] ? { color: colors.text } : null]}>{pending[u.id] || 'Follow'}</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </ScrollView>
      ) : (
        <>
          <View style={styles.tabs}>
            {(['people', 'posts'] as const).map((k) => (
              <TouchableOpacity
                key={k}
                style={[styles.tabBtn, { backgroundColor: tab === k ? colors.primary : colors.inputBg }]}
                onPress={() => {
                  tabChosen.current = true;
                  setTab(k);
                }}
              >
                <Text style={{ color: tab === k ? '#fff' : colors.text, fontWeight: '700', fontSize: 13 }}>{k === 'people' ? 'People' : 'Posts'}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {tab === 'people' ? (
            <>
              {loading && <ListSkeleton count={6} />}
              <FlatList
                data={results}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 110 }}
                renderItem={({ item }) => (
                  <TouchableOpacity style={[styles.row, { borderBottomColor: colors.border }]} onPress={() => router.push(`/user/${item.id}`)}>
                    <Avatar uri={item.avatar_url} size={44} />
                    <View>
                      <Text style={[styles.displayName, { color: colors.text }]}>{item.display_name}</Text>
                      <Text style={[styles.username, { color: colors.subtext }]}>@{item.username}</Text>
                    </View>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={!loading ? <Text style={[styles.empty, { color: colors.subtext }]}>No users found</Text> : null}
              />
            </>
          ) : (
            <FlatList
              data={posts}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 110 }}
              onEndReachedThreshold={0.5}
              onEndReached={() => {
                const clean = cleanSearchText(query);
                if (postsMore && !postsLoading && posts.length) fetchPosts(clean, posts[posts.length - 1].created_at);
              }}
              renderItem={({ item }) => (
                <TouchableOpacity style={[styles.postRow, { borderBottomColor: colors.border }]} onPress={() => openPost(item)}>
                  <Avatar uri={item.author?.avatar_url} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>
                      {item.author?.display_name}
                      <Text style={{ color: colors.subtext, fontWeight: '400' }}>  @{item.author?.username} · {postTime(item.created_at)}</Text>
                    </Text>
                    {!!item.content && (
                      <Text style={{ color: colors.text, fontSize: 14, marginTop: 3 }} numberOfLines={3}>
                        {item.content}
                      </Text>
                    )}
                    <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 4 }}>
                      {item.video_url ? '🎬 Video   ' : item.image_url ? '📷 Photo   ' : ''}♥ {item.likes?.[0]?.count ?? 0}   💬 {item.comments?.[0]?.count ?? 0}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={!postsLoading ? <Text style={[styles.empty, { color: colors.subtext }]}>No posts found</Text> : null}
              ListFooterComponent={postsLoading ? <ActivityIndicator style={{ marginVertical: 16 }} color={colors.primary} /> : null}
            />
          )}
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
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, marginBottom: 10 },
  suggestedCard: { width: 130, borderWidth: 1, borderRadius: 14, padding: 12, alignItems: 'center' },
  suggestedAvatar: { width: 56, height: 56, borderRadius: 28, marginBottom: 8 },
  suggestedName: { fontWeight: '700', fontSize: 13, textAlign: 'center' },
  suggestedUsername: { fontSize: 11, marginTop: 1, textAlign: 'center' },
  followBtn: { marginTop: 10, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 14 },
  followBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, paddingHorizontal: spacing.lg, gap: 12, borderBottomWidth: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  displayName: { fontWeight: '700', fontSize: 15 },
  username: { fontSize: 13, marginTop: 1 },
  empty: { textAlign: 'center', marginTop: 40 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.lg, paddingVertical: 10 },
  tabBtn: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 7 },
  postRow: { flexDirection: 'row', gap: 10, paddingHorizontal: spacing.lg, paddingVertical: 12, borderBottomWidth: 1 },
});
