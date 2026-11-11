import { Platform, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Behind the phone's clock/battery.
// iPhone: a light blur with no colour, which iOS does properly.
// Android: nothing — the status bar is simply transparent. The only blur
// Android can do here is an experimental mode that draws a visible band with
// a hard edge, which looked worse than no blur at all, and a soft fading
// edge would need an extra graphics library. Content shows through cleanly.
export default function StatusBarScrim() {
  const insets = useSafeAreaInsets();
  if (Platform.OS !== 'ios' || !insets.top) return null;
  return <BlurView intensity={14} tint="default" style={[styles.wrap, { height: insets.top }]} pointerEvents="none" />;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 15, backgroundColor: 'transparent' },
});
