import { useState } from 'react';
import { Image, ImageProps, PixelRatio } from 'react-native';
import { optimizedUrl, markCdnBroken, isDeadMedia } from '@/lib/imageUrl';

// Drop-in for <Image> that asks for a right-sized copy. `dp` is how wide the
// picture is drawn on screen, in layout units; it's converted to real pixels
// for this phone's screen. If the resized copy fails to load, it quietly
// switches to the original and tells imageUrl.ts not to try resizing again.
export default function OptImage({ dp, source, onError, ...rest }: Omit<ImageProps, 'source'> & { dp: number; source: { uri?: string | null } }) {
  const original = isDeadMedia(source?.uri) ? undefined : source?.uri || undefined;
  const [useOriginal, setUseOriginal] = useState(false);
  const uri = useOriginal ? original : optimizedUrl(original, Math.ceil(dp * PixelRatio.get()));
  return (
    <Image
      {...rest}
      source={{ uri }}
      onError={(e) => {
        if (!useOriginal && uri !== original) {
          markCdnBroken();
          setUseOriginal(true);
          return;
        }
        onError?.(e);
      }}
    />
  );
}
