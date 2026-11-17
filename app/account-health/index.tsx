import { useCallback, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import Text from '@/components/AppText';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';
import { spacing } from '@/lib/theme';
import { Alert as AlertRow, Health, REASON_LABELS, Standing, Strike, fetchAlerts, fetchHealth, markAlertsRead, when } from '@/lib/health';

const STANDING: Record<Standing, { title: string; text: string; icon: any; tone: 'good' | 'warn' | 'bad' }> = {
  good: { title: 'Good standing', text: 'Your account has no active strikes. Keep following the community rules.', icon: 'shield-checkmark', tone: 'good' },
  warning: { title: 'Your account has an issue', text: 'You have a strike on your account. A strike is a warning that something you posted broke the community rules. See the details below.', icon: 'alert-circle', tone: 'warn' },
  at_risk: { title: 'Your account has an issue', text: 'You have several strikes on your account. Please follow the community rules so it doesn’t get worse. See the details below.', icon: 'warning', tone: 'bad' },
  suspended: { title: 'Your account has an issue', text: 'There is a problem with your account. If you need help, contact the Help center.', icon: 'alert-circle', tone: 'bad' },
};

const STATE_LABEL: Record<string, string> = { active: 'Active', appealed: 'Appeal sent', expired: 'Expired', removed: 'Removed' };

export default function AccountHealth() {
  const { colors } = useTheme();
  const [health, setHealth] = useState<Health | null>(null);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [h, a] = await Promise.all([fetchHealth(), fetchAlerts(30)]);
    if (h.error) setError(h.error); else { setError(null); setHealth(h.data); }
    if (a.data) {
      setAlerts(a.data);
      const unread = a.data.filter((x) => !x.read_at).map((x) => x.id);
      // Seeing them here counts as reading them (the dot stays for this visit).
      if (unread.length) markAlertsRead(unread);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const tone = health ? STANDING[health.standing].tone : 'good';
  const tint = tone === 'good' ? colors.repost : tone === 'warn' ? '#F59E0B' : colors.danger;
  const strikes = health?.strikes || [];

  const alertPress = (a: AlertRow) => {
    if (a.ticket_id) router.push(`/help/ticket/${a.ticket_id}`);
    else if (a.strike_id) router.push(`/account-health/strike/${a.strike_id}`);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Account health</Text>
        <View style={{ width: 24 }} />
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : error || !health ? (
        <View style={styles.center}>
          <Text style={{ color: colors.subtext, textAlign: 'center', paddingHorizontal: 30 }}>{error || "Couldn't load your account health."}</Text>
          <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary, marginTop: 16 }]} onPress={() => { setLoading(true); load(); }}>
            <Text style={styles.btnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}>
          <View style={[styles.hero, { borderColor: tint, backgroundColor: tint + '14' }]}>
            <Ionicons name={STANDING[health.standing].icon} size={30} color={tint} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>{STANDING[health.standing].title}</Text>
              <Text style={{ color: colors.subtext, marginTop: 4, lineHeight: 19 }}>{STANDING[health.standing].text}</Text>
              <Text style={{ color: colors.faint, marginTop: 6, fontSize: 12 }}>{health.points} active strike point{health.points === 1 ? '' : 's'}</Text>
            </View>
          </View>

          {alerts.length > 0 ? (
            <>
              <Text style={[styles.section, { color: colors.text }]}>Alerts</Text>
              {alerts.slice(0, 8).map((a) => {
                const tappable = !!(a.ticket_id || a.strike_id);
                return (
                  <TouchableOpacity key={a.id} disabled={!tappable} activeOpacity={0.7} onPress={() => alertPress(a)} style={[styles.row, { borderColor: colors.border }]}>
                    <View style={[styles.dot, { backgroundColor: a.read_at ? 'transparent' : colors.primary }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>{a.title}</Text>
                      {a.body ? <Text numberOfLines={2} style={{ color: colors.subtext, fontSize: 13, marginTop: 2 }}>{a.body}</Text> : null}
                      <Text style={{ color: colors.faint, fontSize: 11, marginTop: 4 }}>{when(a.created_at)}</Text>
                    </View>
                    {tappable ? <Ionicons name="chevron-forward" size={16} color={colors.faint} /> : null}
                  </TouchableOpacity>
                );
              })}
            </>
          ) : null}

          <Text style={[styles.section, { color: colors.text }]}>Strikes</Text>
          {strikes.length === 0 ? (
            <Text style={{ color: colors.faint }}>No strikes. Nothing to worry about.</Text>
          ) : strikes.map((s: Strike) => (
            <TouchableOpacity key={s.id} activeOpacity={0.7} onPress={() => router.push(`/account-health/strike/${s.id}`)} style={[styles.row, { borderColor: colors.border, opacity: s.state === 'active' || s.state === 'appealed' ? 1 : 0.65 }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>{REASON_LABELS[s.reason_code] || 'Rule violation'}</Text>
                <Text numberOfLines={2} style={{ color: colors.subtext, fontSize: 13, marginTop: 2 }}>{s.reason}</Text>
                <Text style={{ color: colors.faint, fontSize: 11, marginTop: 4 }}>
                  {when(s.issued_at)} · {STATE_LABEL[s.state]}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.faint} />
            </TouchableOpacity>
          ))}

          <TouchableOpacity activeOpacity={0.7} onPress={() => router.push('/help')} style={[styles.helpLink, { borderColor: colors.border }]}>
            <Ionicons name="help-buoy-outline" size={20} color={colors.primary} />
            <Text style={{ color: colors.text, flex: 1 }}>Something wrong? Contact the Help center</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.faint} />
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingHorizontal: spacing.lg, paddingBottom: 14, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { flexDirection: 'row', gap: 14, borderWidth: 1, borderRadius: 16, padding: 16, alignItems: 'flex-start' },
  section: { fontSize: 17, fontWeight: '800', marginTop: 26, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, borderBottomWidth: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  btn: { height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  helpLink: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 28 },
});
