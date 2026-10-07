import { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '@/lib/ThemeContext';
import { usePreferences } from '@/lib/PreferencesContext';
import { openLink } from '@/lib/openLink';

type PreviewData = { url?: string; domain?: string; title?: string; description?: string; image?: string };

// Ported from the webapp's LinkPreviewCard, which calls the same endpoint —
// same backend, same OpenGraph scraper, so previews look identical on both
// apps for the same link. A tiny in-memory cache like the webapp's so
// scrolling a feed past the same link twice doesn't refetch it.
const cache = new Map<string, PreviewData>();

export default function LinkPreviewCard({ url }: { url: string }) {
  const { colors } = useTheme();
  const { showLinkPreviews, browserEngine } = usePreferences();
  const [data, setData] = useState<PreviewData | null>(() => cache.get(url) || null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!url || !showLinkPreviews) return;
    if (cache.has(url)) {
      setData(cache.get(url)!);
      return;
    }
    let cancelled = false;
    fetch('https://xchord.space/api/link-preview?url=' + encodeURIComponent(url))
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error || (!json.title && !json.image)) {
          setFailed(true);
          return;
        }
        cache.set(url, json);
        setData(json);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url, showLinkPreviews]);

  // No loading skeleton, same reasoning as the webapp — most links either
  // resolve fast or never do (blocked, broken, no OG tags), and a
  // permanently-loading card for the latter looks broken.
  if (!url || !showLinkPreviews || failed || !data) return null;

  return (
    <Pressable
      onPress={() => openLink(data.url || url, browserEngine)}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      {data.image ? <Image source={{ uri: data.image }} style={styles.image} resizeMode="cover" /> : null}
      <View style={styles.body}>
        {data.title ? (
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {data.title}
          </Text>
        ) : null}
        {data.description ? (
          <Text style={[styles.description, { color: colors.subtext }]} numberOfLines={2}>
            {data.description}
          </Text>
        ) : null}
        {data.domain ? <Text style={[styles.domain, { color: colors.faint }]}>{data.domain}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 8, borderRadius: 12, overflow: 'hidden', borderWidth: 1 },
  image: { width: '100%', height: 160 },
  body: { padding: 10 },
  title: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  description: { fontSize: 12, marginBottom: 3 },
  domain: { fontSize: 11 },
});
