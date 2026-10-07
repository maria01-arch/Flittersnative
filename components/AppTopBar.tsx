import { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Animated, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { spacing } from '@/lib/theme';
import { useTheme } from '@/lib/ThemeContext';
import { useTabBarVisibility, HIDE_DISTANCE } from '@/lib/tab-bar-visibility';

export const TOP_BAR_HEIGHT = Platform.OS === 'ios' ? 100 : 92;

// Simplified back down, on purpose. The fade-tail version was solving a
// problem this bar doesn't actually have: a normal, visible top bar is
// SUPPOSED to have a clean edge — every app's header does. Giving it a
// fade tail too was overreach, and it made an unrelated bug worse: the
// "solid" zone was only 92% opaque, so bright content scrolling underneath
// (a bright image, say) bled through and visibly merged with the header's
// own text. That's the actual bug from the last screenshot, not the fade
// shape. Real blur (a proper frosted-glass bar, not a flat tinted
// rectangle) plus a solid-enough backing color fixes both: the backing
// color is opaque enough that nothing bleeds through, and the blur is
// what makes it read as glass instead of a flat card.
// The soft, edge-free fade is StatusBarScrim's job — used here only once
// this bar has slid fully away, and on any screen with no bar at all.
export default function AppTopBar({ title }: { title: string }) {
  const { colors, isDark } = useTheme();
  const { session } = useAuth();
  const { clamped } = useTabBarVisibility();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user?.id) return;
    supabase.from('profiles').select('avatar_url').eq('id', session.user.id).single().then(({ data }) => {
      setAvatarUrl(data?.avatar_url || null);
    });
  }, [session]);

  const translateY = clamped.interpolate({ inputRange: [0, HIDE_DISTANCE], outputRange: [0, -TOP_BAR_HEIGHT] });
  const opacity = clamped.interpolate({ inputRange: [0, HIDE_DISTANCE], outputRange: [1, 0] });

  return (
    <Animated.View style={[styles.wrap, { height: TOP_BAR_HEIGHT, transform: [{ translateY }], opacity }]}>
      <BlurView intensity={85} tint={isDark ? 'dark' : 'light'} style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg + 'E6' }]} />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.push('/settings')}>
          <Image source={{ uri: avatarUrl || 'https://placehold.co/80x80/6C5CE7/fff?text=?' }} style={[styles.avatar, { borderColor: colors.primary }]} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <View style={{ width: 32 }} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, overflow: 'hidden' },
  topBar: {
    height: TOP_BAR_HEIGHT,
    paddingTop: 56,
    paddingBottom: 14,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#ddd', borderWidth: 2 },
  title: { fontSize: 21, fontWeight: '900' },
});
