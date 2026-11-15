import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import VideoPlaceholder from './VideoPlaceholder';
import { useVideoThumb } from '@/lib/videoThumb';

// Used to load and start buffering the moment a message bubble rendered
// at all — meaning every video message sitting in the chat's scroll
// window, not just ones actually being watched, was downloading in full.
// A DM video has no autoplay-on-scroll expectation the way a feed does
// (nobody scrolls a chat to "watch videos go by"), so tap-to-load is both
// the fix and the more familiar pattern — this is exactly how WhatsApp,
// Telegram, and iMessage all handle a video attachment: a thumbnail-style
// placeholder, nothing downloaded until it's actually tapped.
export default function MessageVideoPlayer({ url, captioned }: { url: string; captioned?: boolean }) {
  const [tapped, setTapped] = useState(false);
  const thumb = useVideoThumb(url);
  const player = useVideoPlayer(tapped ? url : null, (p) => {
    p.loop = false;
  });

  if (!tapped) {
    return (
      <Pressable style={[styles.video, captioned && styles.videoCaptioned]} onPress={() => setTapped(true)}>
        <VideoPlaceholder posterUri={thumb?.uri} loading fit="cover" />
      </Pressable>
    );
  }

  return <VideoView player={player} style={[styles.video, captioned && styles.videoCaptioned]} nativeControls contentFit="cover" />;
}

const styles = StyleSheet.create({
  video: { width: 220, height: 260, borderRadius: 14, backgroundColor: '#00000020', overflow: 'hidden' },
  // With a caption under it, the video only rounds its top corners.
  videoCaptioned: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
});
