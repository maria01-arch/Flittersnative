import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useVideoPlayer, VideoView } from 'expo-video';
import VideoPlaceholder from './VideoPlaceholder';
import { useVideoThumb } from '@/lib/videoThumb';

// A DM video loads only when tapped (nothing downloads while it sits in the chat), then plays by itself.
// While it plays there are no buttons on it, only a small "maximize" icon in the corner; tap the video to
// pause or resume. The full set of controls only shows once it is maximized.
export default function MessageVideoPlayer({ url, captioned }: { url: string; captioned?: boolean }) {
  const [tapped, setTapped] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [full, setFull] = useState(false);
  const ref = useRef<VideoView>(null);
  const thumb = useVideoThumb(url);
  const player = useVideoPlayer(tapped ? url : null, (p) => {
    p.loop = false;
  });

  useEffect(() => {
    if (!tapped) return;
    const sub = player.addListener('playingChange', (e: any) => setPlaying(!!e.isPlaying));
    try { player.play(); } catch {}
    return () => sub.remove();
  }, [tapped, player]);

  if (!tapped) {
    return (
      <Pressable style={[styles.video, captioned && styles.videoCaptioned]} onPress={() => setTapped(true)}>
        <VideoPlaceholder posterUri={thumb?.uri} loading fit="cover" />
      </Pressable>
    );
  }

  const toggle = () => {
    try {
      if (player.playing) player.pause();
      else {
        // finished? start again from the beginning
        if (player.duration > 0 && player.currentTime >= player.duration - 0.25) player.currentTime = 0;
        player.play();
      }
    } catch {}
  };

  return (
    <View style={[styles.video, captioned && styles.videoCaptioned]}>
      <VideoView
        ref={ref}
        player={player}
        style={StyleSheet.absoluteFill}
        nativeControls={full}
        allowsFullscreen
        contentFit="cover"
        // Draws the video as a normal view, so it scrolls and clips with the chat like everything else
        // (the default surface sits "under" the screen and looked like the interface floating over it at the list's edge).
        surfaceType="textureView"
        onFullscreenEnter={() => setFull(true)}
        onFullscreenExit={() => setFull(false)}
      />
      {!full && (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={toggle}>
            {!playing && (
              <View style={styles.center} pointerEvents="none">
                <View style={styles.playDot}><Ionicons name="play" size={26} color="#fff" /></View>
              </View>
            )}
          </Pressable>
          <Pressable style={styles.max} onPress={() => ref.current?.enterFullscreen()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="expand" size={16} color="#fff" />
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  video: { width: 220, height: 260, borderRadius: 14, backgroundColor: '#00000020', overflow: 'hidden' },
  // With a caption under it, the video only rounds its top corners.
  videoCaptioned: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  playDot: { width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', paddingLeft: 3 },
  max: { position: 'absolute', right: 8, bottom: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
});
