import { useCallback, useEffect, useRef, useState } from 'react';
import { hasLiveCoverReward } from '@/lib/streaks';
import { View, StyleSheet, ActivityIndicator, Animated, Alert, Image } from 'react-native';
import TouchableOpacity from '@/components/PressScale';
import Text from '@/components/AppText';
import { BlurView } from 'expo-blur';
import { onOwnBadgeChanged } from '@/lib/billingRefresh';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
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
import { notifyOnce, createQuoteRepost, applyCounts, fetchMyFlags, coownersEmbed } from '@/lib/postActions';
import StatusBarScrim from '@/components/StatusBarScrim';
import { ProfileHeaderSkeleton, FeedSkeleton } from '@/components/Skeleton';
import { LinearGradient } from 'expo-linear-gradient';
import LiveCover from '@/components/LiveCover';
import ImageViewer from '@/components/ImageViewer';
import RingAvatar from '@/components/RingAvatar';
import { ringFor } from '@/lib/momentRings';
import { fmtCount } from '@/lib/formatCount';
import ProfileQRModal from '@/components/ProfileQRModal';
import NameInfoModal from '@/components/NameInfoModal';
import GiftSheet from '@/components/GiftSheet';
import { giftTotals, useGiftAccess, type GiftTop } from '@/lib/coins';
import ShareLinkSheet from '@/components/ShareLinkSheet';
import { profileLink } from '@/lib/flittersLinks';
import { sendFollowRequest, cancelFollowRequest, hasPendingRequest } from '@/lib/followRequests';
import { pinPost } from '@/lib/creator';

const AnimatedFlatList = Animated.createAnimatedComponent(require('react-native').FlatList);

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams();
  const { session } = useAuth();
  const { colors, isDark } = useTheme();
  const [profile, setProfile] = useState<any>(null);
  // A live cover also shows for people who earned it with a 30-day chat streak.
  const [coverEarned, setCoverEarned] = useState(false);
  useEffect(() => {
    setCoverEarned(false);
    const pid = profile?.id;
    if (!pid || !profile?.cover_video_url || profile?.verified || profile?.is_authentic) return;
    let alive = true;
    hasLiveCoverReward(pid).then((v) => { if (alive) setCoverEarned(v); });
    return () => { alive = false; };
  }, [profile?.id, profile?.cover_video_url, profile?.verified, profile?.is_authentic]);
  useEffect(() => onOwnBadgeChanged((uid, patch) => {
    setProfile((p: any) => (p && p.id === uid ? { ...p, ...patch } : p));
  }), []);
  const [posts, setPosts] = useState<any[]>([]);
  const [reposts, setReposts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'posts' | 'reposts' | 'videos'>('posts');
  const [isFollowing, setIsFollowing] = useState(false);
  const [requested, setRequested] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pillWidth, setPillWidth] = useState<number | null>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  // The big name only takes taps while it is actually visible (before the page scrolls it away).
  const [bigTouch, setBigTouch] = useState(true);
  useEffect(() => {
    const lid = scrollY.addListener(({ value }: { value: number }) => setBigTouch(value < 45));
    return () => scrollY.removeListener(lid);
  }, []);
  const [qrOpen, setQrOpen] = useState(false);
  const [nameInfoOpen, setNameInfoOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [gifts, setGifts] = useState<{ count: number; top: GiftTop[] }>({ count: 0, top: [] });
  const giftAccess = useGiftAccess(id ? String(id) : null);
  useEffect(() => { if (id) giftTotals(String(id)).then(setGifts).catch(() => {}); }, [id, giftOpen]);
  // Bell: get a notification whenever this person posts.
  const [bellOn, setBellOn] = useState(false);
  const [bellBusy, setBellBusy] = useState(false);
  const [shareProfileOpen, setShareProfileOpen] = useState(false);

  // One video at a time on a profile too, and none once you leave the screen.
  const [activeVideoKey, setActiveVideoKey] = useState<string | null>(null);
  const [screenFocused, setScreenFocused] = useState(true);
  // The live cover stops once the cover has scrolled out of sight.
  const [coverAway, setCoverAway] = useState(false);
  const [viewAvatar, setViewAvatar] = useState(false);
  // Total likes this person's posts and reels have received (needs profile_likes.sql; until then it adds up the posts loaded here).
  const [totalLikes, setTotalLikes] = useState<number | null>(null);
  useEffect(() => {
    if (!id) return;
    supabase.rpc('profile_likes_total', { p_user: String(id) }).then(({ data, error }: any) => {
      if (!error && data !== null && data !== undefined) setTotalLikes(Number(data));
    });
  }, [id]);
  useEffect(() => {
    const lid = scrollY.addListener(({ value }: { value: number }) => setCoverAway((was) => (was ? value > 150 : value > 200)));
    return () => scrollY.removeListener(lid);
  }, [scrollY]);
  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      return () => setScreenFocused(false);
    }, [])
  );
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    const firstVideo = viewableItems.find((v: any) => v.item?.video_url);
    setActiveVideoKey(firstVideo ? firstVideo.item.feedKey || firstVideo.item.id : null);
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const load = async () => {
    const [{ data: profileData }, { data: ownPosts }, { data: followData }, { data: repostsData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', id).single(),
      supabase.from('posts').select(`*,author:profiles(id,display_name,username,avatar_url,verified,is_authentic,verified_plan,who_can_repost,who_can_comment),likes(count),reposts(count),comments(count)${coownersEmbed()}`).eq('user_id', id).or('thread_order.is.null,thread_order.eq.0').order('created_at', { ascending: false }),
      session?.user?.id
        ? supabase.from('follows').select('follower_id').eq('follower_id', session.user.id).eq('following_id', id).limit(1).then((r: any) => ({ data: r.data && r.data.length ? r.data[0] : null }))
        : Promise.resolve({ data: null }),
      supabase
        .from('reposts')
        .select('id,created_at,content,user:profiles(id,display_name,username,avatar_url,verified,is_authentic,verified_plan),post:posts(*,author:profiles(id,display_name,username,avatar_url,verified,is_authentic,verified_plan,who_can_repost,who_can_comment),likes(count),reposts(count),comments(count))')
        .eq('user_id', id)
        .order('created_at', { ascending: false }),
    ]);
    // Posts this person co-owns show up on their profile too.
    const { data: coRows, error: coErr } = await supabase
      .from('post_coowners')
      .select('post:posts(*,author:profiles(id,display_name,username,avatar_url,verified,is_authentic,verified_plan,who_can_repost,who_can_comment),likes(count),reposts(count),comments(count)' + coownersEmbed() + ')')
      .eq('user_id', id);
    const ownIds = new Set((ownPosts || []).map((p: any) => p.id));
    const coPosts = coErr ? [] : (coRows || []).map((r: any) => r.post).filter((p: any) => p && !ownIds.has(p.id));
    const postsData = [...(ownPosts || []), ...coPosts].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
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
    const flags = await fetchMyFlags([...(postsData || []).map((p: any) => p.id), ...(repostsData || []).filter((r: any) => r.post).map((r: any) => r.post.id)], session?.user?.id);
    setPosts(
      (postsData || []).map((p: any) => ({
        ...p,
        feedKey: p.id,
        ...applyCounts(p, flags),
      }))
    );
    setReposts(
      (repostsData || [])
        .filter((r: any) => r.post)
        .map((r: any) => ({
          ...r.post,
          feedKey: `repost-${r.id}`,
          ...applyCounts(r.post, flags),
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
  }, [id, session?.user?.id]);

  useEffect(() => {
    const me = session?.user?.id;
    if (!me || !id || me === id) return;
    supabase
      .from('profile_post_alerts')
      .select('id')
      .eq('user_id', me)
      .eq('target_id', id as string)
      .maybeSingle()
      .then(({ data }) => setBellOn(!!data));
  }, [id, session?.user?.id]);

  const toggleBell = async () => {
    const me = session?.user?.id;
    if (!me || !id || bellBusy) return;
    setBellBusy(true);
    const want = !bellOn;
    setBellOn(want);
    const res = want
      ? await supabase.from('profile_post_alerts').insert({ user_id: me, target_id: id as string }).select('id')
      : await supabase.from('profile_post_alerts').delete().eq('user_id', me).eq('target_id', id as string).select('id');
    if (res.error || (!want ? false : !res.data?.length)) {
      setBellOn(!want);
      Alert.alert("Couldn't change that", res.error?.message || 'Please try again.');
    }
    setBellBusy(false);
  };

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
    try {
      const { error } = post.liked_by_me
        ? await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', session.user.id)
        : await supabase.from('likes').insert({ post_id: post.id, user_id: session.user.id });
      if (error && !/duplicate/i.test(error.message)) throw error;
    } catch {
      // Not saved: flip the heart back.
      applyLike(posts, setPosts, { id: post.id });
      applyLike(reposts, setReposts, { id: post.id });
    } finally {
      likeInFlight.current.delete(post.id);
    }
  };

  const quoteRepost = async (post: any, text: string) => {
    if (!session?.user?.id) return;
    const { error } = await createQuoteRepost(post, text, session.user.id);
    if (error) {
      Alert.alert("Can't quote", error);
      throw new Error(error);
    }
    const mark = (prev: any[]) => prev.map((p) => (p.id === post.id ? { ...p, reposted_by_me: true, reposts_count: (p.reposts_count || 0) + 1 } : p));
    setPosts(mark);
    setReposts(mark);
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
      await notifyOnce({ userId: post.user_id, actorId: session.user.id, type: 'repost', postId: post.id });
    }
    repostInFlight.current.delete(post.id);
  };

  const deletePost = (post: any) => {
    setPosts((prev) => prev.filter((p) => p.id !== post.id));
    // The database clears the pin when its post is deleted; mirror that here.
    setProfile((p: any) => (p && p.pinned_post_id === post.id ? { ...p, pinned_post_id: null } : p));
  };

  const togglePin = async (post: any) => {
    if (!session?.user?.id || session.user.id !== id) return;
    const next = profile?.pinned_post_id === post.id ? null : post.id;
    const before = profile?.pinned_post_id ?? null;
    setProfile((p: any) => (p ? { ...p, pinned_post_id: next } : p));
    const { error } = await pinPost(session.user.id, next);
    if (error) {
      setProfile((p: any) => (p ? { ...p, pinned_post_id: before } : p));
      Alert.alert("Couldn't pin the post", /pinned_post_id|column/i.test(error.message) ? 'The server is missing the creator update (02_creators.sql).' : error.message);
    }
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
        const { error } = await sendFollowRequest(session.user.id, id as string);
        // A leftover request from before is fine; anything else: undo and say why.
        if (error && (error as any).code !== '23505') {
          setRequested(false);
          Alert.alert("Couldn't send request", error.message || 'Try again.');
        }
      }
      return;
    }
    const wasFollowing = isFollowing;
    setIsFollowing(!wasFollowing);
    if (wasFollowing) {
      const { error } = await supabase.from('follows').delete().eq('follower_id', session.user.id).eq('following_id', id);
      if (error) {
        setIsFollowing(true);
        Alert.alert("Couldn't unfollow", error.message || 'Try again.');
      }
    } else {
      const { error } = await supabase.from('follows').insert({ follower_id: session.user.id, following_id: id });
      if (error && (error as any).code !== '23505') {
        setIsFollowing(false);
        Alert.alert("Couldn't follow", error.message || 'Try again.');
        return;
      }
      await notifyOnce({ userId: id as string, actorId: session.user.id, type: 'follow' });
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
    { label: 'Share profile', icon: 'share-social-outline', onPress: () => setTimeout(() => setShareProfileOpen(true), 250) },
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
  // The pinned post (if any) sits first in the Posts tab. All of a person's
  // own posts are loaded here, so no extra fetch is needed.
  const pinnedId: string | null = profile?.pinned_post_id || null;
  const postsOrdered = pinnedId && posts.some((p) => p.id === pinnedId)
    ? [posts.find((p) => p.id === pinnedId)!, ...posts.filter((p) => p.id !== pinnedId)]
    : posts;
  const listData = isLocked ? [] : activeTab === 'posts' ? postsOrdered : activeTab === 'reposts' ? reposts : videos;

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
  const COVER_SPACE = 150;
  const AVATAR_BIG = 92;
  // Big avatar + big name: fade out together, in place, before scroll 90 —
  // no motion, so nothing to get wrong.
  const bigOpacity = scrollY.interpolate({ inputRange: [0, 90], outputRange: [1, 0], extrapolate: 'clamp' });
  // Glass pill: fades in over the back half of the scroll, sliding the
  // last little bit up into its resting spot (translate-only, so this
  // slide is pixel-accurate, unlike the old scale-based one).
  const pillOpacity = scrollY.interpolate({ inputRange: [250, 300], outputRange: [0, 1], extrapolate: 'clamp' });
  const pillTranslateY = scrollY.interpolate({ inputRange: [250, 300], outputRange: [10, 0], extrapolate: 'clamp' });
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
  const pillWidthAnim = scrollY.interpolate({ inputRange: [250, 300], outputRange: [DOT_SIZE, pillWidth || 150], extrapolate: 'clamp' });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AnimatedFlatList
        style={{ backgroundColor: colors.bg }}
        data={listData}
        keyExtractor={(item: any) => item.feedKey || item.id}
        contentContainerStyle={{ paddingBottom: 110 }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        scrollEventThrottle={16}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        renderItem={({ item }: any) => <PostCard post={item} active={screenFocused && (item.feedKey || item.id) === activeVideoKey} currentUserId={session?.user?.id} onLike={toggleLike} onRepost={toggleRepost} onQuote={quoteRepost} onDelete={deletePost} pinned={activeTab === 'posts' && item.id === pinnedId} onPin={isMe && activeTab === 'posts' ? togglePin : undefined} />}
        ListHeaderComponent={
          <View style={[styles.header, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
            {/* Cover photo: the profile picture sits across its bottom edge (top half on the cover). */}
            <View style={styles.cover} pointerEvents="none">
              {profile?.cover_url ? (
                <Image source={{ uri: profile.cover_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              ) : (
                <LinearGradient colors={[colors.primary + 'CC', colors.primary + '33']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              )}
              {/* Live cover: only for blue-badge (or gold) accounts, only while this screen is in front. */}
              {profile?.cover_video_url && (profile?.verified || profile?.is_authentic || coverEarned) && screenFocused ? <LiveCover url={profile.cover_video_url} paused={coverAway} /> : null}
              {/* The fade: the cover melts into the page colour, so the name and numbers sit on it. */}
              <LinearGradient colors={[colors.bg + '00', colors.bg + 'CC', colors.bg]} locations={[0.3, 0.72, 1]} style={StyleSheet.absoluteFill} />
            </View>
            <View style={{ height: COVER_SPACE }} />
            {/* Name row: @username and the three numbers on the left, big picture on the right, all sitting on the cover's fade. */}
            <View style={styles.idRow}>
              <View style={styles.idLeft}>
                <Text style={[styles.handle, { color: colors.subtext }]} numberOfLines={1}>@{profile?.username || 'unknown'}</Text>
                <View style={styles.statsRow}>
                  <TouchableOpacity onPress={openFollowing} activeOpacity={0.7}>
                    <Text style={[styles.statNum, { color: colors.text }]}>{fmtCount(profile?.following_count)}</Text>
                    <Text style={[styles.statLabel, { color: colors.subtext }]}>Following</Text>
                  </TouchableOpacity>
                  <View>
                    <Text style={[styles.statNum, { color: colors.text }]}>{fmtCount(profile?.followers_count)}</Text>
                    <Text style={[styles.statLabel, { color: colors.subtext }]}>Followers</Text>
                  </View>
                  <View>
                    <Text style={[styles.statNum, { color: colors.text }]}>{fmtCount(totalLikes ?? posts.reduce((n: number, p: any) => n + (p.likes_count || 0), 0))}</Text>
                    <Text style={[styles.statLabel, { color: colors.subtext }]}>Likes</Text>
                  </View>
                </View>
              </View>
              <View style={{ alignItems: 'center' }}>
                <TouchableOpacity activeOpacity={0.9} onPress={() => (ringFor(profile?.id || id as any) ? router.push(`/moment/${profile?.id || id}`) : profile?.avatar_url && setViewAvatar(true))} style={[styles.avatarBig, { borderColor: colors.bg }]}>
                  <RingAvatar userId={profile?.id || (id as any)} uri={profile?.avatar_url} size={AVATAR_BIG} noTap />
                </TouchableOpacity>
                {isMe && profile?.is_professional ? (
                  <TouchableOpacity activeOpacity={0.8} onPress={() => router.push('/creator')} style={[styles.dashBtn, { borderColor: colors.primary, backgroundColor: colors.primary + '1A' }]}>
                    <Ionicons name="stats-chart" size={13} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Dashboard</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
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
                {giftAccess?.profile_on ? (
                  <TouchableOpacity style={[styles.bellButton, { borderColor: colors.border }]} onPress={() => setGiftOpen(true)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Ionicons name="gift-outline" size={20} color={colors.text} />
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={[styles.bellButton, { borderColor: bellOn ? colors.primary : colors.border }, bellOn && { backgroundColor: colors.primary + '22' }]}
                  onPress={toggleBell}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Ionicons name={bellOn ? 'notifications' : 'notifications-outline'} size={20} color={bellOn ? colors.primary : colors.text} />
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity activeOpacity={0.7} onPress={() => setNameInfoOpen(true)} style={styles.nameRow}>
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{profile?.display_name || 'No name set'}</Text>
              <VerifiedBadge verified={profile?.verified} isAuthentic={profile?.is_authentic} plan={profile?.verified_plan} size={16} />
            </TouchableOpacity>
            {gifts.count > 0 && (
              <TouchableOpacity activeOpacity={0.7} onPress={() => router.push(`/gifts/${profile?.id || id}` as any)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <Text style={{ fontSize: 15 }}>{gifts.top.map((t) => t.emoji).join(' ')}</Text>
                <Text style={{ color: colors.subtext, fontSize: 13, fontWeight: '600' }}>{fmtCount(gifts.count)} gift{gifts.count === 1 ? '' : 's'} received</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.faint} />
              </TouchableOpacity>
            )}
            {profile?.bio ? <Text style={[styles.bio, { color: colors.text }]}>{profile.bio}</Text> : null}

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
          <VerifiedBadge verified={profile?.verified} isAuthentic={profile?.is_authentic} plan={profile?.verified_plan} size={13} />
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
            <VerifiedBadge verified={profile?.verified} isAuthentic={profile?.is_authentic} plan={profile?.verified_plan} size={13} />
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
        {isMe && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={[styles.topOverlayBtn, { backgroundColor: colors.card }]} onPress={() => setQrOpen(true)}>
              <Ionicons name="qr-code-outline" size={19} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.topOverlayBtn, { backgroundColor: colors.card }]} onPress={() => router.push('/edit-profile')}>
              <Ionicons name="pencil" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <ActionSheet visible={menuOpen} title={profile?.display_name} options={profileMenuOptions} onClose={() => setMenuOpen(false)} />
      <ImageViewer uri={viewAvatar ? profile?.avatar_url : null} onClose={() => setViewAvatar(false)} />
      <GiftSheet visible={giftOpen} onClose={() => setGiftOpen(false)} toUserId={profile?.id || String(id)} toName={profile?.display_name} context="profile" />
      <NameInfoModal visible={nameInfoOpen} profile={profile} onClose={() => setNameInfoOpen(false)} />
      <ProfileQRModal visible={qrOpen} profile={profile} onClose={() => setQrOpen(false)} />
      {!!profile?.username && <ShareLinkSheet visible={shareProfileOpen} url={profileLink(profile.username)} title="Share profile" userId={session?.user?.id} onClose={() => setShareProfileOpen(false)} />}
      <ReportModal visible={reportOpen} onClose={() => setReportOpen(false)} onSubmit={submitUserReport} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { paddingTop: 0, borderBottomWidth: 0 },
  idRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 18 },
  idLeft: { flex: 1, paddingRight: 12, paddingBottom: 8 },
  handle: { fontSize: 16, fontWeight: '500', marginBottom: 10 },
  statsRow: { flexDirection: 'row', gap: 16 },
  statNum: { fontSize: 21, fontWeight: '800' },
  statLabel: { fontSize: 13, marginTop: 1 },
  dashBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, marginLeft: 8, borderWidth: 1, borderRadius: 14, paddingVertical: 5, paddingHorizontal: 12 },
  avatarBig: { borderWidth: 3, borderRadius: 60, marginLeft: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, marginTop: 14 },
  name: { fontSize: 18, fontWeight: '800', flexShrink: 1 },
  username: { fontSize: 15, marginTop: 2 },
  bio: { fontSize: 14, marginTop: 4, paddingHorizontal: 18, lineHeight: 20 },
  buttonRow: { flexDirection: 'row', gap: 8, marginTop: 16, paddingHorizontal: 18 },
  followButton: { flex: 1, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  followText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  bellButton: { borderWidth: 1, width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  messageButton: { flex: 1, height: 44, borderRadius: 22, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  messageText: { fontWeight: '800', fontSize: 15 },
  tabRow: { flexDirection: 'row', marginTop: 20, width: '100%', borderBottomWidth: 1 },
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
  cover: { position: 'absolute', top: 0, left: 0, right: 0, height: 285, overflow: 'hidden' },
  avatarRing: { padding: 3, borderRadius: 60 },
  floatingBig: {
    position: 'absolute',
    top: 75,
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
