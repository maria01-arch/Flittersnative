import { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import Text from '@/components/AppText';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';
import { spacing } from '@/lib/theme';
import { ACCENTS, SURFACES } from '@/lib/appThemes';
import { useAuth } from '@/lib/AuthContext';
import { isVerifiedUser } from '@/lib/postActions';

// App theme: pick light / dark, an accent colour and a background style. The
// preview card at the top shows the result instantly. Saved on this phone.
export default function AppThemeScreen() {
  const { colors, mode, setMode, isDark, accent, setAccent, surface, setSurface, resetAppTheme } = useTheme();
  const { session } = useAuth();
  const [verified, setVerified] = useState<boolean | null>(null);
  useEffect(() => { isVerifiedUser(session?.user?.id).then(setVerified); }, [session?.user?.id]);
  // Light / Dark / System is for everyone; accent and background are for verified accounts (like chat themes).
  const locked = verified === false;
  const sel = (on: boolean) => (on ? { backgroundColor: colors.primary, borderColor: colors.primary } : { borderColor: colors.border });
  const selText = (on: boolean) => ({ color: on ? '#fff' : colors.text });

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>App theme</Text>
        <TouchableOpacity onPress={resetAppTheme} hitSlop={10}>
          <Text style={{ color: colors.primary, fontWeight: '700' }}>Reset</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        {/* Live preview */}
        <View style={[styles.preview, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={[styles.pAvatar, { backgroundColor: colors.primary }]}><Text style={{ color: '#fff', fontWeight: '800' }}>F</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>Flitters</Text>
              <Text style={{ color: colors.subtext, fontSize: 12 }}>@flitters · now</Text>
            </View>
            <View style={[styles.pBtn, { backgroundColor: colors.primary }]}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Follow</Text></View>
          </View>
          <Text style={{ color: colors.text, marginTop: 10, lineHeight: 21 }}>This is how posts will look. <Text style={{ color: colors.primary }}>#yourcolour</Text></Text>
          <View style={{ flexDirection: 'row', gap: 22, marginTop: 10 }}>
            <Ionicons name="chatbubble-outline" size={17} color={colors.faint} />
            <Ionicons name="heart" size={17} color={colors.like} />
            <Ionicons name="bookmark" size={17} color={colors.primary} />
          </View>
          <View style={[styles.pInput, { backgroundColor: colors.inputBg }]}><Text style={{ color: colors.faint }}>Write something…</Text></View>
        </View>

        {locked ? (
          <View style={[styles.lockBox, { backgroundColor: colors.inputBg }]}>
            <Ionicons name="lock-closed" size={16} color={colors.primary} />
            <Text style={{ color: colors.text, flex: 1, fontSize: 13, lineHeight: 18 }}>Accent colours and backgrounds are for verified accounts. Light, dark and system mode are open to everyone.</Text>
          </View>
        ) : null}

        <Text style={[styles.label, { color: colors.subtext }]}>MODE</Text>
        <View style={styles.row}>
          {(['light', 'dark', 'system'] as const).map((m) => (
            <TouchableOpacity key={m} onPress={() => setMode(m)} style={[styles.opt, sel(mode === m)]}>
              <Text style={[styles.optText, selText(mode === m)]}>{m === 'light' ? 'Light' : m === 'dark' ? 'Dark' : 'System'}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.label, { color: colors.subtext }]}>ACCENT COLOUR</Text>
        <View style={[styles.swatchWrap, locked && { opacity: 0.45 }]} pointerEvents={locked ? 'none' : 'auto'}>
          {ACCENTS.map((a) => {
            const c = isDark ? a.dark : a.light;
            const on = accent === a.id;
            return (
              <TouchableOpacity key={a.id} onPress={() => setAccent(a.id)} style={styles.swatchCol} accessibilityLabel={a.name}>
                <View style={[styles.swatch, { backgroundColor: c, borderColor: on ? colors.text : 'transparent' }]}>
                  {on ? <Ionicons name="checkmark" size={20} color="#fff" /> : null}
                </View>
                <Text style={{ color: on ? colors.text : colors.subtext, fontSize: 11, fontWeight: on ? '700' : '500' }}>{a.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={[styles.label, { color: colors.subtext }]}>BACKGROUND</Text>
        <View style={locked ? { opacity: 0.45 } : undefined} pointerEvents={locked ? 'none' : 'auto'}>
        {SURFACES.map((s) => {
          const on = surface === s.id;
          return (
            <TouchableOpacity key={s.id} onPress={() => setSurface(s.id)} style={[styles.surfaceRow, { borderColor: on ? colors.primary : colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>{s.name}</Text>
                <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>{s.hint}</Text>
              </View>
              {on ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
            </TouchableOpacity>
          );
        })}
        </View>
        {surface === 'black' && !isDark ? <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 6 }}>Pure black shows when the app is in dark mode.</Text> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingHorizontal: spacing.lg, paddingBottom: 12, borderBottomWidth: 1 },
  title: { fontSize: 16, fontWeight: '700' },
  preview: { borderWidth: 1, borderRadius: 16, padding: 14 },
  pAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  pBtn: { borderRadius: 14, paddingVertical: 6, paddingHorizontal: 14 },
  pInput: { borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14, marginTop: 12 },
  lockBox: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 12, marginTop: 14 },
  label: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, marginTop: 24, marginBottom: 10 },
  row: { flexDirection: 'row', gap: 8 },
  opt: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 12, borderWidth: 1 },
  optText: { fontWeight: '700' },
  swatchWrap: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
  swatchCol: { width: '25%', alignItems: 'center', gap: 5 },
  swatch: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  swatchSm: { width: 36, height: 36, borderRadius: 18, borderWidth: 3 },
  hexInput: { flex: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  useBtn: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 18 },
  surfaceRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 14, padding: 14, marginBottom: 10 },
});
