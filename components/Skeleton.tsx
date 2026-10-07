import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, DimensionValue } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/lib/ThemeContext';
import { spacing } from '@/lib/theme';

// The base shimmer primitive. A plain gray box reads as "broken" — the
// moving highlight is what reads as "loading" instead. Each box runs its
// own independent shimmer loop rather than sharing one animated value
// across the screen; simpler, and staggered-looking shimmer across
// several boxes actually looks livelier than perfectly synced ones.
export function SkeletonBox({
  width = '100%',
  height,
  borderRadius = 8,
  style,
}: {
  width?: DimensionValue;
  height: number;
  borderRadius?: number;
  style?: any;
}) {
  const { colors } = useTheme();
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(Animated.timing(shimmer, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const translateX = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-220, 220] });

  return (
    <View style={[{ width, height, borderRadius, backgroundColor: colors.inputBg, overflow: 'hidden' }, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, { width: 220, transform: [{ translateX }] }]}>
        <LinearGradient
          colors={[colors.bg + '00', colors.border + 'B3', colors.bg + '00']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

// A post/repost-shaped card: avatar, name line, timestamp line, two body
// lines, and (optionally) a media block — matches PostCard's real layout
// closely enough that the swap-in when real content arrives doesn't jump.
export function PostSkeleton({ withMedia = false }: { withMedia?: boolean }) {
  return (
    <View style={styles.postRow}>
      <SkeletonBox width={44} height={44} borderRadius={22} />
      <View style={{ flex: 1 }}>
        <View style={styles.row}>
          <SkeletonBox width={120} height={14} borderRadius={4} />
          <SkeletonBox width={40} height={12} borderRadius={4} />
        </View>
        <View style={{ marginTop: 8, gap: 6 }}>
          <SkeletonBox width="92%" height={13} borderRadius={4} />
          <SkeletonBox width="68%" height={13} borderRadius={4} />
        </View>
        {withMedia && <SkeletonBox width="100%" height={180} borderRadius={14} style={{ marginTop: 10 }} />}
        <View style={[styles.row, { marginTop: 12, gap: 24 }]}>
          <SkeletonBox width={36} height={12} borderRadius={4} />
          <SkeletonBox width={36} height={12} borderRadius={4} />
          <SkeletonBox width={36} height={12} borderRadius={4} />
        </View>
      </View>
    </View>
  );
}

export function FeedSkeleton({ count = 5 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <PostSkeleton key={i} withMedia={i % 3 === 1} />
      ))}
    </View>
  );
}

// A row-shaped skeleton for lists of people/threads: avatar + two lines —
// covers messages, notifications, search results, and the following list.
export function RowSkeleton() {
  return (
    <View style={styles.postRow}>
      <SkeletonBox width={44} height={44} borderRadius={22} />
      <View style={{ flex: 1, gap: 6 }}>
        <SkeletonBox width={140} height={14} borderRadius={4} />
        <SkeletonBox width={100} height={12} borderRadius={4} />
      </View>
    </View>
  );
}

export function ListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <RowSkeleton key={i} />
      ))}
    </View>
  );
}

// Matches user/[id].tsx's hero: big avatar, name, username, bio, stats.
export function ProfileHeaderSkeleton() {
  return (
    <View style={{ alignItems: 'center', paddingTop: 100, paddingHorizontal: spacing.lg }}>
      <SkeletonBox width={96} height={96} borderRadius={48} />
      <SkeletonBox width={160} height={20} borderRadius={5} style={{ marginTop: 16 }} />
      <SkeletonBox width={110} height={14} borderRadius={4} style={{ marginTop: 8 }} />
      <SkeletonBox width={220} height={13} borderRadius={4} style={{ marginTop: 14 }} />
      <View style={[styles.row, { marginTop: 18, gap: 28 }]}>
        <SkeletonBox width={70} height={14} borderRadius={4} />
        <SkeletonBox width={70} height={14} borderRadius={4} />
      </View>
    </View>
  );
}

// A single full-bleed video-page-shaped block, for the Reels tab's first
// load — a dark card rather than a blank screen.
export function ReelSkeleton({ height }: { height: number }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.reelBox, { height, backgroundColor: colors.card }]}>
      <SkeletonBox width={56} height={56} borderRadius={28} style={{ backgroundColor: colors.inputBg }} />
    </View>
  );
}

const styles = StyleSheet.create({
  postRow: { flexDirection: 'row', gap: 12, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center' },
  reelBox: { width: '100%', alignItems: 'center', justifyContent: 'center' },
});
