import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, ActivityIndicator, TouchableOpacity, ScrollView, Animated } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import PostCard from '@/components/PostCard';
import ReelPreviewThumb from '@/components/ReelPreviewThumb';
import { spacing } from '@/lib/theme';
import AppTopBar, { TOP_BAR_HEIGHT } from '@/components/AppTopBar';
import { useHideTabBarOnScroll, useTabBarVisibility, HIDE_DISTANCE } from '@/lib/tab-bar-visibility';

const AnimatedFlatList = Animated.createAnimatedComponent(require('react-native').FlatList);
const PAGE_SIZE = 10;

export default function HomeScreen() {
  const { session } = useAuth();
  const { colors } = useTheme();
  const [posts, setPosts] = useState<any[]>([]);
  const [previewReels, setPreviewReels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reelsRowVisible, setReelsRowVisible] = useState(true);
  const onScroll = useHideTabBarOnScroll((y) => setReelsRowVisible(y < 140));
  const [activeVideoKey, setActiveVideoKey] = useState<string | null>(null);
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    const firstVideo = viewableItems.find((v: any) => v.item?.video_url);
    setActiveVideoKey(firstVideo ? firstVideo.item.feedKey || firstVideo.item.id : null);
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const { clamped } = useTabBarVisibility();
  const fabTranslate = clamped.interpolate({ inputRange: [0, HIDE_DISTANCE], outputRange: [0, 100] });

  const decoratePosts = (data: any[]) =>
    data.map((p: any) => ({
      ...p,
      feedKey: p.id,
      likes_count: p.likes?.length || 0,
      reposts_count: p.reposts?.length || 0,
      comments_count: p.comments?.length || 0,
      liked_by_me: p.likes?.some((l: any) => l.user_id === session?.user?.id) || false,
      reposted_by_me: p.reposts?.some((r: any) => r.user_id === session?.user?.id) || false,
      sortTime: p.created_at,
    }));

  // Reposts live in their own table (id, created_at, content, user_id,
  // post_id) — the feed was only ever querying `posts` directly, so a
  // repost never showed up as anything at all, anywhere. This merges them
  // in as feed items shaped like the original post plus `isRepost`,
  // `reposter`, and optional `quoteContent`, sorted by when they were
  // reposted (not when the original post was made) — same shape the
  // webapp uses, just without its full affinity-ranking system, since this
  // feed is already deliberately simpler (pure reverse-chronological).
  const decorateReposts = (data: any[]) =>
    (data || [])
      .filter((r: any) => r.post)
      .map((r: any) => {
        const p = r.post;
        return {
          ...p,
          // `id` stays the original post's id — every action (like, repost,
          // comment) still needs to target the real post. But the SAME post
          // can appear more than once in this merged feed (reposted by more
          // than one person you follow, or reposted by someone right after
          // it was posted) — reusing `id` as the FlatList key then collides.
          // feedKey is unique per repost *entry* instead.
          feedKey: `repost-${r.id}`,
          likes_count: p.likes?.length || 0,
          reposts_count: p.reposts?.length || 0,
          comments_count: p.comments?.length || 0,
          liked_by_me: p.likes?.some((l: any) => l.user_id === session?.user?.id) || false,
          reposted_by_me: p.reposts?.some((rp: any) => rp.user_id === session?.user?.id) || false,
          isRepost: true,
          reposter: r.user,
          quoteContent: r.content,
          sortTime: r.created_at,
        };
      });

  const loadInitial = useCallback(async () => {
    const [{ data, error }, { data: repostsData }] = await Promise.all([
      supabase
        .from('posts')
        .select('*,author:profiles(*),likes(user_id),reposts(user_id),comments(id)')
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE),
      supabase
        .from('reposts')
        .select('id,created_at,content,user:profiles(*),post:posts(*,author:profiles(*),likes(user_id),reposts(user_id),comments(id))')
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE),
    ]);
    if (!error && data) {
      const merged = [...decoratePosts(data), ...decorateReposts(repostsData)].sort(
        (a, b) => new Date(b.sortTime).getTime() - new Date(a.sortTime).getTime()
      );
      setPosts(merged);
      setHasMore(data.length === PAGE_SIZE);
    }
    setLoading(false);
    setRefreshing(false);
  }, [session]);

  const loadMore = async () => {
    if (loadingMore || !hasMore || posts.length === 0) return;
    setLoadingMore(true);
    // Pagination continues on plain posts only — reposts are merged in on
    // the initial load and refresh, which covers what's actually visible
    // without needing a second, independent cursor for "further back"
    // reposts too.
    const oldest = posts.filter((p) => !p.isRepost).pop() || posts[posts.length - 1];
    const { data, error } = await supabase
      .from('posts')
      .select('*,author:profiles(*),likes(user_id),reposts(user_id),comments(id)')
      .lt('created_at', oldest.sortTime || oldest.created_at)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (!error && data) {
      setPosts((prev) => [...prev, ...decoratePosts(data)]);
      setHasMore(data.length === PAGE_SIZE);
    }
    setLoadingMore(false);
  };

  useEffect(() => {
    loadInitial();
    supabase
      .from('reels')
      .select('id,video_url,caption,author:profiles(display_name,avatar_url)')
      .order('created_at', { ascending: false })
      .limit(4)
      .then(({ data }) => setPreviewReels(data || []));
  }, [loadInitial]);

  const onRefresh = () => {
    setRefreshing(true);
    setHasMore(true);
    loadInitial();
  };

  // Guards against a fast double-tap on the same post firing the mutation
  // twice before the first tap's state update (and the re-render it
  // triggers) has actually landed — both calls would otherwise read the
  // same stale `post.liked_by_me` and both insert, which is exactly what
  // was producing duplicate `notifications` rows for one like.
  const likeInFlight = useRef<Set<string>>(new Set());
  const repostInFlight = useRef<Set<string>>(new Set());

  const toggleLike = async (post: any) => {
    if (!session?.user?.id || likeInFlight.current.has(post.id)) return;
    likeInFlight.current.add(post.id);
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? { ...p, liked_by_me: !p.liked_by_me, likes_count: p.liked_by_me ? p.likes_count - 1 : p.likes_count + 1 }
          : p
      )
    );
    if (post.liked_by_me) {
      await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', session.user.id);
    } else {
      await supabase.from('likes').insert({ post_id: post.id, user_id: session.user.id });
      if (post.user_id && post.user_id !== session.user.id) {
        await supabase.from('notifications').insert({ user_id: post.user_id, actor_id: session.user.id, type: 'like', post_id: post.id });
      }
    }
    likeInFlight.current.delete(post.id);
  };

  const toggleRepost = async (post: any) => {
    if (!session?.user?.id || repostInFlight.current.has(post.id)) return;
    repostInFlight.current.add(post.id);
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? { ...p, reposted_by_me: !p.reposted_by_me, reposts_count: p.reposted_by_me ? p.reposts_count - 1 : p.reposts_count + 1 }
          : p
      )
    );
    if (post.reposted_by_me) {
      await supabase.from('reposts').delete().eq('post_id', post.id).eq('user_id', session.user.id);
    } else {
      await supabase.from('reposts').insert({ post_id: post.id, user_id: session.user.id });
      if (post.user_id && post.user_id !== session.user.id) {
        await supabase.from('notifications').insert({ user_id: post.user_id, actor_id: session.user.id, type: 'repost', post_id: post.id });
      }
    }
    repostInFlight.current.delete(post.id);
  };

  const deletePost = (post: any) => {
    setPosts((prev) => prev.filter((p) => p.feedKey !== post.feedKey));
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <AnimatedFlatList
        data={posts}
        keyExtractor={(item: any) => item.feedKey || item.id}
        renderItem={({ item }: any) => (
          <PostCard
            post={item}
            currentUserId={session?.user?.id}
            active={(item.feedKey || item.id) === activeVideoKey}
            onLike={toggleLike}
            onRepost={toggleRepost}
            onDelete={deletePost}
          />
        )}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={<Text style={[styles.empty, { color: colors.subtext }]}>No posts yet. Be the first!</Text>}
        onScroll={onScroll}
        scrollEventThrottle={1}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} color={colors.primary} /> : null}
        contentContainerStyle={{ paddingBottom: 110, paddingTop: TOP_BAR_HEIGHT }}
        ListHeaderComponent={
          previewReels.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.reelsRow} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 10 }}>
              {previewReels.map((r) => (
                <ReelPreviewThumb key={r.id} reel={r} />
              ))}
              <TouchableOpacity style={[styles.viewMoreCard, { backgroundColor: colors.primary }]} onPress={() => router.push('/(tabs)/reels')}>
                <Ionicons name="chevron-forward-circle" size={30} color="#fff" />
                <Text style={styles.viewMoreText}>View More</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : null
        }
      />
      <Animated.View style={[styles.fab, { transform: [{ translateY: fabTranslate }] }, { shadowColor: colors.primary }]}>
        <TouchableOpacity style={[styles.fabTouchable, { backgroundColor: colors.primary }]} onPress={() => router.push('/compose')}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      </Animated.View>
      <AppTopBar title="Flitters" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { textAlign: 'center', marginTop: 60, fontSize: 15 },
  reelsRow: { marginTop: 10, marginBottom: 4 },
  viewMoreCard: {
    width: 90,
    height: 140,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  viewMoreText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  fab: {
    position: 'absolute',
    bottom: 104,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabTouchable: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
});
