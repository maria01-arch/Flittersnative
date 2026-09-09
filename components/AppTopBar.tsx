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
    <Animated.View style={[styles.wrap, { transform: [{ translateY }], opacity }]}>
      <BlurView intensity={65} tint={isDark ? 'dark' : 'light'} style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.push('/settings')}>
          <Image
            source={{ uri: avatarUrl || 'https://placehold.co/80x80/6C5CE7/fff?text=?' }}
            style={[styles.avatar, { borderColor: colors.primary }]}
          />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <View style={{ width: 32 }} />
      </BlurView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20 },
  topBar: {
    paddingTop: 56,
    paddingBottom: 14,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#ddd', borderWidth: 2 },
  title: { fontSize: 21, fontWeight: '900' },
});
