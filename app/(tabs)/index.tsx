import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, RefreshControl, ActivityIndicator, TouchableOpacity, ScrollView, Animated } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import PostCard from '@/components/PostCard';
import ReelPreviewThumb from '@/components/ReelPreviewThumb';
import { colors, spacing } from '@/lib/theme';
import AppTopBar, { TOP_BAR_HEIGHT } from '@/components/AppTopBar';
import { useHideTabBarOnScroll, useTabBarVisibility, HIDE_DISTANCE } from '@/lib/tab-bar-visibility';

const AnimatedFlatList = Animated.createAnimatedComponent(require('react-native').FlatList);
const PAGE_SIZE = 10;

export default function HomeScreen() {
  const { session } = useAuth();
  const [posts, setPosts] = useState<any[]>([]);
  const [previewReels, setPreviewReels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reelsRowVisible, setReelsRowVisible] = useState(true);
  const onScroll = useHideTabBarOnScroll((y) => setReelsRowVisible(y < 140));
  const { clamped } = useTabBarVisibility();
  const fabTranslate = clamped.interpolate({ inputRange: [0, HIDE_DISTANCE], outputRange: [0, 100] });

  const decoratePosts = (data: any[]) =>
    data.map((p: any) => ({
      ...p,
      likes_count: p.likes?.length || 0,
      reposts_count: p.reposts?.length || 0,
      comments_count: p.comments?.length || 0,
      liked_by_me: p.likes?.some((l: any) => l.user_id === session?.user?.id) || false,
      reposted_by_me: p.reposts?.some((r: any) => r.user_id === session?.user?.id) || false,
    }));

  const loadInitial = useCallback(async () => {
    const { data, error } = await supabase
      .from('posts')
      .select('*,author:profiles(*),likes(user_id),reposts(user_id),comments(id)')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (!error && data) {
      setPosts(decoratePosts(data));
      setHasMore(data.length === PAGE_SIZE);
    }
    setLoading(false);
    setRefreshing(false);
  }, [session]);

  const loadMore = async () => {
    if (loadingMore || !hasMore || posts.length === 0) return;
    setLoadingMore(true);
    const oldest = posts[posts.length - 1];
    const { data, error } = await supabase
      .from('posts')
      .select('*,author:profiles(*),likes(user_id),reposts(user_id),comments(id)')
      .lt('created_at', oldest.created_at)
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
      .limit(10)
      .then(({ data }) => setPreviewReels(data || []));
  }, [loadInitial]);

  const onRefresh = () => {
    setRefreshing(true);
    setHasMore(true);
    loadInitial();
  };

  const toggleLike = async (post: any) => {
    if (!session?.user?.id) return;
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
  };

  const toggleRepost = async (post: any) => {
    if (!session?.user?.id) return;
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
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AnimatedFlatList
        data={posts}
        keyExtractor={(item: any) => item.id}
        renderItem={({ item }: any) => <PostCard post={item} onLike={toggleLike} onRepost={toggleRepost} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={<Text style={styles.empty}>No posts yet. Be the first!</Text>}
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
                <ReelPreviewThumb key={r.id} reel={r} visible={reelsRowVisible} />
              ))}
            </ScrollView>
          ) : null
        }
      />
      <Animated.View style={[styles.fab, { transform: [{ translateY: fabTranslate }] }]}>
        <TouchableOpacity style={styles.fabTouchable} onPress={() => router.push('/compose')}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      </Animated.View>
      <AppTopBar title="Flitters" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  empty: { textAlign: 'center', marginTop: 60, color: colors.subtext, fontSize: 15 },
  reelsRow: { marginTop: 10, marginBottom: 4 },
  fab: {
    position: 'absolute',
    bottom: 104,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    shadowColor: colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabTouchable: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
});
