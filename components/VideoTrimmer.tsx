import { useEffect, useRef, useState } from 'react';
import { Modal, View, TouchableOpacity, StyleSheet, PanResponder, Image, ActivityIndicator, StatusBar } from 'react-native';
import Text from '@/components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';
import { isTrimAvailable, trimVideoFile } from '@/modules/flitters-trim';

// Full-screen video trimmer. Shows the video looping inside the chosen part,
// with a strip of pictures and two handles to set where it starts and ends.
// "Trim & use" cuts a new, shorter file (no re-encoding, so it is quick).
//
// maxSeconds is the longest piece allowed (the person's upload limit).
const MIN_LEN = 1;
const HANDLE_W = 22;
const THUMBS = 8;

export default function VideoTrimmer({
  visible,
  uri,
  durationSeconds,
  maxSeconds,
  onCancel,
  onDone,
}: {
  visible: boolean;
  uri: string | null;
  durationSeconds?: number | null;
  maxSeconds: number;
  onCancel: () => void;
  onDone: (newUri: string, durationSeconds: number) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [dur, setDur] = useState(Math.max(MIN_LEN, durationSeconds || 0));
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(Math.min(Math.max(MIN_LEN, durationSeconds || MIN_LEN), maxSeconds));
  const [trackW, setTrackW] = useState(1);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(true);

  const startRef = useRef(0);
  const endRef = useRef(end);
  const durRef = useRef(dur);
  const trackRef = useRef(1);
  const maxRef = useRef(maxSeconds);
  const grab = useRef(0);
  startRef.current = start;
  endRef.current = end;
  durRef.current = dur;
  trackRef.current = trackW;
  maxRef.current = maxSeconds;

  const player = useVideoPlayer(visible ? uri : null, (p) => {
    p.loop = false;
    p.muted = false;
    p.timeUpdateEventInterval = 0.08;
  });
  const playerRef = useRef<any>(player);
  playerRef.current = player;

  // Fresh start each time the trimmer opens.
  useEffect(() => {
    if (!visible) return;
    const d = Math.max(MIN_LEN, durationSeconds || 0);
    setDur(d);
    setStart(0);
    setEnd(Math.min(Math.max(MIN_LEN, d), maxSeconds));
    setThumbs([]);
    setError('');
    setBusy(false);
    setPlaying(true);
  }, [visible, uri]);

  // The picker's duration can be missing: learn it from the player.
  useEffect(() => {
    if (!visible) return;
    const sub = player.addListener('sourceLoad', (e: any) => {
      const d = e?.duration;
      if (d && d > 0) {
        setDur(d);
        if (!durationSeconds) setEnd(Math.min(d, maxRef.current));
      }
    });
    try {
      player.play();
    } catch {}
    return () => sub.remove();
  }, [player, visible]);

  // Loop inside the chosen part.
  useEffect(() => {
    if (!visible) return;
    const sub = player.addListener('timeUpdate', (e: any) => {
      const t = e?.currentTime ?? player.currentTime;
      if (t >= endRef.current - 0.05 || t < startRef.current - 0.4) {
        player.currentTime = startRef.current;
      }
    });
    return () => sub.remove();
  }, [player, visible]);

  // A row of little pictures along the timeline.
  useEffect(() => {
    if (!visible || !uri || dur <= 1) return;
    let cancelled = false;
    (async () => {
      const out: string[] = [];
      for (let i = 0; i < THUMBS; i++) {
        if (cancelled) return;
        try {
          const t = Math.min(dur - 0.1, ((i + 0.5) / THUMBS) * dur) * 1000;
          const r = await VideoThumbnails.getThumbnailAsync(uri, { time: Math.max(0, Math.round(t)), quality: 0.3 });
          out.push(r.uri);
        } catch {
          out.push('');
        }
        if (!cancelled) setThumbs([...out]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, uri, dur > 1]);

  const seek = (t: number) => {
    try {
      playerRef.current.currentTime = Math.max(0, t);
    } catch {}
  };

  const leftPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        grab.current = startRef.current;
        try {
          playerRef.current.pause();
        } catch {}
      },
      onPanResponderMove: (_e, g) => {
        const next = grab.current + (g.dx / trackRef.current) * durRef.current;
        const lo = Math.max(0, endRef.current - maxRef.current);
        const hi = endRef.current - MIN_LEN;
        const v = Math.min(hi, Math.max(lo, next));
        setStart(v);
        seek(v);
      },
      onPanResponderRelease: () => {
        seek(startRef.current);
        try {
          playerRef.current.play();
        } catch {}
        setPlaying(true);
      },
    })
  ).current;

  const rightPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        grab.current = endRef.current;
        try {
          playerRef.current.pause();
        } catch {}
      },
      onPanResponderMove: (_e, g) => {
        const next = grab.current + (g.dx / trackRef.current) * durRef.current;
        const lo = startRef.current + MIN_LEN;
        const hi = Math.min(durRef.current, startRef.current + maxRef.current);
        const v = Math.min(hi, Math.max(lo, next));
        setEnd(v);
        seek(Math.max(startRef.current, v - 0.2));
      },
      onPanResponderRelease: () => {
        seek(startRef.current);
        try {
          playerRef.current.play();
        } catch {}
        setPlaying(true);
      },
    })
  ).current;

  const toggle = () => {
    try {
      if (playing) player.pause();
      else player.play();
    } catch {}
    setPlaying(!playing);
  };

  const fmt = (n: number) => {
    const s = Math.max(0, n);
    const m = Math.floor(s / 60);
    const r = s - m * 60;
    return `${m}:${r.toFixed(1).padStart(4, '0')}`;
  };

  const length = end - start;
  const hasTrim = isTrimAvailable();
  const whole = start < 0.05 && end >= dur - 0.05;

  const confirm = async () => {
    if (!uri || busy) return;
    setError('');
    // Nothing to cut: the video already fits.
    if (whole && dur <= maxSeconds + 0.05) {
      onDone(uri, dur);
      return;
    }
    if (!hasTrim) {
      setError('Trimming works in the installed Flitters app (not Expo Go).');
      return;
    }
    setBusy(true);
    try {
      try {
        player.pause();
      } catch {}
      const r = await trimVideoFile(uri, start, end, maxSeconds);
      onDone(r.uri, Math.max(0.5, r.durationMs / 1000));
    } catch (e: any) {
      setError(e?.message ? `Couldn't trim: ${e.message}` : "Couldn't trim this video.");
      setBusy(false);
    }
  };

  const leftPx = (start / Math.max(dur, 0.1)) * trackW;
  const rightPx = (end / Math.max(dur, 0.1)) * trackW;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <StatusBar barStyle="light-content" />
        <View style={styles.top}>
          <TouchableOpacity onPress={onCancel} disabled={busy} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>Trim video</Text>
          <View style={{ width: 28 }} />
        </View>

        <TouchableOpacity activeOpacity={1} style={styles.videoWrap} onPress={toggle}>
          {uri ? <VideoView player={player} style={styles.video} nativeControls={false} contentFit="contain" /> : null}
          {!playing && (
            <View style={styles.playBadge} pointerEvents="none">
              <Ionicons name="play" size={34} color="#fff" />
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.bottom}>
          <Text style={styles.info}>
            {fmt(start)} → {fmt(end)}   ·   {length.toFixed(1)}s of max {Math.round(maxSeconds)}s
          </Text>

          <View style={styles.trackOuter} onLayout={(e) => setTrackW(Math.max(1, e.nativeEvent.layout.width - HANDLE_W * 2))}>
            <View style={[styles.track, { marginHorizontal: HANDLE_W }]}>
              <View style={styles.thumbRow}>
                {Array.from({ length: THUMBS }).map((_, i) => (
                  <View key={i} style={styles.thumbCell}>
                    {thumbs[i] ? <Image source={{ uri: thumbs[i] }} style={styles.thumbImg} /> : null}
                  </View>
                ))}
              </View>
              {/* darken what is cut away */}
              <View style={[styles.dim, { left: 0, width: leftPx }]} pointerEvents="none" />
              <View style={[styles.dim, { left: rightPx, right: 0 }]} pointerEvents="none" />
              <View style={[styles.frame, { left: leftPx, width: Math.max(2, rightPx - leftPx), borderColor: colors.primary }]} pointerEvents="none" />
            </View>
            <View {...leftPan.panHandlers} style={[styles.handle, { left: leftPx, backgroundColor: colors.primary }]}>
              <View style={styles.grip} />
            </View>
            <View {...rightPan.panHandlers} style={[styles.handle, { left: rightPx + HANDLE_W, backgroundColor: colors.primary }]}>
              <View style={styles.grip} />
            </View>
          </View>

          {!hasTrim && (
            <Text style={styles.note}>Trimming works in the installed Flitters app. Here you can preview only.</Text>
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, { backgroundColor: 'rgba(255,255,255,0.14)' }]} onPress={onCancel} disabled={busy}>
              <Text style={styles.btnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary, opacity: busy ? 0.7 : 1 }]} onPress={confirm} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{whole && dur <= maxSeconds + 0.05 ? 'Use video' : 'Trim & use'}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  title: { color: '#fff', fontSize: 17, fontWeight: '800' },
  videoWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  video: { width: '100%', height: '100%' },
  playBadge: { position: 'absolute', width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  bottom: { paddingHorizontal: 16, paddingTop: 12 },
  info: { color: '#fff', textAlign: 'center', fontWeight: '700', fontSize: 13, marginBottom: 12 },
  trackOuter: { height: 56, justifyContent: 'center' },
  track: { height: 56, borderRadius: 6, overflow: 'hidden', backgroundColor: '#1c1c1c' },
  thumbRow: { flexDirection: 'row', flex: 1 },
  thumbCell: { flex: 1, backgroundColor: '#262626' },
  thumbImg: { width: '100%', height: '100%' },
  dim: { position: 'absolute', top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.65)' },
  frame: { position: 'absolute', top: 0, bottom: 0, borderTopWidth: 3, borderBottomWidth: 3 },
  handle: { position: 'absolute', top: 0, width: HANDLE_W, height: 56, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  grip: { width: 3, height: 22, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.9)' },
  note: { color: 'rgba(255,255,255,0.7)', fontSize: 12, textAlign: 'center', marginTop: 10 },
  error: { color: '#ff8a8a', fontSize: 13, textAlign: 'center', marginTop: 10 },
  row: { flexDirection: 'row', gap: 12, marginTop: 16 },
  btn: { flex: 1, borderRadius: 26, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
