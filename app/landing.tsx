import { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Image, Dimensions } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { spacing } from '@/lib/theme';

const { height: SCREEN_H } = Dimensions.get('window');

// 8-direction offset ring, 2px out — enough to read as a clean outline at
// this logo's size without thickening the thin parts (the "f" swash) into
// a blob.
const OUTLINE_OFFSETS: [number, number][] = [
  [-2, -2], [0, -2], [2, -2],
  [-2, 0], [2, 0],
  [-2, 2], [0, 2], [2, 2],
];

export default function LandingScreen() {
  const { colors, isDark } = useTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 650, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 650, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.hero}>
        <Animated.View style={[styles.logoWrap, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          {/* A true outline traces the logo's own silhouette, not a
              bounding-box shape behind it (that was the circle — wrong,
              removed). A single PNG can't get a CSS-style border since
              its edge is irregular, so this fakes one the way image
              editors do it: the same artwork, tinted solid black via
              tintColor (which preserves the alpha shape, not the
              rectangle), repeated at small offsets in every direction,
              stacked behind the real full-color logo on top. Light mode
              only — dark mode's own dark background already gives the
              light parts of the logo something to contrast against. */}
          {!isDark && (
            <View style={styles.logoOutline} pointerEvents="none">
              {OUTLINE_OFFSETS.map(([dx, dy], i) => (
                <Image
                  key={i}
                  source={require('../assets/images/flitters-logo.png')}
                  style={[styles.logo, styles.logoOutlineCopy, { tintColor: '#000', left: dx, top: dy }]}
                  resizeMode="contain"
                />
              ))}
            </View>
          )}
          <Image source={require('../assets/images/flitters-logo.png')} style={styles.logo} resizeMode="contain" />
        </Animated.View>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <Text style={[styles.title, { color: colors.text }]}>Connect. Share. Flit.</Text>
          <Text style={[styles.tagline, { color: colors.subtext }]}>
            Join Flitters and start sharing moments, stories, and conversations with people who get you
          </Text>
        </Animated.View>
      </View>

      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }], width: '100%' }}>
        <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={() => router.push('/signup')}>
          <Text style={styles.primaryBtnText}>Create Account</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.secondaryBtn, { borderColor: colors.border }]} onPress={() => router.push('/login')}>
          <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Log In</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // No header on this screen (see app/_layout.tsx) — an earlier version had
  // a default native header bar reserving space above this just to show
  // the literal route name "landing", which is what was eating the top of
  // the screen for no reason.
  container: { flex: 1, padding: spacing.xl, paddingTop: Math.max(60, SCREEN_H * 0.08), paddingBottom: 50 },
  // paddingBottom pushes the centered block up a little from true center.
  hero: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 64 },
  logoWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  logo: { width: 132, height: 132 },
  logoOutline: { position: 'absolute', width: 132, height: 132 },
  logoOutlineCopy: { position: 'absolute' },
  title: { fontSize: 38, fontWeight: '900', textAlign: 'center', letterSpacing: -1.5 },
  tagline: { fontSize: 16, lineHeight: 23, textAlign: 'center', marginTop: 12, paddingHorizontal: spacing.md },
  primaryBtn: { borderRadius: 16, paddingVertical: 17, alignItems: 'center', marginBottom: 12 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: { borderRadius: 16, paddingVertical: 17, alignItems: 'center', borderWidth: 1.5 },
  secondaryBtnText: { fontSize: 16, fontWeight: '700' },
});
