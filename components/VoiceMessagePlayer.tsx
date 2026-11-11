import { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, Pressable, StyleSheet, Alert } from 'react-native';
import Text from '@/components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useTheme } from '@/lib/ThemeContext';

function formatVoiceDuration(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

// The real waveform travels on the voice note's address as ?wf=<40 chars>
// (see useVoiceRecorder). Voice notes without one — older ones, or ones from
// the webapp — get a stable stand-in pattern derived from the address, so
// the same note always looks the same.
const WAVE_BARS = 40;
function readWaveform(url?: string | null): number[] {
  const m = /[?&]wf=([0-9a-z]{20,80})/.exec(url || '');
  if (m) return m[1].split('').map((c) => parseInt(c, 36) / 35);
  let h = 7;
  for (const ch of url || 'x') h = (h * 31 + ch.charCodeAt(0)) | 0;
  const out: number[] = [];
  for (let i = 0; i < WAVE_BARS; i++) {
    h = (h * 1103515245 + 12345) | 0;
    out.push(0.2 + (((h >>> 16) & 0xff) / 255) * 0.8);
  }
  return out;
}

// A voice note plays once and stops. No repeating at all.
const EXTRA_PLAYS = 0;
// Speeds you can cycle through. The choice is remembered for the next notes.
const SPEEDS = [1, 1.5, 2];
let lastSpeed = 1;

export default function VoiceMessagePlayer({
  url,
  duration,
  isMine,
  onLongPress,
}: {
  url?: string | null;
  duration?: number;
  isMine: boolean;
  onLongPress?: () => void;
}) {
  const { colors } = useTheme();
  // useAudioPlayer captures its source once and never re-reads it — feeding
  // it an empty string when url is briefly missing would permanently wedge
  // this instance, so fall back to undefined instead and just never let
  // taps do anything in that case.
  const player = useAudioPlayer(url || undefined);
  const status = useAudioPlayerStatus(player);
  const [playError, setPlayError] = useState<string | null>(null);
  const [waveWidth, setWaveWidth] = useState(0);
  const [speed, setSpeed] = useState(lastSpeed);
  const repeatsLeft = useRef(EXTRA_PLAYS);
  const wave = readWaveform(url);

  useEffect(() => {
    try {
      (player as any).loop = false;
    } catch {}
  }, [player]);

  const applySpeed = (r: number) => {
    try {
      (player as any).setPlaybackRate(r);
    } catch {}
  };

  useEffect(() => {
    if (status.didJustFinish) {
      try {
        // Pause first: on Android a finished player that is rewound while still
        // marked "play when ready" starts playing again by itself (the repeat bug).
        player.pause();
        player.seekTo(0);
        if (repeatsLeft.current > 0) {
          repeatsLeft.current -= 1;
          applySpeed(speed);
          player.play();
        } else {
          repeatsLeft.current = EXTRA_PLAYS;
        }
      } catch (err) {
        console.error('[VoiceMessagePlayer] seekTo(0) failed:', err);
      }
    }
  }, [status.didJustFinish, player]);

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    lastSpeed = next;
    setSpeed(next);
    applySpeed(next);
  };

  useEffect(() => {
    if (status.error) {
      console.error('[VoiceMessagePlayer] player status reported an error:', status.error, 'url:', url);
      setPlayError(String((status.error as any)?.message || status.error));
    }
  }, [status.error, url]);

  const toggle = async () => {
    if (!url) {
      console.error('[VoiceMessagePlayer] no url on this message — nothing to play');
      return;
    }
    if (playError) {
      Alert.alert('Voice note', "This voice note couldn't be played.\n\n" + playError);
      return;
    }
    try {
      if (status.playing) {
        player.pause();
        return;
      }
      // A fresh tap on play starts the count again.
      repeatsLeft.current = EXTRA_PLAYS;
      // Belt-and-suspenders: if the audio session was ever left in
      // recording mode (e.g. app was killed mid-recording before our own
      // cleanup ran), force it back to playback mode right before playing.
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      if (status.didJustFinish) player.seekTo(0);
      applySpeed(speed);
      player.play();
    } catch (err: any) {
      console.error('[VoiceMessagePlayer] play() threw:', err);
      setPlayError(String(err?.message || err));
      Alert.alert('Voice note', "Couldn't play this voice note. Check the console log for details.");
    }
  };

  const dur = status.duration || duration || 0;
  const progress = dur > 0 ? Math.min(1, status.currentTime / dur) : 0;
  const trackColor = isMine ? 'rgba(255,255,255,0.3)' : colors.border;
  const fillColor = isMine ? '#fff' : colors.primary;
  const iconColor = isMine ? '#fff' : colors.text;

  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={toggle}
        onLongPress={onLongPress}
        delayLongPress={220}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={[styles.playBtn, { backgroundColor: isMine ? 'rgba(255,255,255,0.25)' : colors.card }]}
      >
        <Ionicons
          name={playError ? 'alert-circle' : status.playing ? 'pause' : 'play'}
          size={15}
          color={playError ? '#F87171' : iconColor}
          style={!status.playing && !playError ? { marginLeft: 2 } : undefined}
        />
      </TouchableOpacity>
      <Pressable
        style={styles.wave}
        onLongPress={onLongPress}
        delayLongPress={220}
        onLayout={(e) => setWaveWidth(e.nativeEvent.layout.width)}
        onPress={(e) => {
          // Tap anywhere on the waveform to jump there.
          if (!dur || !waveWidth || playError) return;
          try {
            player.seekTo(Math.max(0, Math.min(1, e.nativeEvent.locationX / waveWidth)) * dur);
          } catch {}
        }}
      >
        {wave.map((v, i) => (
          <View
            key={i}
            style={[styles.bar, { height: 4 + v * 22, backgroundColor: i < Math.round(progress * WAVE_BARS) ? fillColor : trackColor }]}
          />
        ))}
      </Pressable>
      <Text style={[styles.time, { color: isMine ? 'rgba(255,255,255,0.85)' : colors.subtext }]}>
        {formatVoiceDuration(dur)}
      </Text>
      <TouchableOpacity
        onPress={cycleSpeed}
        onLongPress={onLongPress}
        delayLongPress={220}
        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
        style={[styles.speedBtn, { backgroundColor: isMine ? 'rgba(255,255,255,0.25)' : colors.card }]}
      >
        <Text style={[styles.speedText, { color: iconColor }]}>{speed}x</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 200 },
  playBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  wave: { flex: 1, height: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bar: { width: 2.5, borderRadius: 1.5 },
  time: { fontSize: 11, minWidth: 30, textAlign: 'right' },
  speedBtn: { paddingHorizontal: 7, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  speedText: { fontSize: 11, fontWeight: '800' },
});
