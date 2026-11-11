import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import Text from '@/components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';

function formatVoiceDuration(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

// Replaces the whole composer row while recording is active — same
// tradeoff the web app makes — so there's no ambiguity about what tapping
// will do. The right-hand button stops into a preview rather than sending
// straight away, so it's a checkmark ("done recording") rather than send.
export default function VoiceRecordingBar({
  seconds,
  levels = [],
  sending,
  onCancel,
  onSend,
}: {
  seconds: number;
  levels?: number[];
  sending?: boolean;
  onCancel: () => void;
  onSend: () => void;
}) {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.35, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={[styles.bar, { borderTopColor: colors.border, backgroundColor: colors.card }]}>
      <TouchableOpacity onPress={onCancel} style={[styles.cancelBtn, { backgroundColor: colors.bubbleTheirs }]}>
        <Ionicons name="trash" size={18} color="#F87171" />
      </TouchableOpacity>
      <View style={styles.status}>
        <Animated.View style={[styles.dot, { transform: [{ scale: pulse }] }]} />
        <Text style={[styles.statusText, { color: colors.text }]}>{formatVoiceDuration(seconds)}</Text>
        {/* Live waveform: the newest loudness reading appears on the right and
            the bars scroll left, like WhatsApp. */}
        <View style={styles.wave}>
          {Array.from({ length: 40 }, (_, i) => {
            const v = levels[levels.length - 40 + i];
            return <View key={i} style={[styles.waveBar, { height: 3 + (v ?? 0) * 24, backgroundColor: v === undefined ? colors.border : colors.primary }]} />;
          })}
        </View>
      </View>
      <TouchableOpacity onPress={onSend} disabled={sending} style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: sending ? 0.6 : 1 }]}>
        {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark" size={20} color="#fff" />}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', padding: 10, borderTopWidth: 1, gap: 12 },
  cancelBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  status: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: '#F87171' },
  statusText: { fontSize: 14, fontVariant: ['tabular-nums'] },
  wave: { flex: 1, height: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 1.5, overflow: 'hidden' },
  waveBar: { width: 2.5, borderRadius: 1.5 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
