import { View, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';

// Shown over a video that isn't playing yet. When a real still frame from
// the video is available (posterUri) it is shown like any normal video
// thumbnail, with a play button on top. Until that frame arrives it is a
// neutral dark card with a small spinner — not the bright blue block this
// used to be, which looked like something had failed to load.
export default function VideoPlaceholder({
  posterUri,
  loading,
  iconColor = '#fff',
  fit = 'contain',
}: {
  background?: string;
  posterUri?: string | null;
  loading?: boolean;
  iconColor?: string;
  fit?: 'contain' | 'cover';
}) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.wrap]} pointerEvents="none">
      <LinearGradient colors={['#1d1d24', '#0e0e12']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {posterUri ? <Image source={{ uri: posterUri }} style={StyleSheet.absoluteFill} resizeMode={fit} /> : null}
      <View style={styles.playCircle}>
        {!posterUri && loading ? (
          <ActivityIndicator size="small" color={iconColor} />
        ) : (
          <Ionicons name="play" size={26} color={iconColor} style={{ marginLeft: 3 }} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  playCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
