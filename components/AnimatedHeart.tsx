import { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

// Like heart with a small, calm animation: a quick pop with a soft ring when
// it becomes liked, and a tiny dip when it is un-liked. Native driver only.
export default function AnimatedHeart({
  liked,
  size,
  color,
  offColor,
}: {
  liked: boolean;
  size: number;
  color: string;
  offColor: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (liked) {
      scale.setValue(0.6);
      ring.setValue(0);
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, friction: 3.2, tension: 220, useNativeDriver: true }),
        Animated.timing(ring, { toValue: 1, duration: 420, useNativeDriver: true }),
      ]).start();
    } else {
      scale.setValue(0.8);
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 200, useNativeDriver: true }).start();
    }
  }, [liked, scale, ring]);

  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.9] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.45, 0] });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ring,
          { width: size, height: size, borderRadius: size / 2, borderColor: color, opacity: ringOpacity, transform: [{ scale: ringScale }] },
        ]}
      />
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons name={liked ? 'heart' : 'heart-outline'} size={size} color={liked ? color : offColor} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', borderWidth: 2 },
});
