import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Image, FlatList, TextInput, Keyboard, StyleSheet, TouchableOpacity, Animated, Easing, Alert, ActivityIndicator, Pressable, useWindowDimensions } from 'react-native';
import Text from '@/components/AppText';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import Avatar from '@/components/Avatar';
import { markSeenLocal, momentsChanged } from '@/lib/momentRings';
import { postTime as timeAgo } from '@/lib/timeAgo';
import { sendMomentReply } from '@/lib/momentReply';

// Full-screen moment viewer: bars at the top, tap right = next, tap left = back,
// hold = pause, swipe is not needed. Images show 6 seconds; videos play to the end.
const IMAGE_SECONDS = 6;

function VideoMoment({ url, onEnd, onReady, paused }: { url: string; onEnd: () => void; onReady: (seconds: number) => void; paused: boolean }) {
  const player = useVideoPlayer({ uri: url, useCaching: true } as any, (p) => {
    p.loop = false;
    p.play();
  });
  useEffect(() => {
    const a = player.addListener('playToEnd', onEnd);
    const b = player.addListener('statusChange', ({ status }: any) => {
      if (status === 'readyToPlay') onReady(Number(player.duration) || 10);
    });
    return () => {
      a.remove();
      b.remove();
    };
  }, [player, onEnd, onReady]);
  useEffect(() => {
    try {
      if (paused) player.pause();
      else player.play();
    } catch {}
  }, [paused, player]);
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />;
}

export default function MomentViewer() {
  const { uid, at } = useLocalSearchParams<{ uid: string; at?: string }>();
  const [expired, setExpired] = useState(false);
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const me = session?.user?.id;
  const [items, setItems] = useState<any[] | null>(null);
  const [owner, setOwner] = useState<any>(null);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [views, setViews] = useState<number | null>(null);
  const [likeCount, setLikeCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sheet, setSheet] = useState<any[] | null>(null); // owner's viewers list (null = closed)
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [kbH, setKbH] = useState(0);
  useEffect(() => {
    const a = Keyboard.addListener('keyboardDidShow', (e) => setKbH(e.endCoordinates?.height || 0));
    const b = Keyboard.addListener('keyboardDidHide', () => setKbH(0));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  const progress = useRef(new Animated.Value(0)).current;
  const anim = useRef<Animated.CompositeAnimation | null>(null);
  const seen = useRef(new Set<string>());

  const load = useCallback(async () => {
    setFailed(false);
    // No phone-clock filter here: the database already hides expired moments
    // using its own clock (a wrong phone clock used to hide fresh moments).
    let ms: any[] | null = null;
    let p: any = null;
    for (let attempt = 0; attempt < 3 && !(ms && ms.length); attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 900));
      const [a, b] = await Promise.all([
        supabase.from('moments').select('id,media_url,media_type,caption,created_at').eq('user_id', uid).order('created_at', { ascending: true }).limit(30),
        supabase.from('profiles').select('id,display_name,username,avatar_url,who_can_message').eq('id', uid).maybeSingle(),
      ]);
      ms = a.data as any[] | null;
      p = b.data;
    }
    setOwner(p);
    if (!ms || !ms.length) {
      setExpired(!!at);
      setFailed(true);
      return;
    }
    if (at) {
      const i = ms.findIndex((m) => m.id === at);
      if (i < 0) {
        setExpired(true);
        setFailed(true);
        return;
      }
      setIdx(i);
    }
    setItems(ms);
  }, [uid, at]);
  useEffect(() => {
    load();
  }, [load]);

  const cur = items?.[idx];
  const isMine = me && uid === me;

  const next = useCallback(() => {
    if (!items) return;
    if (idx + 1 >= items.length) router.back();
    else setIdx(idx + 1);
  }, [items, idx]);
  const prev = () => (idx > 0 ? setIdx(idx - 1) : progress.setValue(0));

  const runBar = useCallback(
    (seconds: number) => {
      anim.current?.stop();
      progress.setValue(0);
      anim.current = Animated.timing(progress, { toValue: 1, duration: seconds * 1000, easing: Easing.linear, useNativeDriver: false });
      anim.current.start(({ finished }) => {
        if (finished && cur?.media_type === 'image') next();
      });
    },
    [progress, cur, next]
  );

  // new item shown: start the bar (images now, videos when ready), count the view
  useEffect(() => {
    if (!cur) return;
    setViews(null);
    setLikeCount(0);
    setLiked(false);
    setReady(false);
    setSheet(null);
    if (cur.media_type === 'image') runBar(IMAGE_SECONDS);
    else {
      anim.current?.stop();
      progress.setValue(0);
    }
    if (me && !seen.current.has(cur.id)) {
      seen.current.add(cur.id);
      // the last moment is now on screen: calm the ring at once, don't wait for the network
      if (items && idx >= items.length - 1) markSeenLocal(String(uid), true);
      // plain insert: a "already watched" duplicate error (23505) is fine
      supabase.from('moment_views').insert({ moment_id: cur.id, viewer_id: me }).then(({ error }) => {
        if (error && error.code !== '23505') console.warn('[moment view]', error.message);
        // calm the ring on this phone right away once every moment of theirs was shown
        if (items && (idx >= items.length - 1 || items.every((m) => seen.current.has(m.id)))) markSeenLocal(String(uid), true);
      });
    }
    if (me && !isMine) {
      supabase.from('moment_likes').select('moment_id').eq('moment_id', cur.id).eq('user_id', me).maybeSingle().then(({ data }) => setLiked(!!data));
    }
    if (isMine) {
      supabase.from('moment_likes').select('user_id', { count: 'exact', head: true }).eq('moment_id', cur.id).then(({ count }) => setLikeCount(count ?? 0));
      supabase.from('moment_views').select('viewer_id', { count: 'exact', head: true }).eq('moment_id', cur.id).neq('viewer_id', me as string).then(({ count }) => setViews(count ?? 0));
    }
    return () => anim.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.id]);

  useEffect(() => {
    if (cur?.media_type !== 'image') return;
    if (paused) anim.current?.stop();
    else if (cur) {
      // resume from where the bar is
      const v = (progress as any).__getValue?.() ?? 0;
      anim.current = Animated.timing(progress, { toValue: 1, duration: Math.max(200, (1 - v) * IMAGE_SECONDS * 1000), easing: Easing.linear, useNativeDriver: false });
      anim.current.start(({ finished }) => finished && next());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  const toggleLike = async () => {
    if (!me || !cur) return;
    const was = liked;
    setLiked(!was);
    const { error } = was
      ? await supabase.from('moment_likes').delete().eq('moment_id', cur.id).eq('user_id', me)
      : await supabase.from('moment_likes').insert({ moment_id: cur.id, user_id: me });
    if (error && (error as any).code !== '23505') setLiked(was);
  };

  const sendReply = async () => {
    if (!me || !cur || sending || !replyText.trim()) return;
    setSending(true);
    const r = await sendMomentReply({ me, ownerId: String(uid), ownerWhoCanMessage: owner?.who_can_message, moment: cur, text: replyText });
    setSending(false);
    if (r.ok) {
      setReplyText('');
      Keyboard.dismiss();
      setPaused(false);
      setNote('Sent');
    } else setNote(r.message || "Couldn't send.");
    setTimeout(() => setNote(null), 2200);
  };

  const openViewers = async () => {
    if (!cur) return;
    setPaused(true);
    setSheet([]);
    const { data } = await supabase.rpc('moment_viewers', { p_moment: cur.id });
    setSheet(data || []);
  };
  const closeViewers = () => {
    setSheet(null);
    setPaused(false);
  };

  const remove = () => {
    if (!cur) return;
    Alert.alert('Delete this moment?', 'It will be removed for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('moments').delete().eq('id', cur.id);
          momentsChanged();
          router.back();
        },
      },
    ]);
  };

  if (failed) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center', gap: 14, padding: 30 }]}>
        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' }}>{expired ? 'This moment has expired.' : "This moment isn't available right now."}</Text>
        {!expired ? (
          <TouchableOpacity style={styles.retry} onPress={load}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>Try again</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontWeight: '700' }}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (!items || !cur) {
    return (
      <View style={styles.root}>
        <ActivityIndicator color="#fff" style={{ marginTop: 200 }} />
        <TouchableOpacity style={{ position: 'absolute', top: insets.top + 10, right: 14, padding: 8 }} onPress={() => router.back()}>
          <Ionicons name="close" size={26} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {cur.media_type === 'video' ? (
        <VideoMoment
          key={cur.id}
          url={cur.media_url}
          paused={paused}
          onEnd={next}
          onReady={(s) => {
            setReady(true);
            runBar(Math.min(Math.max(s, 1), 60));
          }}
        />
      ) : (
        <Image source={{ uri: cur.media_url }} style={StyleSheet.absoluteFill} resizeMode="contain" onLoad={() => setReady(true)} onError={() => setReady(true)} />
      )}
      {!ready ? <ActivityIndicator color="#fff" size="large" style={StyleSheet.absoluteFill} pointerEvents="none" /> : null}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <Pressable style={[styles.tapL]} onPress={() => (kbH ? Keyboard.dismiss() : prev())} onLongPress={() => setPaused(true)} onPressOut={() => paused && setPaused(false)} />
        <Pressable style={[styles.tapR]} onPress={() => (kbH ? Keyboard.dismiss() : next())} onLongPress={() => setPaused(true)} onPressOut={() => paused && setPaused(false)} />
      </View>

      <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.bars}>
          {items.map((m, i) => (
            <View key={m.id} style={styles.barBg}>
              <Animated.View
                style={[styles.barFill, { width: i < idx ? '100%' : i === idx ? progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) : '0%' }]}
              />
            </View>
          ))}
        </View>
        <View style={styles.head}>
          <TouchableOpacity style={styles.who} onPress={() => router.replace(`/user/${uid}`)}>
            <Avatar uri={owner?.avatar_url} size={34} />
            <View>
              <Text style={styles.name}>{owner?.display_name || owner?.username || ''}</Text>
              <Text style={styles.time}>{timeAgo(cur.created_at)}</Text>
            </View>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {isMine ? (
              <TouchableOpacity style={styles.iconBtn} onPress={remove}>
                <Ionicons name="trash-outline" size={22} color="#fff" />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
              <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={[styles.bottom, { paddingBottom: (kbH ? 10 : insets.bottom + 16), bottom: kbH }]} pointerEvents="box-none">
        {note ? <Text style={styles.note}>{note}</Text> : null}
        {cur.caption ? <Text style={styles.caption}>{cur.caption}</Text> : null}
        <View style={styles.actionRow}>
          {isMine ? (
            <TouchableOpacity style={styles.viewsRow} onPress={openViewers} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="eye-outline" size={18} color="#fff" />
              <Text style={styles.viewsTxt}>{views ?? 0} {views === 1 ? 'view' : 'views'}</Text>
              <Ionicons name="heart" size={16} color="#FF4D6D" style={{ marginLeft: 8 }} />
              <Text style={styles.viewsTxt}>{likeCount}</Text>
              <Ionicons name="chevron-up" size={16} color="#fff" />
            </TouchableOpacity>
          ) : (
            <View style={styles.replyBox}>
              <TextInput
                style={styles.replyInput}
                placeholder={`Reply to ${owner?.display_name || owner?.username || 'moment'}…`}
                placeholderTextColor="rgba(255,255,255,0.7)"
                value={replyText}
                onChangeText={setReplyText}
                onFocus={() => setPaused(true)}
                onBlur={() => !sending && setPaused(false)}
                maxLength={300}
                returnKeyType="send"
                onSubmitEditing={sendReply}
              />
              {replyText.trim() ? (
                <TouchableOpacity onPress={sendReply} disabled={sending} style={styles.sendBtn}>
                  {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={18} color="#fff" />}
                </TouchableOpacity>
              ) : null}
            </View>
          )}
          {!isMine && !replyText ? (
            <TouchableOpacity onPress={toggleLike} style={styles.heartBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name={liked ? 'heart' : 'heart-outline'} size={30} color={liked ? '#FF4D6D' : '#fff'} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {sheet ? (
        <View style={styles.sheetWrap} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFill} onPress={closeViewers} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 10 }]}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Viewers</Text>
              <TouchableOpacity onPress={closeViewers}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            {sheet.length === 0 ? (
              <Text style={styles.empty}>{views === 0 ? 'No views yet.' : 'Loading…'}</Text>
            ) : (
              <FlatList
                data={sheet}
                keyExtractor={(v) => v.user_id}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.vRow} onPress={() => router.replace(`/user/${item.user_id}`)}>
                    <Avatar uri={item.avatar_url} size={40} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.vName} numberOfLines={1}>{item.display_name || item.username}</Text>
                      <Text style={styles.vTime}>{timeAgo(item.viewed_at)}</Text>
                    </View>
                    {item.liked ? <Ionicons name="heart" size={20} color="#FF4D6D" /> : null}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  tapL: { position: 'absolute', left: 0, top: 110, bottom: 90, width: '35%' },
  tapR: { position: 'absolute', right: 0, top: 110, bottom: 90, width: '65%' },
  top: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: 10, backgroundColor: 'rgba(0,0,0,0.0)' },
  bars: { flexDirection: 'row', gap: 4 },
  barBg: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
  barFill: { height: 3, backgroundColor: '#fff' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { color: '#fff', fontWeight: '800', fontSize: 15 },
  time: { color: 'rgba(255,255,255,0.75)', fontSize: 12 },
  iconBtn: { padding: 6 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, gap: 10, backgroundColor: 'rgba(0,0,0,0.0)' },
  caption: { color: '#fff', fontSize: 16, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 6 },
  viewsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heartBtn: { padding: 6, marginLeft: 6 },
  replyBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)', paddingLeft: 16, paddingRight: 6 },
  replyInput: { flex: 1, color: '#fff', fontSize: 15, paddingVertical: 10 },
  sendBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#1DA1F2', alignItems: 'center', justifyContent: 'center' },
  note: { color: '#fff', alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, overflow: 'hidden', fontWeight: '700', fontSize: 13 },
  retry: { backgroundColor: '#1DA1F2', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 26 },
  sheetWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { maxHeight: '60%', backgroundColor: '#1b1b1b', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 14, paddingHorizontal: 16 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  empty: { color: 'rgba(255,255,255,0.7)', textAlign: 'center', paddingVertical: 30 },
  vRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  vName: { color: '#fff', fontWeight: '700', fontSize: 15 },
  vTime: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  viewsTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
