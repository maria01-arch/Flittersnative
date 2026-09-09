import { createContext, useContext, useRef } from 'react';
import { Animated } from 'react-native';

export const HIDE_DISTANCE = 90;

type CtxType = {
  scrollY: Animated.Value;
  clamped: Animated.AnimatedInterpolation<number>;
};

const Ctx = createContext<CtxType | null>(null);

export function TabBarVisibilityProvider({ children }: { children: React.ReactNode }) {
  const scrollY = useRef(new Animated.Value(0)).current;
  const clamped = useRef(Animated.diffClamp(scrollY, 0, HIDE_DISTANCE)).current;

  return <Ctx.Provider value={{ scrollY, clamped }}>{children}</Ctx.Provider>;
}

export function useTabBarVisibility() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTabBarVisibility must be used inside TabBarVisibilityProvider');
  return ctx;
}

export function useHideTabBarOnScroll(listener?: (y: number) => void) {
  const { scrollY } = useTabBarVisibility();
  return Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
    useNativeDriver: true,
    listener: listener ? (e: any) => listener(e.nativeEvent.contentOffset.y) : undefined,
  });
}
