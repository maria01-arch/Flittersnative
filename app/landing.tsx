import { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Image, Dimensions } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { spacing } from '@/lib/theme';

const { height: SCREEN_H } = Dimensions.get('window');

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
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <Image source={require('../assets/images/flitters-logo.png')} style={styles.logo} resizeMode="contain" />
        </Animated.View>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <Text style={[styles.title, { color: colors.text }]}>Flitters</Text>
          <Text style={[styles.tagline, { color: colors.subtext }]}>Where your voice takes flight</Text>
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
  hero: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  logo: { width: 132, height: 132, marginBottom: 20 },
  title: { fontSize: 38, fontWeight: '900', textAlign: 'center', letterSpacing: -1.5 },
  tagline: { fontSize: 16, textAlign: 'center', marginTop: 10 },
  primaryBtn: { borderRadius: 16, paddingVertical: 17, alignItems: 'center', marginBottom: 12 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: { borderRadius: 16, paddingVertical: 17, alignItems: 'center', borderWidth: 1.5 },
  secondaryBtnText: { fontSize: 16, fontWeight: '700' },
});
