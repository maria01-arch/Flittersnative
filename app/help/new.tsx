import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Alert } from 'react-native';
import Text from '@/components/AppText';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';
import { spacing } from '@/lib/theme';
import KeyboardWrap from '@/components/KeyboardWrap';
import { CATEGORY_LABELS, createTicket } from '@/lib/health';

export default function NewTicket() {
  const { colors } = useTheme();
  const [category, setCategory] = useState<string>('bug');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (busy) return;
    if (subject.trim().length < 3) { Alert.alert('Add a title', 'Give your request a short title (at least 3 characters).'); return; }
    if (body.trim().length < 10) { Alert.alert('Add some detail', 'Tell us what happened in at least 10 characters.'); return; }
    setBusy(true);
    const r = await createTicket(category, subject.trim(), body.trim());
    setBusy(false);
    if (r.error || !r.data) { Alert.alert("Couldn't send your request", r.error || 'Try again.'); return; }
    router.replace(`/help/ticket/${r.data}`);
  };

  return (
    <KeyboardWrap style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Contact support</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { color: colors.subtext }]}>What is this about?</Text>
        <View style={styles.wrap}>
          {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
            <TouchableOpacity key={k} onPress={() => setCategory(k)} style={[styles.chip, { borderColor: category === k ? colors.primary : colors.border, backgroundColor: category === k ? colors.primary + '22' : 'transparent' }]}>
              <Text style={{ color: category === k ? colors.primary : colors.subtext, fontWeight: '600', fontSize: 13 }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.label, { color: colors.subtext }]}>Title</Text>
        <TextInput value={subject} onChangeText={setSubject} maxLength={120} placeholder="A few words, e.g. “Reels won’t load”" placeholderTextColor={colors.faint}
          style={[styles.input, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]} />

        <Text style={[styles.label, { color: colors.subtext }]}>What happened?</Text>
        <TextInput value={body} onChangeText={setBody} maxLength={2000} multiline placeholder="Tell us what you did, what you expected, and what happened instead."
          placeholderTextColor={colors.faint} style={[styles.input, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border, minHeight: 150, textAlignVertical: 'top' }]} />
        <Text style={{ color: colors.faint, fontSize: 12, marginTop: 6 }}>Please don’t include your password. We’ll never ask for it.</Text>

        <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]} onPress={send} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Send request</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardWrap>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingHorizontal: spacing.lg, paddingBottom: 14, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600', marginTop: 22, marginBottom: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 18, paddingVertical: 7, paddingHorizontal: 14 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 15 },
  btn: { height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginTop: 26 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
