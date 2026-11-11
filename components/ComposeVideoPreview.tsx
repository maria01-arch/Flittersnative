import { View, StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

// The real video, right in the composer, so you can watch it (and check the
// sound) before posting. It starts paused on the first frame — tap play —
// so it doesn't use data or battery until you want to look.
export default function ComposeVideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
  });
  return (
    <View style={styles.box}>
      <VideoView player={player} style={styles.video} contentFit="contain" nativeControls allowsFullscreen allowsPictureInPicture={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: '100%', height: 260, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' },
  video: { width: '100%', height: '100%' },
});
