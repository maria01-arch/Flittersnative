import { useEffect, useRef, useState } from 'react';
import { Modal, View, TouchableOpacity, StyleSheet, PanResponder } from 'react-native';
import Text from '@/components/AppText';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useTheme } from '@/lib/ThemeContext';

// Pick which part (2-5 seconds) of a video becomes the sticker. The window
// loops in the preview. Drag the highlighted part along the bar to move it.
const LENGTHS = [2, 3, 4, 5];
const MAX = 5;

export default function StickerVideoTrim({
  visible,
  uri,
  duration,
  onCancel,
  onDone,
}: {
  visible: boolean;
  uri: string | null;
  duration: number; // seconds
  onCancel: () => void;
  onDone: (start: number, length: number) => void;
}) {
  const { colors } = useTheme();
  const dur = Math.max(1, duration);
  const maxLen = Math.min(MAX, dur);
  const [len, setLen] = useState(maxLen);
  const [start, setStart] = useState(0);
  const [trackW, setTrackW] = useState(1);

  const startRef = useRef(0);
  const lenRef = useRef(maxLen);
  const trackRef = useRef(1);
  const durRef = useRef(dur);
  const grabStart = useRef(0);
  startRef.current = start;
  lenRef.current = len;
  trackRef.current = trackW;
  durRef.current = dur;

  useEffect(() => {
    if (visible) {
      setLen(maxLen);
      setStart(0);
    }
  }, [visible, uri]);

  const player = useVideoPlayer(uri || null, (p) => {
    p.loop = true;
    p.muted = true;
    p.timeUpdateEventInterval = 0.1;
    p.play();
  });

  // Keep the preview inside the chosen window.
  useEffect(() => {
    try {
      player.currentTime = start;
    } catch {}
  }, [start, len]);
  useEffect(() => {
    const sub = player.addListener('timeUpdate', (e: any) => {
      const t = e?.currentTime ?? player.currentTime;
      if (t >= startRef.current + lenRef.current || t < startRef.current - 0.3) player.currentTime = startRef.current;
    });
    return () => sub.remove();
  }, [player]);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        grabStart.current = startRef.current;
      },
      onPanResponderMove: (_e, g) => {
        const maxStart = Math.max(0, durRef.current - lenRef.current);
        const next = grabStart.current + (g.dx / trackRef.current) * durRef.current;
        setStart(Math.min(maxStart, Math.max(0, next)));
      },
    })
  ).current;

  const pickLen = (l: number) => {
    setLen(l);
    setStart((s) => Math.min(s, Math.max(0, dur - l)));
  };

  const winW = Math.max(24, (len / dur) * trackW);
  const winLeft = Math.min(trackW - winW, (start / dur) * trackW);
  const fmt = (n: number) => n.toFixed(1) + 's';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.title, { color: colors.text }]}>Make a video sticker</Text>
          <Text style={{ color: colors.subtext, fontSize: 12, textAlign: 'center', marginBottom: 12 }}>Pick up to 5 seconds. Drag the blue part to choose where it starts.</Text>
          <View style={styles.previewWrap}>
            {uri ? <VideoView player={player} style={styles.preview} nativeControls={false} contentFit="contain" /> : null}
          </View>

          <View style={styles.chips}>
            {LENGTHS.filter((l) => l <= Math.ceil(maxLen)).map((l) => {
              const val = Math.min(l, maxLen);
              const on = Math.abs(len - val) < 0.01;
              return (
                <TouchableOpacity key={l} onPress={() => pickLen(val)} style={[styles.chip, { backgroundColor: on ? colors.primary : colors.inputBg }]}>
                  <Text style={{ color: on ? '#fff' : colors.text, fontWeight: '800', fontSize: 12 }}>{val === l ? `${l}s` : fmt(val)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={[styles.track, { backgroundColor: colors.inputBg }]} onLayout={(e) => setTrackW(Math.max(1, e.nativeEvent.layout.width))}>
            <View {...pan.panHandlers} style={[styles.window, { left: winLeft, width: winW, backgroundColor: colors.primary + '66', borderColor: colors.primary }]} />
          </View>
          <Text style={{ color: colors.subtext, fontSize: 12, textAlign: 'center', marginTop: 6 }}>
            {fmt(start)} → {fmt(start + len)} of {fmt(dur)}
          </Text>

          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, { backgroundColor: colors.inputBg }]} onPress={onCancel}>
              <Text style={{ color: colors.text, fontWeight: '800' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={() => onDone(Math.round(start * 10) / 10, Math.round(len * 10) / 10)}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>Use sticker</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  card: { borderRadius: 20, padding: 16 },
  title: { fontSize: 17, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  previewWrap: { alignSelf: 'center', width: 200, height: 200, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' },
  preview: { width: 200, height: 200 },
  chips: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 14 },
  chip: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 16 },
  track: { height: 36, borderRadius: 10, marginTop: 14, overflow: 'hidden' },
  window: { position: 'absolute', top: 0, bottom: 0, borderWidth: 2, borderRadius: 10 },
  row: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { flex: 1, borderRadius: 22, paddingVertical: 12, alignItems: 'center' },
});
