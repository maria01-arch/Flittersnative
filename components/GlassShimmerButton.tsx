import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, TouchableOpacity, View, StyleSheet, LayoutChangeEvent } from 'react-native';
import Text from '@/components/AppText';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';

// A long, see-through call-to-action: a faint tint, a thin outline, and a
// streak of light that sweeps across it every few seconds. No glow, no
// pulsing. The streak and label use the tint colour so it shows up on both
// light and dark themes. Runs on the native driver.
export default function GlassShimmerButton({
  label,
  onPress,
  tint = ['#5B9CF6', '#845EF7'],
}: {
  label: string;
  onPress: () => void;
  tint?: [string, string];
}) {
  const [width, setWidth] = useState(0);
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!width) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(1800),
        Animated.timing(sweep, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [width, sweep]);

  const STREAK = 60;
  const translateX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-STREAK * 2, width + STREAK] });
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      onLayout={onLayout}
      style={[styles.button, { backgroundColor: tint[0] + '14', borderColor: tint[0] + '80' }]}
    >
      <Animated.View style={[styles.streakWrap, { width: STREAK, transform: [{ translateX }, { skewX: '-20deg' }] }]} pointerEvents="none">
        <LinearGradient
          colors={[tint[0] + '00', tint[0] + '55', tint[1] + '00']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Text style={[styles.label, { color: tint[0] }]}>{label}</Text>
      <Ionicons name="arrow-forward" size={15} color={tint[0]} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1.2,
  },
  streakWrap: { position: 'absolute', top: -6, bottom: -6, left: 0 },
  label: { fontSize: 14, fontWeight: '800', letterSpacing: 0.2 },
});
