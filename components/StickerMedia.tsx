import { useEffect } from 'react';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';

// expo-image (not core RN Image) so animated GIF/WebP stickers actually
// animate on both platforms. A sticker ending in a video extension plays
// through expo-video: muted, looping, no controls.
//
// Video stickers made in the app are saved as  <video url>#t=START,END .
// The whole file is stored, but only that window (max 5 s) plays, looping.
const VIDEO_EXT = /\.(webm|mp4|mov|m4v)($|[?#])/i;
const SEGMENT = /#t=([\d.]+),([\d.]+)$/;

export function parseSticker(url: string) {
  const m = url.match(SEGMENT);
  if (!m) return { src: url, start: 0, end: 0 };
  const start = parseFloat(m[1]);
  const end = Math.min(parseFloat(m[2]), start + 5);
  return { src: url.replace(SEGMENT, ''), start, end };
}

function VideoSticker({ url, size }: { url: string; size: number }) {
  const { src, start, end } = parseSticker(url);
  const player = useVideoPlayer(src, (p) => {
    p.loop = true;
    p.muted = true;
    if (end > start) {
      p.timeUpdateEventInterval = 0.1;
      p.currentTime = start;
    }
    p.play();
  });

  useEffect(() => {
    if (!(end > start)) return;
    const sub = player.addListener('timeUpdate', (e: any) => {
      const t = e?.currentTime ?? player.currentTime;
      if (t >= end || t < start - 0.3) player.currentTime = start;
    });
    return () => sub.remove();
  }, [player, start, end]);

  return <VideoView player={player} style={{ width: size, height: size }} nativeControls={false} contentFit="contain" />;
}

export default function StickerMedia({ url, size = 132 }: { url: string; size?: number }) {
  if (VIDEO_EXT.test(url)) return <VideoSticker url={url} size={size} />;
  return <Image source={{ uri: url }} style={{ width: size, height: size }} contentFit="contain" autoplay />;
}
