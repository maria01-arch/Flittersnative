import { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import Text from '@/components/AppText';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import Ionicons from '@expo/vector-icons/Ionicons';
import { usePreferences } from '@/lib/PreferencesContext';
import { useVideoStatus } from '@/lib/useVideoStatus';
import { useVideoWatchdog } from '@/lib/useVideoWatchdog';
import { openLink } from '@/lib/openLink';
import { trackAd } from '@/lib/adTracking';
import OptImage from './OptImage';
import GlassShimmerButton from './GlassShimmerButton';

// A sponsored video between reels. Looks like a reel (full screen, plays when
// it is the one on screen) but has no like / comment / share / report buttons
// and nothing here is counted as a reel view. Same `ads` table as the feed ads.
export default function ReelAdItem({ ad, active, shouldLoad, height }: { ad: any; active: boolean; shouldLoad: boolean; height?: number }) {
  const { autoplayVideos, browserEngine } = usePreferences();
  const [userPaused, setUserPaused] = useState(false);
  const player = useVideoPlayer(shouldLoad ? ad.video_url : null, (p) => {
    p.loop = true;
    try {
      (p as any).bufferOptions = { preferredForwardBufferDuration: 6, minBufferForPlayback: 1, maxBufferBytes: 10 * 1024 * 1024, prioritizeTimeOverSizeThreshold: true };
    } catch {}
  });

  useEffect(() => {
    try {
      if (active && !userPaused && autoplayVideos) player.play();
      else player.pause();
    } catch {}
  }, [active, userPaused, autoplayVideos, player]);

  useVideoWatchdog(player, active && !userPaused && autoplayVideos, shouldLoad ? ad.video_url : null);

  useEffect(() => {
    if (!active) setUserPaused(false);
  }, [active]);

  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch {}
    };
  }, [player]);

  // Counted once it has been the reel on screen for 1 second (once per session).
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => trackAd(ad.id, 'impression'), 1000);
    return () => clearTimeout(t);
  }, [active, ad.id]);

  const go = () => {
    trackAd(ad.id, 'click');
    if (!ad.link_url) return;
    const url = /^https?:\/\//i.test(ad.link_url) ? ad.link_url : `https://${ad.link_url}`;
    openLink(url, browserEngine);
  };

  const status = useVideoStatus(player);
  const notReady = !shouldLoad || status !== 'readyToPlay';

  return (
    <View style={[styles.container, height ? { height } : null]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setUserPaused((p) => !p)}>
        <VideoView player={player} style={styles.video} contentFit="contain" nativeControls={false} />
        {(userPaused || !autoplayVideos || notReady) && (
          <View style={styles.pausedOverlay}>
            <Ionicons name="play" size={56} color="rgba(255,255,255,0.9)" />
          </View>
        )}
      </Pressable>
      <View style={styles.bottom} pointerEvents="box-none">
        <View style={styles.authorRow}>
          {ad.advertiser_avatar_url ? (
            <OptImage dp={36} source={{ uri: ad.advertiser_avatar_url }} style={styles.avatar} />
          ) : (
            <LinearGradient colors={['#F7B731', '#FF6B35']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
              <Text style={styles.avatarLetter}>{(ad.advertiser_name || 'A')[0].toUpperCase()}</Text>
            </LinearGradient>
          )}
          <Text style={styles.name} numberOfLines={1}>{ad.advertiser_name}</Text>
          <View style={styles.tag}>
            <Text style={styles.tagText}>SPONSORED</Text>
          </View>
        </View>
        {!!ad.content && <Text style={styles.caption} numberOfLines={3}>{ad.content}</Text>}
        {!!ad.link_url && (
          <View style={{ marginTop: 12, alignSelf: 'stretch' }}>
            <GlassShimmerButton label={ad.cta_text || 'Learn More'} onPress={go} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', backgroundColor: '#000' },
  video: { width: '100%', height: '100%' },
  pausedOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 110 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: '#fff', fontWeight: '800', fontSize: 16 },
  name: { color: '#fff', fontWeight: '700', fontSize: 15, flexShrink: 1 },
  tag: { backgroundColor: 'rgba(247,183,49,0.15)', borderColor: 'rgba(247,183,49,0.35)', borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  tagText: { color: '#F7B731', fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  caption: { color: '#fff', fontSize: 14, marginTop: 8, lineHeight: 19 },
});
