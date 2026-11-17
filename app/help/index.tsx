import { useCallback, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import Text from '@/components/AppText';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';
import { spacing } from '@/lib/theme';
import { CATEGORY_LABELS, STATUS_LABELS, TicketRow, fetchTickets, when } from '@/lib/health';

const FAQ: { q: string; a: string }[] = [
  { q: 'How do I report a post or a person?', a: 'Tap the flag icon on any post, or open the person’s profile menu. Reports are reviewed by our team, and you don’t need to explain anything twice.' },
  { q: 'What is a strike?', a: 'A strike is a recorded warning when something you posted broke the community rules. You can see every strike, what it was for, and appeal it under Settings → Account health.' },
  { q: 'I got a strike I disagree with', a: 'Open Settings → Account health, tap the strike and choose Send appeal. You can appeal each strike once, and our team replies there with feedback.' },
  { q: 'How do I make my account private?', a: 'Settings → Privacy and security. Followers you haven’t approved will need to send a request.' },
  { q: 'How do I get a verification badge?', a: 'Settings → Get verified shows the options. If something went wrong with a badge payment, send us a request below and pick “Verification badge”.' },
  { q: 'How do I switch between accounts?', a: 'Settings → Switch account. You can add more accounts there too.' },
  { q: 'How do I delete a post?', a: 'Open your profile, then tap the bin icon on the post.' },
];

export default function HelpCenter() {
  const { colors } = useTheme();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<number | null>(null);
  const [offline, setOffline] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    fetchTickets().then((r) => {
      if (r.data) { setTickets(r.data); setOffline(null); } else setOffline(r.error);
      setLoading(false);
    });
  }, []));

  const tint = (s: string) => (s === 'pending_user' ? colors.primary : s === 'resolved' ? colors.faint : '#F59E0B');

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Help center</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/help/new')} style={[styles.cta, { backgroundColor: colors.primary }]}>
          <Ionicons name="chatbubble-ellipses-outline" size={22} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Contact support</Text>
            <Text style={{ color: '#ffffffcc', fontSize: 13, marginTop: 2 }}>Tell us about a problem and we’ll reply here.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={0.7} onPress={() => router.push('/account-health')} style={[styles.link, { borderColor: colors.border }]}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
          <Text style={{ color: colors.text, flex: 1 }}>Account health, strikes and appeals</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.faint} />
        </TouchableOpacity>

        <Text style={[styles.section, { color: colors.text }]}>Your requests</Text>
        {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 10 }} /> : offline ? (
          <Text style={{ color: colors.subtext }}>{offline}</Text>
        ) : tickets.length === 0 ? (
          <Text style={{ color: colors.faint }}>You haven’t contacted us yet.</Text>
        ) : tickets.map((t) => (
          <TouchableOpacity key={t.id} activeOpacity={0.7} onPress={() => router.push(`/help/ticket/${t.id}`)} style={[styles.row, { borderColor: colors.border }]}>
            <View style={[styles.dot, { backgroundColor: t.unread ? colors.primary : 'transparent' }]} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: colors.text, fontWeight: t.unread ? '800' : '600', fontSize: 14 }}>{t.subject}</Text>
              <Text style={{ color: colors.faint, fontSize: 12, marginTop: 3 }}>
                {CATEGORY_LABELS[t.category] || t.category} · {when(t.updated_at)}
              </Text>
            </View>
            <Text style={{ color: tint(t.status), fontSize: 12, fontWeight: '700' }}>{STATUS_LABELS[t.status]}</Text>
          </TouchableOpacity>
        ))}

        <Text style={[styles.section, { color: colors.text }]}>Common questions</Text>
        {FAQ.map((f, i) => (
          <TouchableOpacity key={f.q} activeOpacity={0.7} onPress={() => setOpen(open === i ? null : i)} style={[styles.faq, { borderColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ color: colors.text, fontWeight: '600', flex: 1 }}>{f.q}</Text>
              <Ionicons name={open === i ? 'chevron-up' : 'chevron-down'} size={16} color={colors.faint} />
            </View>
            {open === i ? <Text style={{ color: colors.subtext, marginTop: 8, lineHeight: 20 }}>{f.a}</Text> : null}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingHorizontal: spacing.lg, paddingBottom: 14, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: '700' },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, padding: 16 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 12 },
  section: { fontSize: 17, fontWeight: '800', marginTop: 28, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, borderBottomWidth: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  faq: { paddingVertical: 14, borderBottomWidth: 1 },
});
