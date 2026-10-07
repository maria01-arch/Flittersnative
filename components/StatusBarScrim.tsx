import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';

// Rebuilt from scratch (the earlier versions were patched over each other).
//
// Why the old ones showed an edge: they stacked a BlurView rectangle AND a
// gradient in the status area, then AppTopBar stacked its own BlurView
// rectangle AND its own gradient on top — four layers, each with its own
// hard boundary. And on Android the BlurView isn't really blurring anyway,
// it behaves like a flat see-through rectangle, so every one of those
// boundaries was a visible line.
//
// The fix is fewer layers, not more tuning: this is ONE gradient in the
// theme's own background color, and nothing else. It stays solid-ish
// where the clock/battery (or header content) sits, then eases out to
// fully transparent using a cosine curve. A cosine ease has zero slope at
// both ends, which is what makes the top and the bottom of the fade
// invisible — a linear fade has a sudden change of slope at each end, and
// that change is what the eye reads as an "edge".
export function fadeStops(hex: string, maxAlpha: number, plateau: number, steps = 14) {
  const colors: string[] = [];
  const locations: number[] = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    let a = maxAlpha;
    if (t > plateau) {
      const u = (t - plateau) / (1 - plateau);
      a = maxAlpha * 0.5 * (1 + Math.cos(Math.PI * u)); // 1 -> 0, flat at both ends
    }
    colors.push(hex + Math.round(a * 255).toString(16).padStart(2, '0'));
    locations.push(t);
  }
  return { colors: colors as unknown as [string, string, ...string[]], locations: locations as unknown as [number, number, ...number[]] };
}

const SCRIM_TAIL = 14; // was 36 — extended noticeably past the status bar itself

// Always-on fade behind the system status bar, for screens with no header
// of their own, and for the home feed while its header is slid away.
// Opacity lowered per feedback — it was reading as too heavy/muddy.
export default function StatusBarScrim() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const stops = useMemo(() => fadeStops(colors.bg, 0.45, 0.4), [colors.bg]);
  if (!insets.top) return null;
  return <LinearGradient colors={stops.colors} locations={stops.locations} style={[styles.wrap, { height: insets.top + SCRIM_TAIL }]} pointerEvents="none" />;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 15 },
});
