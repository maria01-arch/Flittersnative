import { useEffect, useRef } from 'react';
import { View, Animated, Easing, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Avatar from '@/components/Avatar';
import { useTheme } from '@/lib/ThemeContext';
import { useRing } from '@/lib/momentRings';

// A profile picture that shows a glowing ring when the person has a live moment.
//   - not watched yet: bright gradient ring with a soft pulsing glow
//   - already watched: thin grey ring
//   - no moment: just the picture (same size as before, nothing shifts)
// Tapping the picture of someone with a moment opens it (unless `noTap`).
export default function RingAvatar({
  userId,
  uri,
  size,
  noTap,
  onPressNoRing,
}: {
  userId?: string | null;
  uri?: string | null;
  size: number;
  noTap?: boolean;
  onPressNoRing?: () => void;
}) {
  const { colors } = useTheme();
  const ring = useRing(userId);
  const pulse = useRef(new Animated.Value(0)).current;
  const unseen = !!ring?.unseen;

  useEffect(() => {
    if (!unseen) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [unseen, pulse]);

  if (!ring) {
    if (onPressNoRing) {
      return (
        <TouchableOpacity activeOpacity={0.9} onPress={onPressNoRing}>
          <Avatar uri={uri} size={size} />
        </TouchableOpacity>
      );
    }
    return <Avatar uri={uri} size={size} />;
  }

  const gap = Math.max(1.5, size * 0.03);
  const stroke = Math.max(2, size * 0.04);
  const outer = size + (gap + stroke) * 2;
  const open = () => userId && router.push(`/moment/${userId}`);

  const body = (
    <View style={{ width: outer, height: outer, alignItems: 'center', justifyContent: 'center', margin: -(gap + stroke) }}>
      {unseen ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: outer + 3,
            height: outer + 3,
            borderRadius: (outer + 3) / 2,
            backgroundColor: '#FF3D9A',
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.26] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }],
          }}
        />
      ) : null}
      {unseen ? (
        <LinearGradient
          colors={['#FFB800', '#FF3D9A', '#7B5CFF']}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          style={[StyleSheet.absoluteFillObject, { borderRadius: outer / 2 }]}
        />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, { borderRadius: outer / 2, backgroundColor: colors.border }]} />
      )}
      <View style={{ width: size + gap * 2, height: size + gap * 2, borderRadius: (size + gap * 2) / 2, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Avatar uri={uri} size={size} />
      </View>
    </View>
  );

  if (noTap) return body;
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={open}>
      {body}
    </TouchableOpacity>
  );
}
