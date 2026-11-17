import { useCallback, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Alert } from 'react-native';
import Text from '@/components/AppText';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';
import { spacing } from '@/lib/theme';
import KeyboardWrap from '@/components/KeyboardWrap';
import { REASON_LABELS, Strike, appealStrike, fetchHealth, when } from '@/lib/health';

export default function StrikeDetail() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [strike, setStrike] = useState<Strike | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const h = await fetchHealth();
    if (h.error || !h.data) { setError(h.error || "Couldn't load this strike."); setLoading(false); return; }
    const s = h.data.strikes.find((x) => x.id === id) || null;
    if (!s) setError("We couldn't find this strike.");
    setStrike(s);
    setLoading(false);
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const send = async () => {
    if (!strike || busy) return;
    const text = message.trim();
    if (text.length < 10) { Alert.alert('Add a little more', 'Tell us in at least 10 characters why you think this was a mistake.'); return; }
    setBusy(true);
    const r = await appealStrike(strike.id, text);
    setBusy(false);
    if (r.error) { Alert.alert("Couldn't send your appeal", r.error); return; }
    setMessage('');
    setLoading(true);
    load();
  };

  const canAppeal = !!strike && strike.state === 'active' && !strike.appeal;
  const ap = strike?.appeal || null;

  return (
    <KeyboardWrap style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Strike details</Text>
        <View style={{ width: 24 }} />
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : !strike ? (
        <View style={styles.center}><Text style={{ color: colors.subtext, textAlign: 'center', paddingHorizontal: 30 }}>{error}</Text></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>{REASON_LABELS[strike.reason_code] || 'Rule violation'}</Text>
          <Text style={{ color: colors.subtext, marginTop: 4 }}>
            {when(strike.issued_at)} · {strike.severity} point{strike.severity === 1 ? '' : 's'}
            {strike.state === 'removed' ? ' · Removed' : strike.state === 'expired' ? ' · Expired' : ''}
          </Text>

          <Text style={[styles.label, { color: colors.subtext }]}>What we found</Text>
          <Text style={{ color: colors.text, lineHeight: 21 }}>{strike.reason}</Text>

          {strike.content_snapshot ? (
            <>
              <Text style={[styles.label, { color: colors.subtext }]}>The {strike.content_type === 'comment' || strike.content_type === 'reel_comment' ? 'comment' : strike.content_type || 'content'} in question</Text>
              <View style={[styles.quote, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                <Text style={{ color: colors.text, lineHeight: 20 }}>{strike.content_snapshot}</Text>
              </View>
            </>
          ) : null}

          {strike.state === 'removed' && strike.resolution_note ? (
            <>
              <Text style={[styles.label, { color: colors.subtext }]}>Feedback from our team</Text>
              <Text style={{ color: colors.text, lineHeight: 21 }}>{strike.resolution_note}</Text>
            </>
          ) : null}

          {ap ? (
            <View style={[styles.box, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={{ color: colors.text, fontWeight: '800' }}>
                {ap.status === 'pending' ? 'Your appeal is being reviewed' : ap.status === 'overturned' ? 'Your appeal was accepted' : 'Your appeal was reviewed'}
              </Text>
              <Text style={{ color: colors.faint, fontSize: 12, marginTop: 2 }}>Sent {when(ap.created_at)}</Text>
              <Text style={{ color: colors.subtext, marginTop: 10, lineHeight: 20 }}>“{ap.message}”</Text>
              {ap.feedback ? (
                <>
                  <Text style={[styles.label, { color: colors.subtext, marginTop: 14 }]}>Feedback from our team</Text>
                  <Text style={{ color: colors.text, lineHeight: 21 }}>{ap.feedback}</Text>
                </>
              ) : null}
              {ap.status === 'upheld' ? <Text style={{ color: colors.faint, fontSize: 12, marginTop: 12 }}>The strike stays, and it can't be appealed again. If you still need help, contact the Help center.</Text> : null}
            </View>
          ) : null}

          {canAppeal ? (
            <View style={[styles.box, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={{ color: colors.text, fontWeight: '800' }}>Think this was a mistake?</Text>
              <Text style={{ color: colors.subtext, marginTop: 4, lineHeight: 19 }}>You can appeal once. A person on our team will take another look and you'll get their feedback here.</Text>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder="Tell us what we missed…"
                placeholderTextColor={colors.faint}
                multiline
                maxLength={1000}
                style={[styles.input, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]}
              />
              <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]} onPress={send} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Send appeal</Text>}
              </TouchableOpacity>
            </View>
          ) : null}

          {strike.state === 'expired' && !ap ? <Text style={{ color: colors.faint, marginTop: 20 }}>This strike has expired and no longer counts against your account.</Text> : null}
        </ScrollView>
      )}
    </KeyboardWrap>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingHorizontal: spacing.lg, paddingBottom: 14, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, fontWeight: '700', marginTop: 22, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  quote: { borderWidth: 1, borderRadius: 12, padding: 12 },
  box: { borderWidth: 1, borderRadius: 14, padding: 16, marginTop: 24 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 110, marginTop: 14, textAlignVertical: 'top', fontSize: 15 },
  btn: { height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
