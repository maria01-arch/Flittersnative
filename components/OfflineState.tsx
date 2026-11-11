import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Text from '@/components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { spacing } from '@/lib/theme';

// Full-page message for "the feed could not be loaded and there is nothing
// saved to show" — instead of a blank page or a misleading "No posts yet".
export function OfflinePage({ offline, onRetry }: { offline: boolean; onRetry: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.page}>
      <Ionicons name={offline ? 'cloud-offline-outline' : 'alert-circle-outline'} size={64} color={colors.faint} />
      <Text style={[styles.title, { color: colors.text }]}>{offline ? "You're offline" : "Can't reach Flitters"}</Text>
      <Text style={[styles.body, { color: colors.subtext }]}>
        {offline ? 'Check your connection and try again. Posts you saved are still available to read.' : 'The connection is weak or the server is slow. Try again in a moment. Posts you saved are still available to read.'}
      </Text>
      <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={onRetry}>
        <Text style={styles.btnText}>Try again</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.btn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border }]} onPress={() => router.push('/saved')}>
        <Ionicons name="bookmark-outline" size={16} color={colors.text} />
        <Text style={[styles.btnText, { color: colors.text }]}>Saved posts</Text>
      </TouchableOpacity>
    </View>
  );
}

// Thin strip shown above the feed while showing older, stored posts.
export function OfflineBanner({ offline, onRetry }: { offline: boolean; onRetry: () => void }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onRetry} style={[styles.banner, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Ionicons name={offline ? 'cloud-offline-outline' : 'sync-outline'} size={16} color={colors.subtext} />
      <Text style={{ color: colors.subtext, fontSize: 13, flex: 1 }}>
        {offline ? "You're offline — showing posts from your last visit" : 'Weak connection — showing older posts. Tap to retry'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  page: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 90, gap: 10 },
  title: { fontSize: 20, fontWeight: '800', marginTop: 8 },
  body: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 10 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, minWidth: 170 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: spacing.lg, marginTop: 8, marginBottom: 4, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1 },
});
