import { useEffect } from 'react';
import { TouchableOpacity, View, Text, StyleSheet, Image } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { usePreferences } from '@/lib/PreferencesContext';

export default function ReelPreviewThumb({ reel, visible }: { reel: any; visible: boolean }) {
  const { autoplayVideos } = usePreferences();
  const shouldPlay = autoplayVideos && visible;

  const player = useVideoPlayer(reel.video_url, (p) => {
    p.muted = true;
    p.loop = true;
  });

  useEffect(() => {
    try {
      if (shouldPlay) player.play();
      else player.pause();
    } catch {}
  }, [shouldPlay, player]);

  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch {}
    };
  }, [player]);

  return (
    <TouchableOpacity style={styles.reelThumb} onPress={() => router.push('/(tabs)/reels')}>
      {autoplayVideos ? (
        <VideoView player={player} style={styles.video} contentFit="cover" nativeControls={false} />
      ) : (
        <View style={[styles.video, styles.staticFallback]}>
          <Ionicons name="play-circle" size={32} color="rgba(255,255,255,0.85)" />
        </View>
      )}
      <View style={styles.reelPlayBadge}>
        <Ionicons name="play" size={12} color="#fff" />
      </View>
      <Text style={styles.reelThumbName} numberOfLines={1}>{reel.author?.display_name}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  reelThumb: { width: 90, height: 140, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000' },
  video: { width: '100%', height: '100%' },
  staticFallback: { justifyContent: 'center', alignItems: 'center' },
  reelPlayBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10, padding: 3 },
  reelThumbName: { position: 'absolute', bottom: 6, left: 6, color: '#fff', fontSize: 11, fontWeight: '600', maxWidth: 78 },
});
