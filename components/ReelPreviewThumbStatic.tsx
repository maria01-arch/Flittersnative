import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

// Deliberately has no useVideoPlayer/VideoView at all — mounting 4 video
// decoders at once in the home feed's reel row was what froze the UI.
// Only the one currently-active thumb (see index.tsx) renders the real
// ReelPreviewThumb with a player; every other slot renders this instead.
export default function ReelPreviewThumbStatic({ reel }: { reel: any }) {
  return (
    <TouchableOpacity style={styles.reelThumb} onPress={() => router.push('/(tabs)/reels')}>
      <View style={styles.fallback}>
        <Ionicons name="play-circle" size={32} color="rgba(255,255,255,0.85)" />
      </View>
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
  fallback: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  reelPlayBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10, padding: 3 },
  reelThumbName: { position: 'absolute', bottom: 6, left: 6, color: '#fff', fontSize: 11, fontWeight: '600', maxWidth: 78 },
});
