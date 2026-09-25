import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useTheme } from '@/lib/ThemeContext';

function formatVoiceDuration(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export default function VoiceMessagePlayer({
  url,
  duration,
  isMine,
}: {
  url?: string | null;
  duration?: number;
  isMine: boolean;
}) {
  const { colors } = useTheme();
  // useAudioPlayer captures its source once and never re-reads it — feeding
  // it an empty string when url is briefly missing would permanently wedge
  // this instance, so fall back to undefined instead and just never let
  // taps do anything in that case.
  const player = useAudioPlayer(url || undefined);
  const status = useAudioPlayerStatus(player);
  const [playError, setPlayError] = useState<string | null>(null);

  useEffect(() => {
    if (status.didJustFinish) {
      try {
        player.seekTo(0);
      } catch (err) {
        console.error('[VoiceMessagePlayer] seekTo(0) failed:', err);
      }
    }
  }, [status.didJustFinish, player]);

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
      // Belt-and-suspenders: if the audio session was ever left in
      // recording mode (e.g. app was killed mid-recording before our own
      // cleanup ran), force it back to playback mode right before playing.
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      if (status.didJustFinish) player.seekTo(0);
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
      <View style={[styles.track, { backgroundColor: trackColor }]}>
        <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: fillColor }]} />
      </View>
      <Text style={[styles.time, { color: isMine ? 'rgba(255,255,255,0.85)' : colors.subtext }]}>
        {formatVoiceDuration(dur)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 170 },
  playBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  track: { flex: 1, height: 3, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
  time: { fontSize: 11, minWidth: 30, textAlign: 'right' },
});
