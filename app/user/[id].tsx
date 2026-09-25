import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated, Alert, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import PostCard from '@/components/PostCard';
import VerifiedBadge from '@/components/VerifiedBadge';
import Avatar from '@/components/Avatar';
import ActionSheet, { ActionSheetOption } from '@/components/ActionSheet';
import { spacing } from '@/lib/theme';
import { useTheme } from '@/lib/ThemeContext';

const AnimatedFlatList = Animated.createAnimatedComponent(require('react-native').FlatList);

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams();
  const { session } = useAuth();
  const { colors } = useTheme();
  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [reposts, setReposts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'posts' | 'reposts' | 'videos'>('posts');
  const [isFollowing, setIsFollowing] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollY = useRef(new Animated.Value(0)).current;
  const { width: windowWidth } = useWindowDimensions();

  const load = async () => {
    const [{ data: profileData }, { data: postsData }, { data: followData }, { data: repostsData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', id).single(),
      supabase.from('posts').select('*,author:profiles(*),likes(user_id),reposts(user_id),comments(id)').eq('user_id', id).order('created_at', { ascending: false }),
      session?.user?.id
        ? supabase.from('follows').select('id').eq('follower_id', session.user.id).eq('following_id', id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('reposts')
        .select('id,created_at,content,user:profiles(*),post:posts(*,author:profiles(*),likes(user_id),reposts(user_id),comments(id))')
        .eq('user_id', id)
        .order('created_at', { ascending: false }),
    ]);
    if (session?.user?.id) {
      const { data: blockData } = await supabase.from('blocks').select('id').eq('blocker_id', session.user.id).eq('blocked_id', id).maybeSingle();
      setIsBlocked(!!blockData);
    }
    setProfile(profileData);
    setPosts(
      (postsData || []).map((p: any) => ({
        ...p,
        feedKey: p.id,
        likes_count: p.likes?.length || 0,
        reposts_count: p.reposts?.length || 0,
        comments_count: p.comments?.length || 0,
        liked_by_me: p.likes?.some((l: any) => l.user_id === session?.user?.id) || false,
        reposted_by_me: p.reposts?.some((r: any) => r.user_id === session?.user?.id) || false,
      }))
    );
    setReposts(
      (repostsData || [])
        .filter((r: any) => r.post)
        .map((r: any) => ({
          ...r.post,
          feedKey: `repost-${r.id}`,
          likes_count: r.post.likes?.length || 0,
          reposts_count: r.post.reposts?.length || 0,
          comments_count: r.post.comments?.length || 0,
          liked_by_me: r.post.likes?.some((l: any) => l.user_id === session?.user?.id) || false,
          reposted_by_me: r.post.reposts?.some((rp: any) => rp.user_id === session?.user?.id) || false,
          isRepost: true,
          reposter: r.user,
          quoteContent: r.content,
        }))
    );
    setIsFollowing(!!followData);
    setLoading(false);
  };

  useEffect(() => {
    if (!id) return;
    load();
  }, [id, session]);

  const likeInFlight = useRef<Set<string>>(new Set());
  const repostInFlight = useRef<Set<string>>(new Set());

  const applyLike = (list: any[], setList: (fn: any) => void, post: any) => {
    setList((prev: any[]) =>
      prev.map((p) => (p.id === post.id ? { ...p, liked_by_me: !p.liked_by_me, likes_count: p.liked_by_me ? p.likes_count - 1 : p.likes_count + 1 } : p))
    );
  };
  const applyRepostFlag = (setList: (fn: any) => void, post: any) => {
    setList((prev: any[]) =>
      prev.map((p) => (p.id === post.id ? { ...p, reposted_by_me: !p.reposted_by_me, reposts_count: p.reposted_by_me ? p.reposts_count - 1 : p.reposts_count + 1 } : p))
    );
  };

  const toggleLike = async (post: any) => {
    if (!session?.user?.id || likeInFlight.current.has(post.id)) return;
    likeInFlight.current.add(post.id);
    applyLike(posts, setPosts, post);
    applyLike(reposts, setReposts, post);
    if (post.liked_by_me) {
      await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', session.user.id);
    } else {
      await supabase.from('likes').insert({ post_id: post.id, user_id: session.user.id });
    }
    likeInFlight.current.delete(post.id);
  };

  const toggleRepost = async (post: any) => {
    if (!session?.user?.id || repostInFlight.current.has(post.id)) return;
    repostInFlight.current.add(post.id);
    applyRepostFlag(setPosts, post);
    applyRepostFlag(setReposts, post);
    if (post.reposted_by_me) {
      await supabase.from('reposts').delete().eq('post_id', post.id).eq('user_id', session.user.id);
    } else {
      await supabase.from('reposts').insert({ post_id: post.id, user_id: session.user.id });
    }
    repostInFlight.current.delete(post.id);
  };

  const deletePost = (post: any) => {
    setPosts((prev) => prev.filter((p) => p.id !== post.id));
  };

  const toggleFollow = async () => {
    if (!session?.user?.id) return;
    setIsFollowing(!isFollowing);
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', session.user.id).eq('following_id', id);
    } else {
      await supabase.from('follows').insert({ follower_id: session.user.id, following_id: id });
      await supabase.from('notifications').insert({ user_id: id, actor_id: session.user.id, type: 'follow' });
    }
  };

  const toggleBlock = async () => {
    if (!session?.user?.id) return;
    if (isBlocked) {
      await supabase.from('blocks').delete().eq('blocker_id', session.user.id).eq('blocked_id', id);
      setIsBlocked(false);
    } else {
      await supabase.from('blocks').insert({ blocker_id: session.user.id, blocked_id: id });
      await supabase.from('follows').delete().eq('follower_id', session.user.id).eq('following_id', id);
      await supabase.from('follows').delete().eq('follower_id', id).eq('following_id', session.user.id);
      setIsBlocked(true);
      setIsFollowing(false);
    }
  };

  const reportUser = async () => {
    if (!session?.user?.id) return;
    const { error } = await supabase.from('reports').insert({ reporter_id: session.user.id, reported_type: 'user', reported_id: id });
    if (error) {
      console.error('[UserProfile] report failed:', error.message, error);
      Alert.alert("Couldn't submit report", error.message);
      return;
    }
    Alert.alert('Reported', "Thanks — we've received your report.");
  };

  const [menuOpen, setMenuOpen] = useState(false);
  const openMenu = () => setMenuOpen(true);
  const profileMenuOptions: ActionSheetOption[] = [
    { label: isBlocked ? 'Unblock' : 'Block', icon: 'ban-outline', destructive: true, onPress: toggleBlock },
    {
      label: 'Report',
      icon: 'flag-outline',
      onPress: () =>
        Alert.alert('Report user', 'Are you sure you want to report this account?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Report', style: 'destructive', onPress: reportUser },
        ]),
    },
  ];

  const startConversation = async () => {
    if (!session?.user?.id) return;
    const { data: myConvs } = await supabase.from('conversation_participants').select('conversation_id').eq('user_id', session.user.id);
    let convId: string | null = null;
    if (myConvs?.length) {
      const { data: shared } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', id)
        .in('conversation_id', myConvs.map((c: any) => c.conversation_id));
      if (shared?.length) convId = shared[0].conversation_id;
    }
    if (!convId) {
      const { data: conv } = await supabase.from('conversations').insert({}).select().single();
      await supabase.from('conversation_participants').insert([
        { conversation_id: conv.id, user_id: session.user.id },
        { conversation_id: conv.id, user_id: id },
      ]);
      convId = conv.id;
    }
    router.push({ pathname: '/conversation/[id]', params: { id: convId, name: profile?.display_name || 'Chat', otherId: id, otherAvatar: profile?.avatar_url || '' } });
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const isMe = session?.user?.id === id;
  const videos = posts.filter((p) => p.video_url);
  const listData = activeTab === 'posts' ? posts : activeTab === 'reposts' ? reposts : videos;

  // One element, continuously scaling and sliding from its resting spot
  // (centered, below the status bar) to a compact spot pinned next to the
  // back button — not two elements cross-fading. Scaling the whole block
  // shrinks the avatar and the name together, in step, the whole time.
  const HEADER_RESERVE = 178; // space the avatar+name block occupies at rest
  const scale = scrollY.interpolate({ inputRange: [0, 140], outputRange: [1, 0.32], extrapolate: 'clamp' });
  const targetCenterX = 64 + 46; // roughly next to the back button once shrunk
  const translateX = scrollY.interpolate({
    inputRange: [0, 140],
    outputRange: [0, targetCenterX - windowWidth / 2],
    extrapolate: 'clamp',
  });
  const translateY = scrollY.interpolate({ inputRange: [0, 140], outputRange: [0, -98], extrapolate: 'clamp' });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AnimatedFlatList
        style={{ backgroundColor: colors.bg }}
        data={listData}
        keyExtractor={(item: any) => item.feedKey || item.id}
        contentContainerStyle={{ paddingBottom: 110 }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        scrollEventThrottle={16}
        renderItem={({ item }: any) => <PostCard post={item} currentUserId={session?.user?.id} onLike={toggleLike} onRepost={toggleRepost} onDelete={deletePost} />}
        ListHeaderComponent={
          <View style={[styles.header, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
            <View style={{ height: HEADER_RESERVE }} />
            {profile?.bio ? <Text style={[styles.bio, { color: colors.text }]}>{profile.bio}</Text> : null}
            <View style={styles.statsRow}>
              <Text style={[styles.stat, { color: colors.subtext }]}><Text style={[styles.statNum, { color: colors.text }]}>{profile?.followers_count || 0}</Text> Followers</Text>
              <Text style={[styles.stat, { color: colors.subtext }]}><Text style={[styles.statNum, { color: colors.text }]}>{profile?.following_count || 0}</Text> Following</Text>
            </View>
            {!isMe && (
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.followButton, { backgroundColor: colors.primary }, isFollowing && { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border }]}
                  onPress={toggleFollow}
                >
                  <Text style={[styles.followText, isFollowing && { color: colors.text }]}>{isFollowing ? 'Following' : 'Follow'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.messageButton, { borderColor: colors.primary }]} onPress={startConversation}>
                  <Text style={[styles.messageText, { color: colors.primary }]}>Message</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={[styles.tabRow, { borderColor: colors.border }]}>
              {(['posts', 'reposts', 'videos'] as const).map((tab) => (
                <TouchableOpacity key={tab} style={styles.tabBtn} onPress={() => setActiveTab(tab)}>
                  <Text style={[styles.tabText, { color: activeTab === tab ? colors.text : colors.faint }, activeTab === tab && { fontWeight: '700' }]}>
                    {tab === 'posts' ? 'Posts' : tab === 'reposts' ? 'Reposts' : 'Videos'}
                  </Text>
                  {activeTab === tab && <View style={[styles.tabUnderline, { backgroundColor: colors.primary }]} />}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.subtext }]}>
            {activeTab === 'posts' ? 'No posts yet.' : activeTab === 'reposts' ? 'No reposts yet.' : 'No videos yet.'}
          </Text>
        }
      />

      {/* The one avatar+name block, floating above the list so it never
          fights the list's own layout — it's the same element throughout
          the scroll, just transformed. */}
      <Animated.View style={[styles.floatingIdentity, { transform: [{ translateX }, { translateY }, { scale }] }]} pointerEvents="none">
        <Avatar uri={profile?.avatar_url} size={96} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
          <Text style={[styles.name, { color: colors.text }]}>{profile?.display_name || 'No name set'}</Text>
          <VerifiedBadge verified={profile?.verified} isAuthentic={profile?.is_authentic} size={16} />
        </View>
        <Text style={[styles.username, { color: colors.subtext }]}>@{profile?.username || 'unknown'}</Text>
      </Animated.View>

      <View style={styles.topOverlay} pointerEvents="box-none">
        <TouchableOpacity style={[styles.topOverlayBtn, { backgroundColor: colors.card }]} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        {!isMe && (
          <TouchableOpacity style={[styles.topOverlayBtn, { backgroundColor: colors.card }]} onPress={openMenu}>
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.text} />
          </TouchableOpacity>
        )}
      </View>

      <ActionSheet visible={menuOpen} title={profile?.display_name} options={profileMenuOptions} onClose={() => setMenuOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { alignItems: 'center', paddingTop: 50, paddingBottom: 0, borderBottomWidth: 0 },
  name: { fontSize: 20, fontWeight: '800', marginTop: 12 },
  username: { fontSize: 15, marginTop: 2 },
  bio: { fontSize: 14, marginTop: 10, textAlign: 'center', paddingHorizontal: 30 },
  statsRow: { flexDirection: 'row', gap: 24, marginTop: 16 },
  stat: { fontSize: 14 },
  statNum: { fontWeight: '700' },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  followButton: { borderRadius: 20, paddingVertical: 10, paddingHorizontal: 28, justifyContent: 'center', alignItems: 'center' },
  followText: { color: '#fff', fontWeight: '700' },
  messageButton: { borderWidth: 1, borderRadius: 20, paddingVertical: 10, paddingHorizontal: 24, justifyContent: 'center', alignItems: 'center' },
  messageText: { fontWeight: '700' },
  tabRow: { flexDirection: 'row', marginTop: 24, width: '100%', borderBottomWidth: 1 },
  tabBtn: { flex: 1, alignItems: 'center', paddingBottom: 12 },
  tabText: { fontSize: 14 },
  tabUnderline: { height: 2.5, width: 40, borderRadius: 2, marginTop: 8 },
  empty: { textAlign: 'center', marginTop: 30 },
  topOverlay: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topOverlayBtn: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
  floatingIdentity: {
    position: 'absolute',
    top: 78,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});
