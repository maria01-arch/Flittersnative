import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated, Alert } from 'react-native';
import { BlurView } from 'expo-blur';
import { useLocalSearchParams, router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import PostCard from '@/components/PostCard';
import VerifiedBadge from '@/components/VerifiedBadge';
import Avatar from '@/components/Avatar';
import ActionSheet, { ActionSheetOption } from '@/components/ActionSheet';
import ReportModal from '@/components/ReportModal';
import { spacing } from '@/lib/theme';
import { useTheme } from '@/lib/ThemeContext';
import { canPerform, permissionDeniedMessage } from '@/lib/permissions';
import StatusBarScrim from '@/components/StatusBarScrim';
import { ProfileHeaderSkeleton, FeedSkeleton } from '@/components/Skeleton';
import { sendFollowRequest, cancelFollowRequest, hasPendingRequest } from '@/lib/followRequests';

const AnimatedFlatList = Animated.createAnimatedComponent(require('react-native').FlatList);

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams();
  const { session } = useAuth();
  const { colors, isDark } = useTheme();
  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [reposts, setReposts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'posts' | 'reposts' | 'videos'>('posts');
  const [isFollowing, setIsFollowing] = useState(false);
  const [requested, setRequested] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pillWidth, setPillWidth] = useState<number | null>(null);
  const scrollY = useRef(new Animated.Value(0)).current;

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
      if (profileData?.is_private && !followData) {
        setRequested(await hasPendingRequest(session.user.id, id as string));
      } else {
        setRequested(false);
      }
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
    if (!post.reposted_by_me) {
      const allowed = await canPerform(post.author?.who_can_repost, post.user_id, session.user.id);
      if (!allowed) {
        Alert.alert("Can't repost", permissionDeniedMessage('who can repost their posts', post.author?.who_can_repost));
        return;
      }
    }
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
    // A private profile you don't already follow needs a request the
    // owner approves, not an instant follow — everything else (public
    // profiles, and unfollowing/cancelling either way) stays instant.
    if (profile?.is_private && !isFollowing) {
      if (requested) {
        setRequested(false);
        await cancelFollowRequest(session.user.id, id as string);
      } else {
        setRequested(true);
        await sendFollowRequest(session.user.id, id as string);
      }
      return;
    }
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

  // Was inserting {reported_type, reported_id} — columns the real table
  // doesn't have (it matches the webapp's shape: reported_user_id plus a
  // required reason), so this was silently failing every single time.
  const [reportOpen, setReportOpen] = useState(false);
  const submitUserReport = async (reason: string, details: string) => {
    if (!session?.user?.id) return;
    const { error } = await supabase.from('reports').insert({ reporter_id: session.user.id, reported_user_id: id, reason, details: details || null });
    if (error) throw error;
  };

  const [menuOpen, setMenuOpen] = useState(false);
  const openMenu = () => setMenuOpen(true);
  const profileMenuOptions: ActionSheetOption[] = [
    { label: isBlocked ? 'Unblock' : 'Block', icon: 'ban-outline', destructive: true, onPress: toggleBlock },
    { label: 'Report', icon: 'flag-outline', onPress: () => setReportOpen(true) },
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
      const allowed = await canPerform(profile?.who_can_message, id as string, session.user.id);
      if (!allowed) {
        Alert.alert("Can't message", permissionDeniedMessage('who can message them', profile?.who_can_message));
        return;
      }
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
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ProfileHeaderSkeleton />
        <View style={{ marginTop: 24 }}>
          <FeedSkeleton count={3} />
        </View>
      </View>
    );
  }

  const isMe = session?.user?.id === id;
  const videos = posts.filter((p) => p.video_url);
  const isLocked = !!profile?.is_private && !isMe && !isFollowing;
  const listData = isLocked ? [] : activeTab === 'posts' ? posts : activeTab === 'reposts' ? reposts : videos;

  const openFollowing = () => {
    if (profile?.who_can_see_following === 'nobody' && !isMe) {
      Alert.alert('Private', "This person has hidden who they follow.");
      return;
    }
    router.push(`/user/${id}/following`);
  };

  // Previous approach: one avatar element continuously scaled+translated
  // from its resting spot to a guessed pixel target next to the back
  // button. That guess was wrong on a real device — RN scales around an
  // element's own center, not its corner, so the "final" position doesn't
  // land where simple corner math predicts, and the avatar ended up
  // floating well above where it was supposed to sit, disconnected from
  // the compact name next to it.
  //
  // New approach, per your idea: a single glass pill holding a small
  // avatar + name together, so they're laid out by flexbox (always
  // aligned with each other, by construction) rather than by two separate
  // pieces of transform math trying to land in the same place. The pill
  // only ever moves along a straight, translate-only path (no scale), and
  // translate-only transforms in RN are exact — no center-vs-corner
  // surprises — so "where it ends up" is no longer a guess.
  // The big avatar+name+username block is a separate absolute overlay,
  // not actually part of this spacer's layout — so this height only ever
  // reserves *visual* room for it above the list's real content (the bio
  // is the first real thing below it). At 178 the block's actual bottom
  // edge (78 top + 96 avatar + 12 gap + ~25 name line + ~19 username
  // line) landed about 3px past where the bio started — invisible in a
  // layout inspector, but on a real device with any font-metric variance
  // (different OS, larger system font size, etc.) that gap goes negative
  // and the username visibly sits on top of the bio. This needs real
  // breathing room, not a number tuned to the exact pixel.
  const HEADER_RESERVE = 210;
  // Big avatar + big name: fade out together, in place, before scroll 90 —
  // no motion, so nothing to get wrong.
  const bigOpacity = scrollY.interpolate({ inputRange: [0, 90], outputRange: [1, 0], extrapolate: 'clamp' });
  // Glass pill: fades in over the back half of the scroll, sliding the
  // last little bit up into its resting spot (translate-only, so this
  // slide is pixel-accurate, unlike the old scale-based one).
  const pillOpacity = scrollY.interpolate({ inputRange: [90, 140], outputRange: [0, 1], extrapolate: 'clamp' });
  const pillTranslateY = scrollY.interpolate({ inputRange: [90, 140], outputRange: [10, 0], extrapolate: 'clamp' });
  // The pill starts as a plain circle — same width as its own height, so
  // borderRadius:19 makes it round rather than a stadium shape — and
  // widens into the full pill as it fades in. DOT_SIZE (38) lines up with
  // the pill's 10px left padding + 28px avatar, so what's actually inside
  // that starting circle is the avatar itself, not empty space: it reads
  // as "the avatar dot grows a name tag", not an unrelated blob appearing.
  // pillWidth is measured from the real content on its first layout pass
  // (see the BlurView's onLayout below); until that lands, 150 is just a
  // reasonable placeholder so nothing breaks on the very first frame.
  const DOT_SIZE = 38;
  const pillWidthAnim = scrollY.interpolate({ inputRange: [90, 140], outputRange: [DOT_SIZE, pillWidth || 150], extrapolate: 'clamp' });

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
              <TouchableOpacity onPress={openFollowing}>
                <Text style={[styles.stat, { color: colors.subtext }]}><Text style={[styles.statNum, { color: colors.text }]}>{profile?.following_count || 0}</Text> Following</Text>
              </TouchableOpacity>
            </View>
            {!isMe && (
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.followButton, { backgroundColor: colors.primary }, (isFollowing || requested) && { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border }]}
                  onPress={toggleFollow}
                >
                  <Text style={[styles.followText, (isFollowing || requested) && { color: colors.text }]}>
                    {isFollowing ? 'Following' : requested ? 'Requested' : 'Follow'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.messageButton, { borderColor: colors.primary }]} onPress={startConversation}>
                  <Text style={[styles.messageText, { color: colors.primary }]}>Message</Text>
                </TouchableOpacity>
              </View>
            )}

            {!isLocked && (
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
            )}

            {isLocked && (
              <View style={styles.lockedCard}>
                <Ionicons name="lock-closed" size={30} color={colors.faint} />
                <Text style={[styles.lockedTitle, { color: colors.text }]}>This profile is private</Text>
                <Text style={[styles.lockedBody, { color: colors.subtext }]}>
                  {requested
                    ? `Your follow request is waiting for @${profile?.username || 'this account'} to approve it.`
                    : `Follow @${profile?.username || 'this account'} to see their posts, reposts, and videos.`}
                </Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          isLocked ? null : (
            <Text style={[styles.empty, { color: colors.subtext }]}>
              {activeTab === 'posts' ? 'No posts yet.' : activeTab === 'reposts' ? 'No reposts yet.' : 'No videos yet.'}
            </Text>
          )
        }
      />

      {/* This screen only ever had two small floating circular buttons
          with nothing behind the status bar itself — persistent, not tied
          to scroll, same as the system status bar itself is always
          there. */}
      <StatusBarScrim />

      {/* Big avatar + name: static at their resting spot, just fade out
          together — no transform math to get wrong. */}
      <Animated.View style={[styles.floatingBig, { opacity: bigOpacity }]} pointerEvents="none">
        <Avatar uri={profile?.avatar_url} size={96} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
          <Text style={[styles.name, { color: colors.text }]}>{profile?.display_name || 'No name set'}</Text>
          <VerifiedBadge verified={profile?.verified} isAuthentic={profile?.is_authentic} size={16} />
        </View>
        <Text style={[styles.username, { color: colors.subtext }]}>@{profile?.username || 'unknown'}</Text>
      </Animated.View>

      {/* Invisible measuring copy: identical content, laid out completely
          normally (no animated parent, no BlurView) so its onLayout width
          is trustworthy. The real pill below reads pillWidth from THIS,
          not from measuring itself — a BlurView living inside a parent
          whose width is being animated turned out to not reliably report
          its true natural content width (it kept measuring back whatever
          the shrunken clip currently was, so the growth animation always
          stopped wherever it happened to be first measured instead of
          reaching the real full width). This copy never has that problem
          because nothing around it is animated or clipped. */}
      <View style={styles.pillMeasure} pointerEvents="none" onLayout={(e) => setPillWidth(e.nativeEvent.layout.width)}>
        <View style={styles.pill}>
          <Avatar uri={profile?.avatar_url} size={28} />
          <Text style={[styles.pillName, { color: colors.text }]} numberOfLines={1}>
            {profile?.display_name || 'No name set'}
          </Text>
          <VerifiedBadge verified={profile?.verified} isAuthentic={profile?.is_authentic} size={13} />
        </View>
      </View>

      {/* Glass pill: small avatar + name together in one row, so they're
          always aligned with each other by flexbox — not by two separate
          pieces of math trying to land in the same spot.
          The outer pillClip is what actually animates (width only, plus
          the wrap's own opacity/translateY) — the BlurView inside it stays
          at its natural full size the whole time and simply gets clipped
          by the shrunk clip window, which is what makes this read as
          "growing out of a dot" rather than a separately-scaled shape. */}
      <Animated.View style={[styles.pillWrap, { opacity: pillOpacity, transform: [{ translateY: pillTranslateY }] }]} pointerEvents="none">
        <Animated.View style={[styles.pillClip, { width: pillWidthAnim }]}>
          <BlurView intensity={50} tint={isDark ? 'dark' : 'light'} style={[styles.pill, { backgroundColor: colors.card + '99' }]}>
            <Avatar uri={profile?.avatar_url} size={28} />
            <Text style={[styles.pillName, { color: colors.text }]} numberOfLines={1}>
              {profile?.display_name || 'No name set'}
            </Text>
            <VerifiedBadge verified={profile?.verified} isAuthentic={profile?.is_authentic} size={13} />
          </BlurView>
        </Animated.View>
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
      <ReportModal visible={reportOpen} onClose={() => setReportOpen(false)} onSubmit={submitUserReport} />
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
  lockedCard: { alignItems: 'center', paddingHorizontal: 40, paddingVertical: 40 },
  lockedTitle: { fontSize: 16, fontWeight: '700', marginTop: 12 },
  lockedBody: { fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 19 },
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
  floatingBig: {
    position: 'absolute',
    top: 78,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pillWrap: {
    // Same top strip the back button sits in, just to its right — a fixed
    // spot, not a computed one, so there's nothing here that can be "off".
    position: 'absolute',
    top: 50,
    left: 64,
  },
  // Rendered off-screen (opacity 0, way outside any visible bounds) purely
  // so its onLayout gives an honest, unclipped measurement of the pill's
  // real content width. Never actually seen.
  pillMeasure: {
    position: 'absolute',
    top: -1000,
    left: 0,
    opacity: 0,
  },
  pillClip: {
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    // Without this, the default flex behavior stretches the BlurView
    // child to exactly match this box's own (animated, starting-tiny)
    // width — which meant its onLayout measurement always reported back
    // whatever the current animated width already was, not its true
    // content width. That collapsed the width interpolation's output
    // range down to a single repeated value, so it never visibly grew at
    // all. flex-start lets the child size itself from its real content
    // instead, and this box's own overflow:hidden is what clips it.
    alignItems: 'flex-start',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 38,
    paddingHorizontal: 10,
  },
  pillName: { fontSize: 15, fontWeight: '800', maxWidth: 150 },
});
