import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';

// Shown over a video that either hasn't started loading yet (not the
// active one in a feed/reel, or not yet tapped in a DM) or has started
// but hasn't decoded a first frame yet (slow connection). A flat gray/
// black rectangle still reads as "this is broken" even with a play icon
// on it — this gives it an actual designed card look (a diagonal
// gradient, a soft circular backing behind the play icon) so it reads as
// "here's a video, tap or wait" rather than "something didn't load".
export default function VideoPlaceholder({ iconColor = '#fff' }: { background?: string; iconColor?: string }) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.wrap]} pointerEvents="none">
      <LinearGradient colors={['#2B2250', '#1A1A2E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={styles.playCircle}>
        <Ionicons name="play" size={26} color={iconColor} style={{ marginLeft: 3 }} />
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
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
