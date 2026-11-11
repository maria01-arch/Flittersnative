import { forwardRef, useState, Children, isValidElement } from 'react';
import { Text as RNText, Image, StyleSheet, TextProps } from 'react-native';
import { emojiUrls, bundledSource, missingEmoji, USE_CUSTOM_EMOJI } from '@/lib/emojiImage';
import { mayHaveEmoji, splitEmoji } from '@/lib/emojiSplit';

// Drop-in for React Native's <Text>: every emoji inside the text is drawn as the
// 3D picture instead of the phone's own emoji. Text without emoji is untouched
// (just one quick scan), so this costs almost nothing.
// If a picture cannot be loaded, that emoji is drawn as normal text instead,
// and the app remembers not to try again.
function InlineEmoji({ e, size }: { e: string; size: number }) {
  const [i, setI] = useState(0);
  const bundled = bundledSource(e);
  const urls = bundled ? [] : emojiUrls(e);
  if (missingEmoji.has(e) || (!bundled && i >= urls.length)) return <RNText>{e}</RNText>;
  // Sits on the text line: a little smaller than the line and nudged down, so it does not float above the words.
  const px = Math.round(size * 1.12);
  return (
    <Image
      source={bundled ? bundled : { uri: urls[i] }}
      style={{ width: px, height: px, transform: [{ translateY: Math.round(size * 0.2) }] }}
      resizeMode="contain"
      fadeDuration={0}
      onError={() => {
        if (bundled) return;
        if (i + 1 >= urls.length) missingEmoji.add(e);
        setI(i + 1);
      }}
    />
  );
}

function convert(node: any, size: number, keyBase: string): any {
  if (typeof node === 'string') {
    if (!mayHaveEmoji(node)) return node;
    const parts = splitEmoji(node);
    if (!parts.some((p) => p.emoji)) return node;
    return parts.map((p, n) => (p.emoji ? <InlineEmoji key={keyBase + n} e={p.t} size={size} /> : p.t));
  }
  if (Array.isArray(node)) return Children.toArray(node).map((c, n) => (typeof c === 'string' ? convert(c, size, keyBase + n + '.') : c));
  return node;
}

function hasText(children: any): boolean {
  if (typeof children === 'string') return mayHaveEmoji(children);
  if (Array.isArray(children)) return children.some((c) => typeof c === 'string' && mayHaveEmoji(c));
  return false;
}

const AppText = forwardRef<RNText, TextProps>(function AppText(props, ref) {
  const { children, style } = props;
  if (!USE_CUSTOM_EMOJI || !hasText(children)) return <RNText ref={ref} {...props} />;
  const size = (StyleSheet.flatten(style) as any)?.fontSize || 14;
  return (
    <RNText ref={ref} {...props}>
      {convert(children, size, 'e')}
    </RNText>
  );
});

export default AppText;
void isValidElement;
