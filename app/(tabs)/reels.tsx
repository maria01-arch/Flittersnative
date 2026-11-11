import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, FlatList, ActivityIndicator, StyleSheet, LayoutChangeEvent, Dimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { takePendingReel, onReelOpenRequest } from '@/lib/reelOpen';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import ReelItem from '@/components/ReelItem';
import ReelAdItem from '@/components/ReelAdItem';
import StatusBarScrim from '@/components/StatusBarScrim';
import { ReelSkeleton } from '@/components/Skeleton';
import { usePreferences } from '@/lib/PreferencesContext';
import { Alert } from 'react-native';
import { notifyOnce, fetchMyFlags } from '@/lib/postActions';
import { canPerform, permissionDeniedMessage } from '@/lib/permissions';

const { height: SCREEN_H } = Dimensions.get('window');

export default function ReelsScreen() {
  const { session } = useAuth();
  // A tap on a reel preview card (feed) asks for that exact reel to be put first (lib/reelOpen.ts).
  const listRef = useRef<FlatList<any>>(null);
  const openedRef = useRef(''); // reel id waiting to be put first
  const { dataSaverMode } = usePreferences();
  // Data saver (default on): only the active reel plus one neighbor each
  // side ever has a real video source. Off: widens to two neighbors each
  // side for a snappier feel on fast swiping — still bounded, not "load
  // everything the list has rendered", which is the bug that was fixed
  // last round.
  const preloadRadius = dataSaverMode ? 1 : 2;
  const [reels, setReels] = useState<any[]>([]);
  // Sponsored videos: one after every 5th reel, cycling through the active ones.
  const [reelAds, setReelAds] = useState<any[]>([]);
  const adsSig = useRef('');
  const loadReelAds = async () => {
    try {
      const { data, error } = await supabase.from('ads').select('*').eq('active', true).eq('type', 'reel').order('created_at', { ascending: false }).limit(20);
      if (error || !data || !mounted.current) return;
      const usable = data.filter((a: any) => !!a.video_url);
      const sig = JSON.stringify(usable.map((a: any) => [a.id, a.video_url, a.content, a.link_url, a.cta_text, a.advertiser_name, a.advertiser_avatar_url]));
      if (sig === adsSig.current) return;
      adsSig.current = sig;
      setReelAds(usable);
    } catch {}
  };
  const listData = useMemo(() => {
    if (!reelAds.length) return reels;
    const out: any[] = [];
    reels.forEach((r, i) => {
      out.push(r);
      if ((i + 1) % 5 === 0) {
        const ad = reelAds[Math.floor(i / 5) % reelAds.length];
        out.push({ __ad: true, ad, id: `ad-${i}-${ad.id}` });
      }
    });
    return out;
  }, [reels, reelAds]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [tabFocused, setTabFocused] = useState(false);
  const mounted = useRef(true);
  // Measured from the actual container, not Dimensions.get('window') — with
  // edge-to-edge enabled, the window dimension doesn't reliably match what
  // this View is actually laid out at, and that mismatch is exactly what
  // was making reels appear letterboxed/misaligned: FlatList was paging by
  // a height the video wasn't actually filling.
  const [pageHeight, setPageHeight] = useState(0);

  const onLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && h !== pageHeight) setPageHeight(h);
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const openNow = async () => {
    const id = takePendingReel();
    if (!id) return;
    if (reelCountRef.current === 0) {
      openedRef.current = id; // the first load will put it first
      return;
    }
    const one = await fetchOpened(id);
    if (!one || !mounted.current) return;
    setReels((prev) => [one, ...prev.filter((r) => String(r.id) !== id)]);
    loadedIdsRef.current = [id, ...loadedIdsRef.current.filter((x) => x !== id)];
    setActiveIndex(0);
    requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: false }));
    setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: false }), 250);
  };
  const openNowRef = useRef(openNow);
  openNowRef.current = openNow;
  useEffect(() => {
    openNowRef.current(); // a tap made before this tab was first opened
    return onReelOpenRequest(() => openNowRef.current());
  }, []);

  useFocusEffect(
    useCallback(() => {
      setTabFocused(true);
      openNowRef.current();
      // A ranked list is kept while you switch tabs (so it does not reshuffle
      // under you) and refreshed after 10 minutes. The newest-first fallback
      // reloads each time, as before.
      const stale = Date.now() - loadedAtRef.current > 3 * 60 * 1000;
      if (reelCountRef.current === 0 || rankedOkRef.current !== true || stale) load('first');
      loadReelAds();
      return () => {
        setTabFocused(false);
        flushRef.current().catch(() => {});
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const REEL_SELECT = '*,author:profiles(id,display_name,username,avatar_url,verified,is_authentic,verified_plan),reel_likes(count),comments(count)';
  const PAGE = 20;

  // "For You" order comes from the database (reels_ranked). If that function
  // is not installed yet, the tab falls back to newest first.
  const rankedOkRef = useRef<boolean | null>(null);
  const seedRef = useRef(Math.random().toString(36).slice(2, 8));
  const loadedIdsRef = useRef<string[]>([]);
  const loadedAtRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(true);
  const reelCountRef = useRef(0);
  const seenRef = useRef<Set<string>>(new Set());
  const seenOffRef = useRef(false);
  reelCountRef.current = reels.length;

  // Reels that were on screen for a moment, saved in small batches so they
  // sink in the next ranking (table reel_views).
  const flushSeen = async () => {
    const uid = session?.user?.id;
    if (!uid || seenOffRef.current || seenRef.current.size === 0) return;
    const ids = Array.from(seenRef.current).slice(0, 100);
    ids.forEach((i) => seenRef.current.delete(i));
    const now = new Date().toISOString();
    const { error } = await supabase.from('reel_views').upsert(ids.map((reel_id) => ({ user_id: uid, reel_id, seen_at: now })), { onConflict: 'user_id,reel_id' });
    if (error) seenOffRef.current = true;
  };
  const flushRef = useRef(flushSeen);
  flushRef.current = flushSeen;

  const decorateReels = async (data: any[]) => {
    // Counts come from the database as single numbers; one small query
    // finds which of these reels I've liked (instead of downloading every
    // like on every reel).
    const likedByMe = new Set<string>();
    if (session?.user?.id && data?.length) {
      const { data: mine } = await supabase
        .from('reel_likes')
        .select('reel_id')
        .eq('user_id', session.user.id)
        .in('reel_id', data.map((r: any) => r.id));
      (mine || []).forEach((l: any) => likedByMe.add(l.reel_id));
    }
    if (!mounted.current) return [] as any[];
    const countOf = (rel: any) => (Array.isArray(rel) ? Number(rel[0]?.count) || 0 : 0);
    // A video posted to the feed is ALSO a reel. Find that post (same person,
    // same video) so likes, comments and reposts done on either one show on both.
    const postByKey: Record<string, any> = {};
    const urls = [...new Set((data || []).map((r: any) => r.video_url).filter(Boolean))];
    let flags: { liked: Set<string>; reposted: Set<string> } = { liked: new Set(), reposted: new Set() };
    if (urls.length) {
      const { data: posts } = await supabase.from('posts').select('id,user_id,video_url,likes(count),reposts(count),comments(count)').in('video_url', urls);
      (posts || []).forEach((p: any) => {
        const k = `${p.user_id}|${p.video_url}`;
        if (!postByKey[k]) postByKey[k] = p;
      });
      const ids = Object.values(postByKey).map((p: any) => p.id);
      if (ids.length) flags = await fetchMyFlags(ids, session?.user?.id);
    }
    if (!mounted.current) return [] as any[];
    return (data || []).map((r: any) => {
        const p = postByKey[`${r.user_id}|${r.video_url}`];
        const reelLiked = likedByMe.has(r.id);
        const postLiked = !!p && flags.liked.has(p.id);
        return {
          ...r,
          post_id: p?.id || null,
          reel_liked: reelLiked,
          likes_count: countOf(r.reel_likes) + (p ? countOf(p.likes) : 0),
          liked_by_me: reelLiked || postLiked,
          comments_count: countOf(r.comments) + (p ? countOf(p.comments) : 0),
          reposts_count: p ? countOf(p.reposts) : 0,
          reposted_by_me: !!p && flags.reposted.has(p.id),
        };
      })
    ;
  };

  const fetchOpened = async (id: string) => {
    const { data } = await supabase.from('reels').select(REEL_SELECT).eq('id', id).maybeSingle();
    if (!data) return null;
    const [one] = await decorateReels([data]);
    return one || null;
  };
  // mode 'first': a fresh ranked list. mode 'more': the next page, skipping what is already loaded.
  const load = async (mode: 'first' | 'more' = 'first') => {
    let rows: any[] | null = null;
    let usedRanked = false;
    if (rankedOkRef.current !== false) {
      if (mode === 'first') {
        await flushRef.current().catch(() => {});
        seedRef.current = Math.random().toString(36).slice(2, 8);
      }
      const { data: ranked, error } = await supabase.rpc('reels_ranked', {
        p_limit: PAGE,
        p_exclude: mode === 'more' ? loadedIdsRef.current : [],
        p_seed: seedRef.current,
      });
      if (error) {
        // Only a missing function turns ranking off — not a dropped connection.
        if (!/network|fetch|timeout|abort|connection/i.test(String(error.message || ''))) rankedOkRef.current = false;
      } else if (ranked && ranked.length) {
        const ids = ranked.map((r: any) => String(r.reel_id));
        const { data } = await supabase.from('reels').select(REEL_SELECT).in('id', ids);
        const byId: Record<string, any> = {};
        (data || []).forEach((r: any) => (byId[String(r.id)] = r));
        rows = ids.map((id: string) => byId[id]).filter(Boolean);
        usedRanked = true;
        rankedOkRef.current = true;
        hasMoreRef.current = ranked.length >= PAGE;
      } else if (mode === 'more') {
        hasMoreRef.current = false;
        return;
      }
    }
    if (!rows) {
      if (mode === 'more') return;
      const { data } = await supabase.from('reels').select(REEL_SELECT).order('created_at', { ascending: false }).limit(30);
      rows = data || [];
      hasMoreRef.current = false;
    }
    if (!mounted.current) return;
    let decorated = await decorateReels(rows);
    if (!mounted.current) return;
    loadedAtRef.current = Date.now();
    if (mode === 'first') {
      const want = openedRef.current && !decorated.some((r: any) => String(r.id) === openedRef.current) ? await fetchOpened(openedRef.current) : null;
      if (want) decorated = [want, ...decorated];
      else if (openedRef.current) decorated = [...decorated.filter((r: any) => String(r.id) === openedRef.current), ...decorated.filter((r: any) => String(r.id) !== openedRef.current)];
      openedRef.current = '';
    }
    if (mode === 'more') {
      loadedIdsRef.current = [...loadedIdsRef.current, ...decorated.map((r: any) => String(r.id))];
      setReels((prev) => {
        const have = new Set(prev.map((r) => String(r.id)));
        return [...prev, ...decorated.filter((r: any) => !have.has(String(r.id)))];
      });
    } else {
      loadedIdsRef.current = decorated.map((r: any) => String(r.id));
      setReels(decorated);
    }
    void usedRanked;
    setLoading(false);
  };

  // A reel that stays on screen for a moment counts as watched.
  useEffect(() => {
    if (!tabFocused) return;
    const it = listData[activeIndex];
    if (!it || it.__ad || !it.id) return;
    const t = setTimeout(() => {
      seenRef.current.add(String(it.id));
      if (seenRef.current.size >= 8) flushRef.current().catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [activeIndex, tabFocused, listData]);

  const loadMoreReels = async () => {
    if (loadingMoreRef.current || !hasMoreRef.current || !rankedOkRef.current) return;
    loadingMoreRef.current = true;
    try {
      await load('more');
    } finally {
      loadingMoreRef.current = false;
    }
  };

  const toggleLike = async (reel: any) => {
    const me = session?.user?.id;
    if (!me) return;
    const wasLiked = !!reel.liked_by_me;
    setReels((prev) =>
      prev.map((r) =>
        r.id === reel.id ? { ...r, liked_by_me: !wasLiked, likes_count: Math.max(0, (r.likes_count || 0) + (wasLiked ? -1 : 1)) } : r
      )
    );
    if (wasLiked) {
      // Remove the like wherever it was left (the reel and/or its post).
      await supabase.from('reel_likes').delete().eq('reel_id', reel.id).eq('user_id', me);
      if (reel.post_id) await supabase.from('likes').delete().eq('post_id', reel.post_id).eq('user_id', me);
    } else if (reel.post_id) {
      // A video post's likes live on the post, so they show in the feed too.
      await supabase.from('likes').insert({ post_id: reel.post_id, user_id: me });
      await notifyOnce({ userId: reel.user_id, actorId: me, type: 'like', postId: reel.post_id });
    } else {
      await supabase.from('reel_likes').insert({ reel_id: reel.id, user_id: me });
    }
  };

  const toggleRepost = async (reel: any) => {
    const me = session?.user?.id;
    if (!me || !reel.post_id) return;
    const was = !!reel.reposted_by_me;
    if (!was) {
      const { data: author } = await supabase.from('profiles').select('who_can_repost').eq('id', reel.user_id).maybeSingle();
      const allowed = await canPerform(author?.who_can_repost, reel.user_id, me);
      if (!allowed) {
        Alert.alert("Can't repost", permissionDeniedMessage('who can repost their posts', author?.who_can_repost));
        return;
      }
    }
    setReels((prev) => prev.map((r) => (r.id === reel.id ? { ...r, reposted_by_me: !was, reposts_count: Math.max(0, (r.reposts_count || 0) + (was ? -1 : 1)) } : r)));
    if (was) {
      await supabase.from('reposts').delete().eq('post_id', reel.post_id).eq('user_id', me);
    } else {
      await supabase.from('reposts').insert({ post_id: reel.post_id, user_id: me });
      await notifyOnce({ userId: reel.user_id, actorId: me, type: 'repost', postId: reel.post_id });
    }
  };

  const deleteReel = (reel: any) => {
    Alert.alert('Delete reel', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setReels((prev) => prev.filter((r) => r.id !== reel.id));
          await supabase.from('reels').delete().eq('id', reel.id).eq('user_id', session?.user?.id);
        },
      },
    ]);
  };

  const bumpCommentCount = (reel: any) => {
    setReels((prev) => prev.map((r) => (r.id === reel.id ? { ...r, comments_count: (r.comments_count || 0) + 1 } : r)));
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (!mounted.current) return;
    if (viewableItems.length > 0) setActiveIndex(viewableItems[0].index ?? 0);
  }).current;

  if (loading) {
    return <ReelSkeleton height={pageHeight || SCREEN_H} />;
  }

  return (
    <View style={styles.container} onLayout={onLayout}>
      <StatusBarScrim />
      {pageHeight > 0 && (
        <FlatList
          ref={listRef}
          // Toggling Data Saver changes preloadRadius, but a ReelItem
          // already on screen was built with whatever shouldLoad value it
          // had at mount time — expo-video's player doesn't reliably react
          // to its source argument changing after the fact, so without
          // forcing a remount here, flipping the setting would silently do
          // nothing for anything already rendered (exactly the "no
          // difference" symptom). This key forces every item to be
          // recreated fresh the moment the setting changes, so it's
          // actually guaranteed to take effect rather than depending on
          // video-player internals.
          key={dataSaverMode ? 'saver-on' : 'saver-off'}
          data={listData}
          keyExtractor={(item) => item.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={pageHeight}
          snapToAlignment="start"
          decelerationRate="fast"
          // Without this, a strong fast swipe can carry enough momentum to
          // sail past 2-3 snap points before the list settles — this locks
          // scrolling to exactly one page per gesture, however hard you flick.
          disableIntervalMomentum
          // Matches the measured height exactly, so FlatList's paging math
          // and each item's actual rendered size never disagree.
          getItemLayout={(_, index) => ({ length: pageHeight, offset: pageHeight * index, index })}
          // Defaults render roughly 10 screens' worth of items — for a
          // feed of full-screen videos, that alone meant up to 10 videos
          // existed (and, before the fix in ReelItem, were downloading)
          // at once. This keeps only the active item plus one on each
          // side actually mounted.
          initialNumToRender={preloadRadius * 2 + 1}
          maxToRenderPerBatch={preloadRadius * 2 + 1}
          windowSize={preloadRadius * 2 + 1}
          renderItem={({ item, index }) => item.__ad ? (
            <ReelAdItem ad={item.ad} height={pageHeight} active={tabFocused && index === activeIndex} shouldLoad={Math.abs(index - activeIndex) <= preloadRadius} />
          ) : (
            <ReelItem
              reel={item}
              height={pageHeight}
              active={tabFocused && index === activeIndex}
              shouldLoad={Math.abs(index - activeIndex) <= preloadRadius}
              isMine={item.user_id === session?.user?.id}
              onLike={toggleLike}
              onRepost={toggleRepost}
              onDelete={deleteReel}
              onCommentPosted={bumpCommentCount}
            />
          )}
          onViewableItemsChanged={onViewableItemsChanged}
          onEndReached={loadMoreReels}
          onEndReachedThreshold={2}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
});
