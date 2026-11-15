import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable, Image, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';
import { ChatTheme, WALLPAPER_PRESETS, BUBBLE_STYLES, resolveBubble, pickWallpaper } from '@/lib/chatTheme';

// Verified members: 4 wallpaper presets or one of their own pictures, and a
// colour or gradient for their own bubbles (navy is the default for everyone). Changes apply at once
// and only on this phone.
export default function ChatThemeSheet({
  visible,
  onClose,
  conversationId,
  theme,
  onChange,
  verified,
  onReset,
  note,
}: {
  visible: boolean;
  onClose: () => void;
  conversationId: string;
  theme: ChatTheme;
  onChange: (t: ChatTheme) => void;
  verified: boolean;
  // Shown only for a single chat: drops that chat's own theme and goes back to the default from Settings.
  onReset?: () => void;
  note?: string;
}) {
  const { colors } = useTheme();
  const w = theme.wallpaper;
  const tile = { width: 64, height: 88, borderRadius: 12, borderWidth: 2 };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.card }]} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={[styles.title, { color: colors.text }]}>Chat theme</Text>
          {!verified ? (
            <Text style={{ color: colors.subtext, textAlign: 'center', lineHeight: 20, paddingVertical: 16 }}>
              Custom wallpapers and bubble colours are for verified members.
            </Text>
          ) : (
            <>
              <Text style={[styles.label, { color: colors.subtext }]}>Wallpaper</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
                <TouchableOpacity onPress={() => onChange({ ...theme, wallpaper: { kind: 'none' } })} style={[tile, { borderColor: w.kind === 'none' ? colors.primary : colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }]}>
                  <Ionicons name="close" size={20} color={colors.subtext} />
                  <Text style={{ color: colors.subtext, fontSize: 10, marginTop: 2 }}>None</Text>
                </TouchableOpacity>
                {WALLPAPER_PRESETS.map((p) => (
                  <TouchableOpacity key={p.id} onPress={() => onChange({ ...theme, wallpaper: { kind: 'preset', id: p.id } })}>
                    <LinearGradient colors={p.colors} style={[tile, { borderColor: w.kind === 'preset' && w.id === p.id ? colors.primary : 'transparent' }]} />
                    <Text style={{ color: colors.subtext, fontSize: 10, textAlign: 'center', marginTop: 2 }}>{p.name}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  onPress={async () => {
                    const uri = await pickWallpaper(conversationId);
                    if (uri) onChange({ ...theme, wallpaper: { kind: 'upload', uri } });
                  }}
                  style={[tile, { borderColor: w.kind === 'upload' ? colors.primary : colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.bg }]}
                >
                  {w.kind === 'upload' ? <Image source={{ uri: w.uri }} style={StyleSheet.absoluteFill} /> : <Ionicons name="image-outline" size={22} color={colors.subtext} />}
                  <Text style={{ color: w.kind === 'upload' ? '#fff' : colors.subtext, fontSize: 10, marginTop: 2 }}>Upload</Text>
                </TouchableOpacity>
              </ScrollView>

              {w.kind === 'upload' && (
                <>
                  <Text style={[styles.label, { color: colors.subtext, marginTop: 18 }]}>Wallpaper brightness</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {([['Bright', 0.05], ['Soft', 0.25], ['Dim', 0.5], ['Dark', 0.7]] as const).map(([label, v]) => (
                      <TouchableOpacity
                        key={label}
                        onPress={() => onChange({ ...theme, dim: v })}
                        style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 16, backgroundColor: Math.abs(theme.dim - v) < 0.01 ? colors.primary : colors.inputBg }}
                      >
                        <Text style={{ color: Math.abs(theme.dim - v) < 0.01 ? '#fff' : colors.text, fontWeight: '700', fontSize: 12 }}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <Text style={[styles.label, { color: colors.subtext, marginTop: 18 }]}>Your bubble colour</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingVertical: 6 }}>
                {BUBBLE_STYLES.map((b) => {
                  const look = resolveBubble(b.id, colors.primary);
                  const picked = (theme.bubble === 'navy' ? 'default' : theme.bubble) === b.id;
                  return (
                    <TouchableOpacity key={b.id} onPress={() => onChange({ ...theme, bubble: b.id })} style={{ alignItems: 'center', width: 54 }}>
                      <View style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 3, borderColor: picked ? colors.text : 'transparent', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: look.color }}>
                        {look.gradient && <LinearGradient colors={look.gradient as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
                        {picked && <Ionicons name="checkmark" size={20} color="#fff" />}
                      </View>
                      <Text style={{ color: colors.subtext, fontSize: 10, marginTop: 3, textAlign: 'center' }} numberOfLines={1}>{b.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={{ color: colors.faint, fontSize: 12, marginTop: 10 }}>{note || 'Only you see these changes.'}</Text>
              {onReset && (
                <TouchableOpacity onPress={onReset} style={{ marginTop: 12 }}>
                  <Text style={{ color: colors.primary, fontWeight: '700' }}>Use my default theme</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingBottom: 30, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(128,128,128,0.4)', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
});
