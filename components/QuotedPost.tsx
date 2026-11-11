import { View, Image, TouchableOpacity, StyleSheet } from 'react-native';
import Text from '@/components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';
import { useVideoThumb } from '@/lib/videoThumb';
import Avatar from './Avatar';
import OptImage from './OptImage';
import VerifiedBadge from './VerifiedBadge';

// Compact, read-only copy of a post shown inside a quote repost (and inside
// the quote composer). The whole card is one tap target that opens the
// original post — same idea as the webapp's QuotedPostPreview.
export default function QuotedPost({ post, onPress }: { post: any; onPress?: () => void }) {
  const { colors } = useTheme();
  const thumb = useVideoThumb(post.video_url || null);
  const a = post.author || {};
  const pic = post.image_url || thumb?.uri;
  return (
    <TouchableOpacity activeOpacity={onPress ? 0.8 : 1} onPress={onPress} style={[styles.card, { borderColor: colors.border }]}>
      <View style={styles.head}>
        <Avatar uri={a.avatar_url} size={20} />
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {a.display_name || 'Unknown'}
        </Text>
        <VerifiedBadge verified={a.verified} isAuthentic={a.is_authentic} plan={a.verified_plan} size={11} />
        <Text style={[styles.user, { color: colors.subtext }]} numberOfLines={1}>
          @{a.username || 'unknown'}
        </Text>
      </View>
      {!!post.content && (
        <Text style={[styles.text, { color: colors.text }]} numberOfLines={4}>
          {post.content}
        </Text>
      )}
      {!!pic && (
        <View style={styles.mediaWrap}>
          <OptImage dp={320} source={{ uri: pic }} style={styles.media} resizeMode="cover" />
          {!!post.video_url && (
            <View style={styles.play}>
              <Ionicons name="play" size={14} color="#fff" style={{ marginLeft: 2 }} />
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 10, marginTop: 8, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  name: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  user: { fontSize: 12, flexShrink: 1 },
  text: { fontSize: 14, lineHeight: 20 },
  mediaWrap: { marginTop: 8, borderRadius: 10, overflow: 'hidden', backgroundColor: '#000' },
  media: { width: '100%', height: 170 },
  play: { position: 'absolute', top: '50%', left: '50%', marginTop: -18, marginLeft: -18, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
});
