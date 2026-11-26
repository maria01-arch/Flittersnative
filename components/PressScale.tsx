import { forwardRef } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

// A drop-in replacement for TouchableOpacity that feels like iOS: the button shrinks a little and dims
// while pressed, then springs back. Same props as TouchableOpacity (activeOpacity, style, hitSlop...).
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  activeOpacity?: number;
  pressedScale?: number;
};

const PressScale = forwardRef<any, Props>(function PressScale({ style, activeOpacity = 0.7, pressedScale = 0.94, onPressIn, onPressOut, disabled, children, ...rest }, ref) {
  const pressed = useSharedValue(0);
  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (1 - pressedScale) * pressed.value }],
    opacity: 1 - (1 - activeOpacity) * pressed.value,
  }));
  return (
    <AnimatedPressable
      ref={ref}
      disabled={disabled}
      {...rest}
      onPressIn={(e) => { pressed.value = withTiming(1, { duration: 90 }); onPressIn?.(e); }}
      onPressOut={(e) => { pressed.value = withSpring(0, { damping: 14, stiffness: 260, mass: 0.6 }); onPressOut?.(e); }}
      style={[style, anim]}>
      {children as any}
    </AnimatedPressable>
  );
});

export default PressScale;
