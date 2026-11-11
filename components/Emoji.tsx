import { memo, useMemo, useState } from 'react';
import { View, Text, Image } from 'react-native';
import { emojiUrls, bundledSource, loadedUrls, missingEmoji, USE_CUSTOM_EMOJI } from '@/lib/emojiImage';

// One emoji drawn as a picture (the 3D look).
//   - essentials are built into the app: shown at once
//   - the rest come from the website; nothing is drawn until the picture is there
//     (no old-emoji-then-new flash), and it is remembered so scrolling back is instant
//   - if a picture does not exist anywhere, the phone's own emoji is shown
function Emoji({ emoji, size = 28 }: { emoji: string; size?: number }) {
  if (!USE_CUSTOM_EMOJI) {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Text allowFontScaling={false} style={{ fontSize: size * 0.82, lineHeight: size * 1.05, textAlign: 'center' }}>
          {emoji}
        </Text>
      </View>
    );
  }
  const bundled = useMemo(() => bundledSource(emoji), [emoji]);
  const urls = useMemo(() => (bundled ? [] : emojiUrls(emoji)), [emoji, bundled]);
  const [i, setI] = useState(0);
  const [, force] = useState(0);
  const box = { width: size, height: size, alignItems: 'center' as const, justifyContent: 'center' as const };
  if (bundled) {
    return (
      <View style={box}>
        <Image source={bundled} style={{ width: size, height: size }} resizeMode="contain" fadeDuration={0} />
      </View>
    );
  }
  const url = urls[i];
  if (!url || missingEmoji.has(emoji)) {
    return (
      <View style={box}>
        <Text allowFontScaling={false} style={{ fontSize: size * 0.82, lineHeight: size * 1.05, textAlign: 'center' }}>
          {emoji}
        </Text>
      </View>
    );
  }
  return (
    <View style={box}>
      <Image
        source={{ uri: url }}
        style={{ width: size, height: size, opacity: loadedUrls.has(url) ? 1 : 0 }}
        resizeMode="contain"
        fadeDuration={0}
        onLoad={() => {
          if (!loadedUrls.has(url)) {
            loadedUrls.add(url);
            force((n) => n + 1);
          }
        }}
        onError={() => {
          if (i + 1 >= urls.length) missingEmoji.add(emoji);
          setI((n) => n + 1);
        }}
      />
    </View>
  );
}

export default memo(Emoji);
