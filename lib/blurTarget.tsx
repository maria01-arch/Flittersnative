import { createContext, forwardRef, ReactNode, RefObject, useContext } from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import * as ExpoBlur from 'expo-blur';

// Android can only blur what is wrapped in a "blur target". The chat screens
// wrap their content in <BlurTarget> and share its ref through this context;
// the long-press menu then blurs exactly that content. If the installed
// expo-blur has no BlurTargetView, this is a plain View and the menu falls
// back to a heavy dim instead (no crash).
const NativeTarget: any = (ExpoBlur as any).BlurTargetView || null;
export const blurTargetSupported = !!NativeTarget;

export const BlurTargetContext = createContext<RefObject<any> | null>(null);
export const useBlurTarget = () => useContext(BlurTargetContext);

export const BlurTarget = forwardRef<any, { style?: StyleProp<ViewStyle>; children?: ReactNode }>(function BlurTarget({ style, children }, ref) {
  const C: any = NativeTarget || View;
  return (
    <C ref={ref} style={style}>
      {children}
    </C>
  );
});
