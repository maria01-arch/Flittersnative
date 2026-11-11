import { View, Image, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import Text from '@/components/AppText';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/lib/ThemeContext';
import { usePreferences } from '@/lib/PreferencesContext';
import { openLink } from '@/lib/openLink';
import { spacing } from '@/lib/theme';
import GlassShimmerButton from './GlassShimmerButton';
import OptImage from './OptImage';
import { trackAd } from '@/lib/adTracking';

// A sponsored post, laid out exactly like a normal feed card (round avatar
// on the left, name + text + media on the right) so it blends into the
// feed, with a small "Sponsored" tag and a glassy animated button.
// Same `ads` table as the webapp: advertiser_name, content, image_url,
// video_url, link_url, cta_text.
export default function AdCard({ ad, active }: { ad: any; active?: boolean }) {
  const { colors } = useTheme();
  const { browserEngine } = usePreferences();
  const { width: windowWidth } = useWindowDimensions();
  const mediaWidth = windowWidth - spacing.lg * 2 - 44 - 12;

  const go = () => {
    trackAd(ad.id, 'click');
    if (!ad.link_url) return;
    const url = /^https?:\/\//i.test(ad.link_url) ? ad.link_url : `https://${ad.link_url}`;
    openLink(url, browserEngine);
  };

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
          <TouchableOpacity activeOpacity={ad.link_url ? 0.85 : 1} onPress={go}>
            <OptImage dp={mediaWidth} source={{ uri: ad.image_url }} style={[styles.image, { width: mediaWidth, backgroundColor: colors.border }]} resizeMode="cover" />
          </TouchableOpacity>
        ) : null}
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
  row: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: '#fff', fontWeight: '800', fontSize: 18 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  name: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  tag: { backgroundColor: 'rgba(247,183,49,0.15)', borderColor: 'rgba(247,183,49,0.35)', borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  tagText: { color: '#F7B731', fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  content: { fontSize: 15, lineHeight: 22, marginBottom: 6 },
  image: { height: 220, borderRadius: 12, marginTop: 6 },
});
