import { ReactNode, useEffect, useRef, useState } from 'react';
import { View, Animated, Pressable, StyleSheet, PanResponder, LayoutChangeEvent } from 'react-native';
import Text from '@/components/AppText';
import { useVideoPlayer, VideoView } from 'expo-video';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import GlassButton from './GlassButton';

// Flitters' own video player for an opened video post (replaces the system
// player's controls):
//  - tap: show / hide the controls
//  - double-tap the left side: back 5 s, right side: forward 5 s
//  - glass play/pause button and a seek bar you can tap or drag
//  - `side` = the glass action buttons drawn over the video (right edge)
// The video keeps playing while its box is resized (comments open).
const SKIP = 5;
const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r < 10 ? '0' : ''}${r}`;
};

export default function VideoPostPlayer({
  uri,
  height,
  bottomOverlay,
  topLeft,
  topRight,
  compact,
  topInset = 0,
  bottomInset = 0,
  topPad = 0,
}: {
  uri: string;
  height: Animated.Value | number;
  // Author, caption and the glass action row, drawn over the bottom of the
  // video (hidden when the box is small).
  bottomOverlay?: ReactNode;
  topInset?: number;
  bottomInset?: number;
  // Space kept above the picture (status bar) — can be animated.
  topPad?: Animated.AnimatedInterpolation<number> | Animated.Value | number;
  topLeft?: ReactNode;
  topRight?: ReactNode;
  // Small box (comments open): hides the bottom overlay.
  compact?: boolean;
}) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = false;
    p.timeUpdateEventInterval = 0.25;
    p.play();
  });
  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [scrub, setScrub] = useState<number | null>(null);
  const [rate, setRate] = useState(1);
  const [muted, setMuted] = useState(false);
  const cycleRate = () => {
    const order = [1, 1.25, 1.5, 2, 0.5];
    const next = order[(order.indexOf(rate) + 1) % order.length];
    try {
      player.playbackRate = next;
    } catch {}
    setRate(next);
    reveal();
  };
  const toggleMute = () => {
    const next = !muted;
    try {
      player.muted = next;
    } catch {}
    setMuted(next);
    reveal();
  };
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const hideTimer = useRef<any>(null);
  const trackW = useRef(1);
  const durRef = useRef(0);
  const playingRef = useRef(true);
  durRef.current = duration;
  playingRef.current = playing;

  useEffect(() => {
    const subs: any[] = [];
    try {
      subs.push(player.addListener('playingChange', (e: any) => setPlaying(!!(e?.isPlaying ?? player.playing))));
      subs.push(
        player.addListener('timeUpdate', (e: any) => {
          setTime(e?.currentTime ?? player.currentTime);
          const d = player.duration;
          if (d && d !== durRef.current) setDuration(d);
        })
      );
      subs.push(player.addListener('statusChange', () => player.duration && setDuration(player.duration)));
    } catch {}
    return () => {
      subs.forEach((s) => {
        try {
          s.remove();
        } catch {}
      });
      try {
        player.pause();
      } catch {}
    };
  }, [player]);

  const fade = (to: number) => Animated.timing(controlsOpacity, { toValue: to, duration: 180, useNativeDriver: true }).start();
  const armHide = () => {
    // The profile, caption and buttons now stay until you tap the video to
    // hide them (they used to fade away by themselves after a few seconds).
    clearTimeout(hideTimer.current);
  };
  useEffect(() => {
    if (showControls && playing) armHide();
    return () => clearTimeout(hideTimer.current);
  }, [showControls, playing]);

  const reveal = () => {
    setShowControls(true);
    fade(1);
  };

  const togglePlay = () => {
    try {
      if (player.playing) player.pause();
      else player.play();
    } catch {}
    reveal();
  };

  // ---- double tap = skip ----
  const lastTap = useRef<{ t: number; side: 'l' | 'r' | 'c' } | null>(null);
  const singleTimer = useRef<any>(null);
  const [flash, setFlash] = useState<{ side: 'l' | 'r'; n: number } | null>(null);
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const showFlash = (side: 'l' | 'r') => {
    setFlash((f) => ({ side, n: f && f.side === side ? f.n + SKIP : SKIP }));
    flashOpacity.setValue(1);
    Animated.timing(flashOpacity, { toValue: 0, duration: 700, delay: 250, useNativeDriver: true }).start(() => setFlash(null));
  };
  const seekBy = (delta: number) => {
    try {
      const d = player.duration || durRef.current || 0;
      const next = Math.max(0, Math.min(d || 1e9, player.currentTime + delta));
      player.currentTime = next;
      setTime(next);
    } catch {}
  };
  const [boxW, setBoxW] = useState(1);
  const onTap = (x: number) => {
    const side: 'l' | 'r' | 'c' = x < boxW * 0.38 ? 'l' : x > boxW * 0.62 ? 'r' : 'c';
    const now = Date.now();
    const prev = lastTap.current;
    if (prev && now - prev.t < 280 && prev.side === side) {
      clearTimeout(singleTimer.current);
      lastTap.current = { t: now, side };
      if (side === 'l') {
        seekBy(-SKIP);
        showFlash('l');
      } else if (side === 'r') {
        seekBy(SKIP);
        showFlash('r');
      } else {
        togglePlay();
      }
      return;
    }
    lastTap.current = { t: now, side };
    clearTimeout(singleTimer.current);
    singleTimer.current = setTimeout(() => {
      if (showControls) {
        fade(0);
        setShowControls(false);
      } else {
        reveal();
      }
    }, 285);
  };

  // ---- seek bar ----
  const startX = useRef(0);
  const ratioAt = (dx: number) => Math.max(0, Math.min(1, (startX.current + dx) / trackW.current));
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        clearTimeout(hideTimer.current);
        startX.current = e.nativeEvent.locationX;
        setScrub(ratioAt(0));
      },
      onPanResponderMove: (_e, g) => setScrub(ratioAt(g.dx)),
      onPanResponderRelease: (_e, g) => {
        try {
          player.currentTime = ratioAt(g.dx) * (durRef.current || player.duration || 0);
        } catch {}
        setScrub(null);
        if (playingRef.current) armHide();
      },
      onPanResponderTerminate: () => setScrub(null),
    })
  ).current;

  const progress = scrub !== null ? scrub : duration ? Math.min(1, time / duration) : 0;

  const cur = scrub !== null ? scrub * duration : time;

  return (
    <Animated.View style={{ width: '100%', height, backgroundColor: '#000', overflow: 'hidden' }} onLayout={(e: LayoutChangeEvent) => setBoxW(e.nativeEvent.layout.width)}>
      <Animated.View style={[StyleSheet.absoluteFill, { paddingTop: topPad as any }]}>
        <VideoView player={player} style={{ flex: 1 }} nativeControls={false} contentFit="contain" />
      </Animated.View>

      {/* Tap / double-tap surface */}
      <Pressable style={StyleSheet.absoluteFill} onPress={(e) => onTap(e.nativeEvent.locationX)} />

      {/* "5 seconds" flash on the side that was double-tapped */}
      {flash && (
        <Animated.View pointerEvents="none" style={[styles.flash, flash.side === 'l' ? { left: 0 } : { right: 0 }, { opacity: flashOpacity }]}>
          <View style={styles.flashBubble}>
            <Ionicons name={flash.side === 'l' ? 'play-back' : 'play-forward'} size={26} color="#fff" />
            <Text style={styles.flashText}>{flash.n} seconds</Text>
          </View>
        </Animated.View>
      )}

      <Animated.View style={[StyleSheet.absoluteFill, { opacity: controlsOpacity }]} pointerEvents={showControls ? 'box-none' : 'none'}>
        <LinearGradient colors={['rgba(0,0,0,0.55)', 'transparent']} style={styles.topShade} pointerEvents="none" />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.78)']} style={[styles.bottomShade, { height: compact ? 90 : 300 }]} pointerEvents="none" />

        <View style={[styles.topRow, { top: topInset + 8 }]} pointerEvents="box-none">
          <View>{topLeft}</View>
          <View>{topRight}</View>
        </View>

        <View style={[styles.bottomStack, { bottom: bottomInset + 8 }]} pointerEvents="box-none">
          {!compact && bottomOverlay}
          <View style={styles.trackHit} onLayout={(e) => (trackW.current = Math.max(1, e.nativeEvent.layout.width))} {...pan.panHandlers}>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${progress * 100}%` }]} />
            </View>
            <View style={[styles.knob, { left: `${progress * 100}%` }]} pointerEvents="none" />
          </View>
          <View style={styles.ctrlRow}>
            <GlassButton
              size={32}
              onPress={togglePlay}
              icon={<Ionicons name={playing ? 'pause' : 'play'} size={15} color="#fff" style={playing ? undefined : { marginLeft: 2 }} />}
            />
            <Text style={styles.time}>
              {fmt(cur)} / {fmt(duration)}
            </Text>
            <GlassButton size={30} onPress={cycleRate} icon={<Text style={styles.rateText}>{rate}x</Text>} />
            <GlassButton size={30} onPress={toggleMute} icon={<Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={15} color="#fff" />} />
          </View>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  topShade: { position: 'absolute', top: 0, left: 0, right: 0, height: 110 },
  bottomShade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 120 },
  topRow: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bottomStack: { position: 'absolute', left: 14, right: 14 },
  ctrlRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  rateText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  time: { color: '#fff', fontSize: 13, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
  trackHit: { width: '100%', height: 28, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  fill: { height: 4, backgroundColor: '#fff' },
  knob: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: '#fff', marginLeft: -6, top: 8 },
  flash: { position: 'absolute', top: 0, bottom: 0, width: '38%', alignItems: 'center', justifyContent: 'center' },
  flashBubble: { backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', borderRadius: 40, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center', gap: 4 },
  flashText: { color: '#fff', fontWeight: '800', fontSize: 12 },
});
