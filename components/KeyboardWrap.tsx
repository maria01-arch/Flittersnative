import { KeyboardAvoidingView, Platform, StyleProp, ViewStyle, LayoutChangeEvent } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardPadding } from '@/lib/useKeyboardPadding';

// Screen wrapper that keeps the bottom input bar above the keyboard AND above
// the phone's navigation bar (the 3-button / gesture bar). Same approach as the
// DM screen: on Android the bottom padding is the keyboard height while it is
// up, or the navigation-bar height when it is down.
export default function KeyboardWrap({
  style,
  children,
  onLayout,
  bottomInset,
}: {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  onLayout?: (e: LayoutChangeEvent) => void;
  // Override the space kept above the navigation bar (default: the real one).
  bottomInset?: number;
}) {
  const insets = useSafeAreaInsets();
  const kbStyle = useKeyboardPadding(bottomInset ?? insets.bottom);
  if (Platform.OS === 'ios') {
    return (
      <KeyboardAvoidingView style={style} behavior="padding" onLayout={onLayout}>
        {children}
      </KeyboardAvoidingView>
    );
  }
  return (
    <Animated.View style={[style, kbStyle]} onLayout={onLayout}>
      {children}
    </Animated.View>
  );
}
