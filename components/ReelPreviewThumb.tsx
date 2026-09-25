import { useEffect, useState } from 'react';
import { TouchableOpacity, View, Text, StyleSheet, Image, ActivityIndicator } from 'react-native';
import * as VideoThumbnails from 'expo-video-thumbnails';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

// No video player here at all anymore — just a real still frame pulled
// from the video once, cached for this component's lifetime. That's what
// was showing as a black box before (a video component that was either
// never actually playing or hadn't decoded a frame yet), and it also
// removes any autoplay/decoder cost from this row entirely.
export default function ReelPreviewThumb({ reel }: { reel: any }) {
  const [thumbUri, setThumbUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    VideoThumbnails.getThumbnailAsync(reel.video_url, { time: 300 })
      .then(({ uri }) => {
        if (!cancelled) setThumbUri(uri);
      })
      .catch((err) => {
        console.error('[ReelPreviewThumb] thumbnail generation failed:', reel.video_url, err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reel.video_url]);

  return (
    <TouchableOpacity style={styles.reelThumb} onPress={() => router.push('/(tabs)/reels')}>
      {thumbUri ? (
        <Image source={{ uri: thumbUri }} style={styles.video} resizeMode="cover" />
      ) : (
        <View style={[styles.video, styles.staticFallback]}>
          {failed ? (
            <Ionicons name="play-circle" size={32} color="rgba(255,255,255,0.85)" />
          ) : (
            <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" />
          )}
        </View>
      )}
      <View style={styles.reelPlayBadge}>
        <Ionicons name="play" size={12} color="#fff" />
      </View>
      <Text style={styles.reelThumbName} numberOfLines={1}>
        {reel.author?.display_name}
      </Text>
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
