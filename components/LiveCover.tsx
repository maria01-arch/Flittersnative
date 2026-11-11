import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

// The live (moving) profile cover: a short silent loop of at most 6 seconds that
// plays on top of the still cover picture.
// Kept light on purpose:
//   - the still picture is already on screen, so the video fades in only once it plays
//   - silent, and never plays more than 6 seconds of the file even if it is longer
//   - the file is saved on the phone after the first view (useCaching)
//   - `paused` (scrolled away) stops it; the parent also removes this whole piece
//     when the screen is not in front, so no video decoder stays alive in the background
const MAX_LOOP_SECONDS = 6.2;

export default function LiveCover({ url, paused }: { url: string; paused: boolean }) {
  const [shown, setShown] = useState(false);
  const player = useVideoPlayer({ uri: url, useCaching: true } as any, (p) => {
    p.loop = true;
    p.muted = true;
    p.timeUpdateEventInterval = 0.5;
  });

  useEffect(() => {
    const a = player.addListener('timeUpdate', ({ currentTime }: any) => {
      if (currentTime > MAX_LOOP_SECONDS) player.currentTime = 0;
    });
    const b = player.addListener('playingChange', ({ isPlaying }: any) => {
      if (isPlaying) setShown(true);
    });
    return () => {
      a.remove();
      b.remove();
    };
  }, [player]);

  useEffect(() => {
    try {
      if (paused) player.pause();
      else player.play();
    } catch {}
  }, [paused, player]);

  return (
    <VideoView
      player={player}
      style={[StyleSheet.absoluteFill, { opacity: shown ? 1 : 0 }]}
      contentFit="cover"
      nativeControls={false}
      allowsFullscreen={false}
      allowsPictureInPicture={false}
    />
  );
}
