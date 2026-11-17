import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchAdEngagement, type AdEng } from '@/lib/adEngagement';
import { View, StyleSheet, RefreshControl, ActivityIndicator, TouchableOpacity, ScrollView, Animated, Alert } from 'react-native';
import Text from '@/components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import { usePreferences } from '@/lib/PreferencesContext';
import { canPerform, permissionDeniedMessage } from '@/lib/permissions';
import { notifyOnce, createQuoteRepost, applyCounts, fetchMyFlags, MyPostFlags, coownersEmbed, noteCoownersError } from '@/lib/postActions';
import AdCard from '@/components/AdCard';
import PostCard from '@/components/PostCard';
import ReelPreviewThumb from '@/components/ReelPreviewThumb';
import MomentsRow from '@/components/MomentsRow';
import { spacing } from '@/lib/theme';
import AppTopBar, { TOP_BAR_HEIGHT } from '@/components/AppTopBar';
import StatusBarScrim from '@/components/StatusBarScrim';
import { FeedSkeleton } from '@/components/Skeleton';
import { subscribePostBus } from '@/lib/postBus';
import { updateVisibleAds, clearVisibleAds } from '@/lib/adTracking';
import { useOnline } from '@/lib/useOnline';
import { saveFeedCache, loadFeedCache } from '@/lib/feedCache';
import { OfflinePage, OfflineBanner } from '@/components/OfflineState';
import { useHideTabBarOnScroll, useTabBarVisibility, HIDE_DISTANCE } from '@/lib/tab-bar-visibility';

const AnimatedFlatList = Animated.createAnimatedComponent(require('react-native').FlatList);
const PAGE_SIZE = 10;

export default function HomeScreen() {
  const { session } = useAuth();
  const { colors } = useTheme();
  const { showReposts, feedInterest } = usePreferences();
  // Cached across loadInitial -> loadMore within one session so "Following"
  // pagination doesn't refetch the follow list on every page.
  const followingIdsRef = useRef<string[] | null>(null);
  // "For You" is ranked on the server (SQL function feed_ranked). If that
  // function is not installed yet, or returns nothing, the feed quietly falls
  // back to the old newest-first list.
  const rankedRef = useRef(false);
  const rankedOkRef = useRef<boolean | null>(null);
  const loadedIdsRef = useRef<string[]>([]);
  // Posts that appeared on screen, saved in small batches so the ranking can
  // push already-seen posts down (table post_views).
  const seenRef = useRef<Set<string>>(new Set());
  const seenOffRef = useRef(false);
  // Changes on every refresh so the ranked order is mixed a little each time.
  const seedRef = useRef(Math.random().toString(36).slice(2, 8));
  const flushRef = useRef<(() => Promise<void>) | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [previewReels, setPreviewReels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // The feed could not be loaded (no signal / slow server). Older posts stored
  // on the phone are shown when there are any, otherwise a clear offline page.
  const [loadFailed, setLoadFailed] = useState(false);
  const online = useOnline();
  const feedMode = feedInterest === 'following' ? 'following' : 'foryou';
  const netErrRef = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const onScroll = useHideTabBarOnScroll();
  const [activeVideoKey, setActiveVideoKey] = useState<string | null>(null);
  // Videos must stop the moment you leave this tab (or open a post/profile
  // on top of it) and pick up again when you come back.
  const [tabFocused, setTabFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setTabFocused(true);
      return () => {
        setTabFocused(false);
        clearVisibleAds();
        flushRef.current?.();
      };
    }, [])
  );

  // Sponsored posts — same `ads` table the webapp uses. One ad after every
  // 4th post, cycling through the active ones (same rhythm as the webapp).
  const [ads, setAds] = useState<any[]>([]);
  const adsLoadedAt = useRef(0);
  const adsSig = useRef('');
  const [adEng, setAdEng] = useState<Record<string, AdEng>>({});
  // Reloads the ads, at most once every 2 minutes. The list is only replaced
  // when something really changed, so the feed never jumps or flickers.
  const loadAds = useCallback(async (force?: boolean) => {
    if (!force && Date.now() - adsLoadedAt.current < 2 * 60 * 1000) return;
    adsLoadedAt.current = Date.now();
    const { data, error } = await supabase
      .from('ads')
      .select('*')
      .eq('active', true)
      .eq('type', 'post')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error || !data) return;
    // Likes / comment counts refresh on every load, even if the ads didn't change.
    fetchAdEngagement(data.map((a: any) => a.id)).then((m) => { if (Object.keys(m).length) setAdEng(m); });
    const sig = JSON.stringify(data.map((a: any) => [a.id, a.image_url, a.content, a.link_url, a.cta_text, a.advertiser_name, a.advertiser_avatar_url]));
    if (sig === adsSig.current) return;
    adsSig.current = sig;
    setAds(data);
  }, []);
  // When the feed comes back into view, and every 10 minutes while it is open.
  useFocusEffect(
    useCallback(() => {
      loadAds();
      const t = setInterval(() => loadAds(true), 10 * 60 * 1000);
      return () => clearInterval(t);
    }, [loadAds])
  );
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    const firstVideo = viewableItems.find((v: any) => v.item?.video_url);
    setActiveVideoKey(firstVideo ? firstVideo.item.feedKey || firstVideo.item.id : null);
    updateVisibleAds(viewableItems.filter((v: any) => v.item?.__ad && v.item.ad?.id).map((v: any) => String(v.item.ad.id)));
    viewableItems.forEach((v: any) => {
      const it = v.item;
      if (it && !it.__ad && !it.pending && it.id) seenRef.current.add(String(it.id));
    });
    if (seenRef.current.size >= 15) flushRef.current?.();
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const { clamped } = useTabBarVisibility();
  const fabTranslate = clamped.interpolate({ inputRange: [0, HIDE_DISTANCE], outputRange: [0, 100] });

  // A "two children with the same key" warning means two entries in
  // `posts` ended up with an identical feedKey — likely a post the
  // pagination cursor re-returned on a later page (possible whenever two
  // posts share the same created_at down to the stored precision, which
  // isn't rare with bulk-inserted or fast-succession posts). Applied
  // wherever posts actually get set, rather than chasing the exact
  // upstream cause, since this guarantees the symptom can't recur
  // regardless of which path produced the duplicate.
  const dedupeByFeedKey = (items: any[]) => {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const item of items) {
      const key = item.feedKey || item.id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  };

  const feedData = useMemo(() => {
    if (!ads.length) return posts;
    const out: any[] = [];
    posts.forEach((post, i) => {
      out.push(post);
      if ((i + 1) % 4 === 0) {
        const ad = ads[Math.floor(i / 4) % ads.length];
        out.push({ __ad: true, ad, feedKey: `ad-${Math.floor(i / 4)}-${ad.id}` });
      }
    });
    return out;
  }, [posts, ads]);

  const decoratePosts = (data: any[], flags: MyPostFlags) =>
    data.map((p: any) => ({
      ...p,
      feedKey: p.id,
      ...applyCounts(p, flags),
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
  const decorateReposts = (data: any[], flags: MyPostFlags) =>
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
          ...applyCounts(p, flags),
          isRepost: true,
          reposter: r.user,
          quoteContent: r.content,
          sortTime: r.created_at,
        };
      });

  // Posts and reposts are two separate tables merged into one timeline, so
  // "the next page" can't just be "posts older than the last post" (that's
  // what silently dropped every repost after page 1). Instead each page is
  // cut off at one shared time — the later of the two sources' oldest rows,
  // counting only a source that still has more to give — and the next page
  // asks BOTH tables for everything older than that exact moment. That keeps
  // the merged list in true time order with nothing skipped.
  const cursorRef = useRef<string | null>(null);
  const POST_BASE = '*,author:profiles(id,display_name,username,avatar_url,verified,is_authentic,verified_plan,who_can_repost,who_can_comment),likes(count),reposts(count),comments(count)';
  const postSelect = () => POST_BASE + coownersEmbed();

  const fetchPage = async (cursor: string | null, followingIds: string[] | null) => {
    // Only the first post of a thread (thread_order 0, or not a thread at
    // all) belongs in the feed — the rest show on that post's own page.
    let postsQuery = supabase
      .from('posts')
      .select(postSelect())
      .or('thread_order.is.null,thread_order.eq.0')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (cursor) postsQuery = postsQuery.lt('created_at', cursor);
    if (followingIds) postsQuery = postsQuery.in('user_id', followingIds);

    let repostsQuery: any = null;
    if (showReposts) {
      // "Following" repost semantics: reposts made BY someone you follow
      // (the original post's author doesn't have to be someone you follow
      // too) — that's the standard meaning of "X you follow reposted this".
      repostsQuery = supabase
        .from('reposts')
        .select(`id,created_at,content,user:profiles(id,display_name,username,avatar_url,verified,is_authentic,verified_plan),post:posts(${postSelect()})`)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);
      if (cursor) repostsQuery = repostsQuery.lt('created_at', cursor);
      if (followingIds) repostsQuery = repostsQuery.in('user_id', followingIds);
    }

    const [postsRes, repostsRes] = await Promise.all([postsQuery, repostsQuery ?? Promise.resolve({ data: [], error: null })]);
    // First time the co-owners table is missing: turn that part off and retry.
    if (noteCoownersError(postsRes.error) || noteCoownersError(repostsRes.error)) return fetchPage(cursor, followingIds);
    if (postsRes.error || !postsRes.data) {
      console.warn('[Feed] posts query failed:', JSON.stringify(postsRes.error));
      return null;
    }
    const postRows: any[] = postsRes.data;
    const repostRows: any[] = repostsRes.data || [];

    const postsMore = postRows.length === PAGE_SIZE;
    const repostsMore = showReposts && repostRows.length === PAGE_SIZE;
    const ms = (iso: string) => new Date(iso).getTime();

    // Raw timestamp strings are kept for the cursor (not re-formatted from a
    // JS Date, which would round Postgres' microseconds to milliseconds).
    let floorIso: string | null = null;
    if (postsMore) floorIso = postRows[postRows.length - 1].created_at;
    if (repostsMore) {
      const r = repostRows[repostRows.length - 1].created_at;
      if (!floorIso || ms(r) > ms(floorIso)) floorIso = r;
    }

    const flags = await fetchMyFlags([...postRows.map((p) => p.id), ...repostRows.filter((r) => r.post).map((r) => r.post.id)], session?.user?.id);
    let items = [...decoratePosts(postRows, flags), ...decorateReposts(repostRows, flags)].sort((a, b) => ms(b.sortTime) - ms(a.sortTime));
    if (floorIso) items = items.filter((i) => ms(i.sortTime) >= ms(floorIso as string));

    return { items, cursor: floorIso, hasMore: postsMore || repostsMore };
  };

  // Sends the "seen" list to the server (one small request).
  const flushSeen = async () => {
    const uid = session?.user?.id;
    if (!uid || seenOffRef.current || seenRef.current.size === 0) return;
    const ids = Array.from(seenRef.current).slice(0, 100);
    ids.forEach((i) => seenRef.current.delete(i));
    const now = new Date().toISOString();
    const { error } = await supabase.from('post_views').upsert(ids.map((post_id) => ({ user_id: uid, post_id, seen_at: now })), { onConflict: 'user_id,post_id' });
    if (error) {
      // Table not created yet: stop trying.
      seenOffRef.current = true;
      console.log('[Feed] could not save seen posts:', error.message);
    }
  };
  flushRef.current = flushSeen;

  // One ranked page: the server returns an ordered list of ids, then the
  // posts themselves are loaded with the same fields as the normal feed.
  const fetchRanked = async (exclude: string[]): Promise<{ items: any[]; ids: string[]; hasMore: boolean } | null> => {
    const { data: rows, error } = await supabase.rpc('feed_ranked', { p_limit: PAGE_SIZE, p_exclude: exclude, p_reposts: showReposts, p_seed: seedRef.current });
    if (error) {
      console.log('[Feed] ranked feed not available:', error.message);
      netErrRef.current = /network|fetch|timeout|abort|connection/i.test(String(error.message || ''));
      return null;
    }
    netErrRef.current = false;
    const list: any[] = rows || [];
    if (list.length === 0) return { items: [], ids: [], hasMore: false };
    const postIds = list.filter((r) => r.kind === 'post').map((r) => String(r.post_id));
    const repostIds = list.filter((r) => r.kind === 'repost').map((r) => String(r.repost_id));
    const load = async (): Promise<any> => {
      const [postsRes, repostsRes] = await Promise.all([
        postIds.length ? supabase.from('posts').select(postSelect()).in('id', postIds) : Promise.resolve({ data: [], error: null }),
        repostIds.length
          ? supabase
              .from('reposts')
              .select(`id,created_at,content,user:profiles(id,display_name,username,avatar_url,verified,is_authentic,verified_plan),post:posts(${postSelect()})`)
              .in('id', repostIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (noteCoownersError(postsRes.error) || noteCoownersError(repostsRes.error)) return load();
      return { postsRes, repostsRes };
    };
    const { postsRes, repostsRes } = await load();
    if (postsRes.error || repostsRes.error) {
      console.log('[Feed] ranked posts query failed:', JSON.stringify(postsRes.error || repostsRes.error));
      return null;
    }
    const postRows: any[] = postsRes.data || [];
    const repostRows: any[] = repostsRes.data || [];
    const flags = await fetchMyFlags([...postRows.map((x) => x.id), ...repostRows.filter((r) => r.post).map((r) => r.post.id)], session?.user?.id);
    const byPost: Record<string, any> = {};
    decoratePosts(postRows, flags).forEach((it) => (byPost[String(it.id)] = it));
    const byRepost: Record<string, any> = {};
    repostRows.forEach((r, i) => {
      const it = decorateReposts([r], flags)[0];
      if (it) byRepost[String(r.id)] = it;
    });
    const items: any[] = [];
    list.forEach((r) => {
      const it = r.kind === 'repost' ? byRepost[String(r.repost_id)] : byPost[String(r.post_id)];
      if (it) items.push(it);
    });
    return { items, ids: list.map((r) => String(r.post_id)), hasMore: list.length >= PAGE_SIZE };
  };

  const loadInitial = useCallback(async () => {
    // "Following" only shows posts (and reposts) from people you follow —
    // resolved once per load and cached in followingIdsRef so loadMore
    // doesn't have to look it up again for every page.
    let followingIds: string[] | null = null;
    if (feedInterest === 'following') {
      if (!session?.user?.id) {
        setPosts([]);
        setHasMore(false);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      const { data: followRows, error: followErr } = await supabase.from('follows').select('following_id').eq('follower_id', session.user.id);
      if (followErr) {
        // Not "you follow nobody" — the list just could not be loaded.
        setLoadFailed(true);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      followingIds = (followRows || []).map((f: any) => f.following_id);
      followingIdsRef.current = followingIds;
      if (followingIds.length === 0) {
        // Following nobody yet — an empty result here isn't an error, it's
        // just genuinely nothing to show until they follow someone.
        setPosts([]);
        setHasMore(false);
        setLoading(false);
        setRefreshing(false);
        return;
      }
    } else {
      followingIdsRef.current = null;
      // For You: try the ranked feed first.
      if (rankedOkRef.current !== false) {
        await flushSeen().catch(() => {});
        seedRef.current = Math.random().toString(36).slice(2, 8);
        const ranked = await fetchRanked([]);
        if (ranked && ranked.items.length > 0) {
          rankedRef.current = true;
          loadedIdsRef.current = ranked.ids;
          setPosts((prev) => dedupeByFeedKey([...prev.filter((p) => p.pending), ...ranked.items]));
          setHasMore(ranked.hasMore);
          setLoadFailed(false);
          saveFeedCache(session?.user?.id, feedMode, ranked.items);
          setLoading(false);
          setRefreshing(false);
          return;
        }
        // Only a missing SQL function turns ranking off — not a dropped connection.
        if (!ranked && !netErrRef.current) rankedOkRef.current = false;
      }
    }
    rankedRef.current = false;

    const page = await fetchPage(null, followingIds);
    if (page) {
      setPosts((prev) => dedupeByFeedKey([...prev.filter((p) => p.pending), ...page.items]));
      setHasMore(page.hasMore);
      cursorRef.current = page.cursor;
      setLoadFailed(false);
      saveFeedCache(session?.user?.id, feedMode, page.items);
    } else {
      setLoadFailed(true);
    }
    setLoading(false);
    setRefreshing(false);
  }, [session, showReposts, feedInterest]);

  const loadMore = async () => {
    if (loadingMore || !hasMore || posts.length === 0) return;
    if (rankedRef.current) {
      setLoadingMore(true);
      const ranked = await fetchRanked(loadedIdsRef.current);
      if (ranked) {
        loadedIdsRef.current = [...loadedIdsRef.current, ...ranked.ids];
        setPosts((prev) => dedupeByFeedKey([...prev, ...ranked.items]));
        setHasMore(ranked.hasMore);
      } else {
        setHasMore(false);
      }
      setLoadingMore(false);
      return;
    }
    if (!cursorRef.current) return;
    setLoadingMore(true);
    const page = await fetchPage(cursorRef.current, followingIdsRef.current);
    if (page) {
      setPosts((prev) => dedupeByFeedKey([...prev, ...page.items]));
      setHasMore(page.hasMore);
      cursorRef.current = page.cursor;
    }
    setLoadingMore(false);
  };

  // A post you just made shows at the top at once (from the composer), is
  // swapped for the real one when the upload finishes, and removed if it fails.
  useEffect(() => {
    return subscribePostBus((e) => {
      if (e.type === 'add') {
        setPosts((prev) => dedupeByFeedKey([e.item, ...prev]));
      } else if (e.type === 'confirm') {
        loadedIdsRef.current = [...loadedIdsRef.current, String(e.patch.id)];
        setPosts((prev) => dedupeByFeedKey(prev.map((p) => (p.feedKey === e.tempId ? { ...p, ...e.patch, feedKey: e.patch.id, sortTime: e.patch.created_at, pending: false } : p))));
      } else {
        setPosts((prev) => prev.filter((p) => p.feedKey !== e.tempId));
      }
    });
  }, []);

  // Show the feed from the last visit at once (if the phone has one) while the
  // fresh posts load; fresh posts replace it as soon as they arrive.
  useEffect(() => {
    let alive = true;
    loadFeedCache(session?.user?.id, feedMode).then((cached) => {
      if (!alive || !cached) return;
      setPosts((prev) => (prev.length ? prev : cached));
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [session?.user?.id, feedMode]);

  // A slow connection must never mean a skeleton forever.
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => {
      setLoading(false);
      setLoadFailed(true);
    }, 12000);
    return () => clearTimeout(t);
  }, [loading]);

  // Back online: try again by itself.
  useEffect(() => {
    if (online && loadFailed) loadInitial();
  }, [online]);

  const retryLoad = () => {
    setLoadFailed(false);
    if (posts.length === 0) setLoading(true);
    else setRefreshing(true);
    setHasMore(true);
    loadInitial();
  };

  useEffect(() => {
    loadInitial();
    // Same ranking as the Reels tab (falls back to newest if it is not installed yet).
    (async () => {
      const PV = 'id,video_url,caption,author:profiles(display_name,avatar_url)';
      try {
        const { data: ranked, error } = await supabase.rpc('reels_ranked', { p_limit: 4, p_exclude: [], p_seed: Math.random().toString(36).slice(2, 8) });
        if (!error && ranked && ranked.length) {
          const ids = ranked.map((r: any) => String(r.reel_id));
          const { data } = await supabase.from('reels').select(PV).in('id', ids);
          const byId: Record<string, any> = {};
          (data || []).forEach((r: any) => (byId[String(r.id)] = r));
          const rows = ids.map((id: string) => byId[id]).filter(Boolean);
          if (rows.length) { setPreviewReels(rows); return; }
        }
      } catch {}
      const { data } = await supabase.from('reels').select(PV).order('created_at', { ascending: false }).limit(4);
      setPreviewReels(data || []);
    })();
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
    try {
      const { error } = post.liked_by_me
        ? await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', session.user.id)
        : await supabase.from('likes').insert({ post_id: post.id, user_id: session.user.id });
      // A repeated like ("duplicate") already is what the person wanted.
      if (error && !/duplicate/i.test(error.message)) throw error;
    } catch {
      // Not saved: put the heart and the count back as they were.
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, liked_by_me: post.liked_by_me, likes_count: post.likes_count } : p)));
    } finally {
      likeInFlight.current.delete(post.id);
    }
  };

  const quoteRepost = async (post: any, text: string) => {
    if (!session?.user?.id) return;
    const { error, entry } = await createQuoteRepost(post, text, session.user.id);
    if (error || !entry) {
      Alert.alert("Can't quote", error || 'Something went wrong.');
      throw new Error(error || 'quote failed');
    }
    setPosts((prev) => [entry, ...prev.map((p) => (p.id === post.id ? { ...p, reposted_by_me: true, reposts_count: (p.reposts_count || 0) + 1 } : p))]);
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
    setPosts((prev) =>
      // Undoing a repost also removes YOUR repost entries from the list,
      // not just the button state.
      (post.reposted_by_me ? prev.filter((p) => !(p.isRepost && p.reposter?.id === session.user.id && p.id === post.id)) : prev).map((p) =>
        p.id === post.id
          ? { ...p, reposted_by_me: !p.reposted_by_me, reposts_count: p.reposted_by_me ? p.reposts_count - 1 : p.reposts_count + 1 }
          : p
      )
    );
    try {
      const { error } = post.reposted_by_me
        ? await supabase.from('reposts').delete().eq('post_id', post.id).eq('user_id', session.user.id)
        : await supabase.from('reposts').insert({ post_id: post.id, user_id: session.user.id });
      if (error && !/duplicate/i.test(error.message)) throw error;
      if (!post.reposted_by_me) await notifyOnce({ userId: post.user_id, actorId: session.user.id, type: 'repost', postId: post.id });
    } catch {
      // Not saved: bring back the entry and the counts as they were.
      setPosts((prev) => {
        const restored = prev.map((p) => (p.id === post.id ? { ...p, reposted_by_me: post.reposted_by_me, reposts_count: post.reposts_count } : p));
        return post.reposted_by_me && !prev.some((p) => p.feedKey === post.feedKey) ? [post, ...restored] : restored;
      });
    } finally {
      repostInFlight.current.delete(post.id);
    }
  };

  const deletePost = (post: any) => {
    setPosts((prev) => prev.filter((p) => p.feedKey !== post.feedKey));
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: TOP_BAR_HEIGHT }}>
        <FeedSkeleton />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <AnimatedFlatList
        data={feedData}
        keyExtractor={(item: any) => item.feedKey || item.id}
        renderItem={({ item }: any) => item.__ad ? (
          <AdCard ad={item.ad} eng={adEng[item.ad.id]} active={tabFocused && item.feedKey === activeVideoKey} />
        ) : item.pending ? (
          // Still uploading: shown faded and not tappable until it is saved.
          <View style={{ opacity: 0.6 }} pointerEvents="none">
            <PostCard post={item} currentUserId={session?.user?.id} active={false} onLike={toggleLike} onRepost={toggleRepost} onQuote={quoteRepost} onDelete={deletePost} />
            <Text style={{ color: colors.subtext, fontSize: 12, fontWeight: '700', paddingHorizontal: spacing.lg, paddingBottom: 6 }}>Posting…</Text>
          </View>
        ) : (
          <PostCard
            post={item}
            currentUserId={session?.user?.id}
            active={tabFocused && (item.feedKey || item.id) === activeVideoKey}
            onLike={toggleLike}
            onRepost={toggleRepost}
            onQuote={quoteRepost}
            onDelete={deletePost}
          />
        )}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={7}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          loadFailed ? (
            <OfflinePage offline={!online} onRetry={retryLoad} />
          ) : (
            <Text style={[styles.empty, { color: colors.subtext }]}>
              {feedInterest === 'following' ? "No posts from people you follow yet — follow a few people to see them here." : 'No posts yet. Be the first!'}
            </Text>
          )
        }
        onScroll={onScroll}
        scrollEventThrottle={16}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} color={colors.primary} /> : null}
        contentContainerStyle={{ paddingBottom: 110, paddingTop: TOP_BAR_HEIGHT }}
        ListHeaderComponent={
          <>
          {loadFailed && posts.length > 0 ? <OfflineBanner offline={!online} onRetry={retryLoad} /> : null}
          <MomentsRow />
          {previewReels.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.reelsRow} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 10 }}>
              {previewReels.map((r) => (
                <ReelPreviewThumb key={r.id} reel={r} />
              ))}
              <TouchableOpacity style={[styles.viewMoreCard, { backgroundColor: colors.primary }]} onPress={() => router.push('/(tabs)/reels')}>
                <Ionicons name="chevron-forward-circle" size={30} color="#fff" />
                <Text style={styles.viewMoreText}>View More</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : null}
          </>
        }
      />
      <Animated.View style={[styles.fab, { transform: [{ translateY: fabTranslate }] }, { shadowColor: colors.primary }]}>
        <TouchableOpacity style={[styles.fabTouchable, { backgroundColor: colors.primary }]} onPress={() => router.push('/compose')}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      </Animated.View>
      <StatusBarScrim />
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
