import { useEffect, useMemo, useRef } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Path, Polyline, Defs, LinearGradient, Stop, RadialGradient, Circle } from 'react-native-svg';

// Big animated verified badge: the seal turns around its vertical axis,
// floats gently, and keeps releasing little stars. Blue for Basic, gold for
// Premium. Everything uses the native driver so it stays smooth.
const SEAL = 'M12 2L14.4 4.8L18 4L18.8 7.6L22 9.2L20.4 12.6L22 16L18.8 17.6L18 21.2L14.4 20.4L12 23.2L9.6 20.4L6 21.2L5.2 17.6L2 16L3.6 12.6L2 9.2L5.2 7.6L6 4L9.6 4.8Z';
const STAR = 'M12 0 L14.2 9.8 L24 12 L14.2 14.2 L12 24 L9.8 14.2 L0 12 L9.8 9.8 Z';
const COUNT = 10;

const THEME = {
  basic: { a: '#5AA9FF', b: '#1877F2', c: '#0B4BB5', star: '#7DB8FF', glow: '#1877F2' },
  premium: { a: '#FFE27A', b: '#F5B301', c: '#B37A00', star: '#FFD84D', glow: '#F5B301' },
};

function Star({ size, angle, delay, color, radius }: { size: number; angle: number; delay: number; color: string; radius: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(t, { toValue: 1, duration: 2200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const rad = (angle * Math.PI) / 180;
  const dx = Math.cos(rad) * radius;
  const dy = Math.sin(rad) * radius;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        opacity: t.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 0.8, 0] }),
        transform: [
          { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [dx * 0.45, dx] }) },
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [dy * 0.45, dy] }) },
          { scale: t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.2, 1, 0.4] }) },
          { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '120deg'] }) },
        ],
      }}
    >
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d={STAR} fill={color} />
      </Svg>
    </Animated.View>
  );
}

export default function AnimatedBadge({ plan, size = 150 }: { plan: 'basic' | 'premium'; size?: number }) {
  const th = THEME[plan];
  const spin = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const s = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 4200, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }));
    const f = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    const p = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ])
    );
    s.start();
    f.start();
    p.start();
    return () => {
      s.stop();
      f.stop();
      p.stop();
    };
  }, []);

  const stars = useMemo(
    () => Array.from({ length: COUNT }, (_, i) => ({ angle: i * (360 / COUNT) + (i % 2 ? 12 : -8), delay: i * 220, sz: i % 3 === 0 ? 20 : 13, r: size * (i % 2 ? 0.78 : 0.95) })),
    [size]
  );
  const box = size * 2.1;
  const id = `g_${plan}`;

  return (
    <View style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.75] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.1] }) }],
        }}
      >
        <Svg width={size * 1.9} height={size * 1.9} viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id={`${id}_glow`} cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={th.glow} stopOpacity="0.55" />
              <Stop offset="100%" stopColor={th.glow} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx="50" cy="50" r="50" fill={`url(#${id}_glow)`} />
        </Svg>
      </Animated.View>

      {stars.map((s, i) => (
        <Star key={i} size={s.sz} angle={s.angle} delay={s.delay} color={th.star} radius={s.r} />
      ))}

      <Animated.View
        style={{
          transform: [
            { perspective: 900 },
            { translateY: float.interpolate({ inputRange: [0, 1], outputRange: [-7, 7] }) },
            { rotateY: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
          ],
        }}
      >
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={th.a} />
              <Stop offset="0.55" stopColor={th.b} />
              <Stop offset="1" stopColor={th.c} />
            </LinearGradient>
          </Defs>
          <Path d={SEAL} fill={`url(#${id})`} />
          <Polyline points="8,12.5 10.5,15 16,9" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Animated.View>
    </View>
  );
}
