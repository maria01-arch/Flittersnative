import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';

// expo-image (not core RN Image) so animated GIF/WebP stickers actually
// animate on both platforms — core Image only reliably animates GIFs on
// Android. A sticker ending in a video extension (a clip recorded on the
// webapp, which saves those as silent looping .webm) plays through
// expo-video instead: muted, looping, no controls, same treatment the
// webapp's <StickerMedia> gives it.
const VIDEO_EXT = /\.(webm|mp4|mov|m4v)($|\?)/i;

function VideoSticker({ url, size }: { url: string; size: number }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={{ width: size, height: size }}
      nativeControls={false}
      contentFit="contain"
    />
  );
}

export default function StickerMedia({ url, size = 132 }: { url: string; size?: number }) {
  if (VIDEO_EXT.test(url)) return <VideoSticker url={url} size={size} />;
  return (
    <Image
      source={{ uri: url }}
      style={{ width: size, height: size }}
      contentFit="contain"
      autoplay
    />
  );
}
