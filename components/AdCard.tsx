import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, useWindowDimensions, Share } from 'react-native';
import Text from '@/components/AppText';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { usePreferences } from '@/lib/PreferencesContext';
import { useAuth } from '@/lib/AuthContext';
import { openLink } from '@/lib/openLink';
import { spacing } from '@/lib/theme';
import { fmtCount } from '@/lib/formatCount';
import { trackAd } from '@/lib/adTracking';
import { setAdLike, setAdSave, subscribeAdComments, type AdEng } from '@/lib/adEngagement';
import OptImage from './OptImage';
import AnimatedHeart from './AnimatedHeart';
import AdGlassCta from './AdGlassCta';

// A sponsored post, laid out like a normal feed card (round avatar on the
// left, name + text + media on the right) with a small "Sponsored" tag.
// The call-to-action is a small see-through glass pill on the bottom-left of
// the picture; under it sits the same like / comment / share / save row as
// a normal post.
export default function AdCard({ ad, active, eng }: { ad: any; active?: boolean; eng?: AdEng }) {
  const { colors } = useTheme();
  const { browserEngine } = usePreferences();
  const { session } = useAuth();
  const uid = session?.user?.id;
  const { width: windowWidth } = useWindowDimensions();
  const mediaWidth = windowWidth - spacing.lg * 2 - 44 - 12;

  const [liked, setLiked] = useState(!!eng?.liked);
  const [likes, setLikes] = useState(eng?.likes ?? 0);
  const [saved, setSaved] = useState(!!eng?.saved);
  const [comments, setComments] = useState(eng?.comments ?? 0);
  const busy = useRef({ like: false, save: false });

  // Counts arrive after the card first shows; adopt them once they do.
  useEffect(() => {
    if (!eng) return;
    setLiked(!!eng.liked); setLikes(eng.likes); setSaved(!!eng.saved); setComments(eng.comments);
  }, [eng?.liked, eng?.likes, eng?.saved, eng?.comments]);

  useEffect(() => subscribeAdComments((id, d) => { if (id === ad.id) setComments((c) => Math.max(0, c + d)); }), [ad.id]);

  const go = () => {
    trackAd(ad.id, 'click');
    if (!ad.link_url) return;
    const url = /^https?:\/\//i.test(ad.link_url) ? ad.link_url : `https://${ad.link_url}`;
    openLink(url, browserEngine);
  };

  const toggleLike = async () => {
    if (!uid || busy.current.like) return;
    busy.current.like = true;
    const next = !liked;
    setLiked(next); setLikes((n) => Math.max(0, n + (next ? 1 : -1)));
    const ok = await setAdLike(ad.id, uid, next);
    if (!ok) { setLiked(!next); setLikes((n) => Math.max(0, n + (next ? -1 : 1))); }
    busy.current.like = false;
  };

  const toggleSave = async () => {
    if (!uid || busy.current.save) return;
    busy.current.save = true;
    const next = !saved;
    setSaved(next);
    const ok = await setAdSave(ad.id, uid, next);
    if (!ok) setSaved(!next);
    busy.current.save = false;
  };

  const share = async () => {
    try {
      const parts = [ad.advertiser_name, ad.content, ad.link_url].filter(Boolean);
      const r = await Share.share({ message: parts.join('\n') });
      if (r.action === Share.sharedAction) trackAd(ad.id, 'share');
    } catch {}
  };

  const ctaLabel = ad.cta_text || 'Learn more';

  return (
    <View style={[styles.row, { borderBottomColor: colors.border, backgroundColor: colors.bg }]}>
      {ad.advertiser_avatar_url ? (
        <OptImage dp={44} source={{ uri: ad.advertiser_avatar_url }} style={styles.avatar} />
      ) : (
        <LinearGradient colors={['#F7B731', '#FF6B35']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
          <Text style={styles.avatarLetter}>{(ad.advertiser_name || 'A')[0].toUpperCase()}</Text>
        </LinearGradient>
      )}
      <View style={{ flex: 1 }}>
        <View style={styles.headerRow}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {ad.advertiser_name}
          </Text>
          <View style={styles.tag}>
            <Text style={styles.tagText}>SPONSORED</Text>
          </View>
        </View>
        {!!ad.content && <Text style={[styles.content, { color: colors.text }]}>{ad.content}</Text>}
        {ad.image_url ? (
          <View style={{ width: mediaWidth }}>
            <TouchableOpacity activeOpacity={ad.link_url ? 0.85 : 1} onPress={go}>
              <OptImage dp={mediaWidth} source={{ uri: ad.image_url }} style={[styles.image, { width: mediaWidth, backgroundColor: colors.border }]} resizeMode="cover" />
            </TouchableOpacity>
            {!!ad.link_url && <AdGlassCta label={ctaLabel} onPress={go} />}
          </View>
        ) : !!ad.link_url ? (
          <TouchableOpacity activeOpacity={0.8} onPress={go} style={[styles.plainCta, { borderColor: colors.border }]}>
            <Text style={[styles.plainCtaText, { color: colors.primary }]}>{ctaLabel}</Text>
            <Ionicons name="arrow-forward" size={13} color={colors.primary} />
          </TouchableOpacity>
        ) : null}

        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionItem} onPress={() => router.push(`/ad-comments/${ad.id}` as any)} hitSlop={8}>
            <Ionicons name="chatbubble-outline" size={17} color={colors.faint} />
            <Text style={[styles.actionText, { color: colors.faint }]}>{fmtCount(comments)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionItem} onPress={toggleLike} hitSlop={8}>
            <AnimatedHeart liked={liked} size={17} color={colors.like} offColor={colors.faint} />
            <Text style={[styles.actionText, { color: liked ? colors.like : colors.faint }]}>{fmtCount(likes)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionItem} onPress={share} hitSlop={8}>
            <Ionicons name="share-outline" size={18} color={colors.faint} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionItem} onPress={toggleSave} hitSlop={8}>
            <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={17} color={saved ? colors.primary : colors.faint} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: '#fff', fontWeight: '800', fontSize: 18 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  name: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  tag: { backgroundColor: 'rgba(247,183,49,0.15)', borderColor: 'rgba(247,183,49,0.35)', borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  tagText: { color: '#F7B731', fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  content: { fontSize: 15, lineHeight: 22, marginBottom: 6 },
  image: { height: 220, borderRadius: 12, marginTop: 6 },
  plainCta: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12, marginTop: 4 },
  plainCtaText: { fontSize: 12.5, fontWeight: '700' },
  actions: { flexDirection: 'row', marginTop: 10, gap: 28 },
  actionItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { fontSize: 13, fontWeight: '500' },
});
