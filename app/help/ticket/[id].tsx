import { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Alert } from 'react-native';
import Text from '@/components/AppText';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';
import { spacing } from '@/lib/theme';
import KeyboardWrap from '@/components/KeyboardWrap';
import { CATEGORY_LABELS, STATUS_LABELS, Ticket, fetchTicket, replyTicket, resolveTicket, when } from '@/lib/health';

export default function TicketThread() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const scroller = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    const r = await fetchTicket(String(id));
    if (r.data) { setTicket(r.data); setError(null); } else setError(r.error);
  }, [id]);

  // Open the thread, then check for a reply every 20 seconds while it's on screen.
  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    const r = await replyTicket(String(id), body);
    setBusy(false);
    if (r.error) { Alert.alert("Couldn't send", r.error); return; }
    setText('');
    await load();
    setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 100);
  };

  const resolve = () => {
    Alert.alert('Mark as resolved?', 'You can still write back later and we’ll reopen it.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Resolve', onPress: async () => { const r = await resolveTicket(String(id)); if (r.error) Alert.alert("Couldn't update", r.error); else load(); } },
    ]);
  };

  return (
    <KeyboardWrap style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>{ticket?.subject || 'Request'}</Text>
          {ticket ? <Text style={{ color: colors.faint, fontSize: 12, textAlign: 'center' }}>{CATEGORY_LABELS[ticket.category] || ticket.category} · {STATUS_LABELS[ticket.status]}</Text> : null}
        </View>
        {ticket && ticket.status !== 'resolved' ? (
          <TouchableOpacity onPress={resolve} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="checkmark-done-outline" size={24} color={colors.text} />
          </TouchableOpacity>
        ) : <View style={{ width: 24 }} />}
      </View>

      {!ticket ? (
        <View style={styles.center}>
          {error ? <Text style={{ color: colors.subtext, textAlign: 'center', paddingHorizontal: 30 }}>{error}</Text> : <ActivityIndicator color={colors.primary} />}
        </View>
      ) : (
        <>
          <ScrollView ref={scroller} contentContainerStyle={{ padding: spacing.lg, gap: 10 }} onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}>
            {ticket.messages.map((m) => {
              const mine = m.from === 'user';
              return (
                <View key={m.id} style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
                  {!mine ? <Text style={{ color: colors.faint, fontSize: 11, marginBottom: 3 }}>Flitters support</Text> : null}
                  <View style={[styles.bubble, { backgroundColor: mine ? colors.primary : colors.bubbleTheirs }]}>
                    <Text style={{ color: mine ? '#fff' : colors.text, lineHeight: 20 }}>{m.body}</Text>
                  </View>
                  <Text style={{ color: colors.faint, fontSize: 11, marginTop: 3 }}>{when(m.created_at)}</Text>
                </View>
              );
            })}
            {ticket.status === 'resolved' ? <Text style={{ color: colors.faint, textAlign: 'center', marginTop: 10 }}>Marked resolved. Write below to reopen it.</Text> : null}
          </ScrollView>
          <View style={[styles.composer, { borderTopColor: colors.border, backgroundColor: colors.bg }]}>
            <TextInput value={text} onChangeText={setText} placeholder="Write a reply…" placeholderTextColor={colors.faint} multiline maxLength={2000}
              style={[styles.input, { color: colors.text, backgroundColor: colors.inputBg }]} />
            <TouchableOpacity onPress={send} disabled={busy || !text.trim()} style={[styles.send, { backgroundColor: colors.primary, opacity: busy || !text.trim() ? 0.5 : 1 }]}>
              {busy ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="arrow-up" size={20} color="#fff" />}
            </TouchableOpacity>
          </View>
        </>
      )}
    </KeyboardWrap>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingHorizontal: spacing.lg, paddingBottom: 12, borderBottomWidth: 1 },
  title: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bubble: { maxWidth: '85%', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1 },
  input: { flex: 1, maxHeight: 120, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
