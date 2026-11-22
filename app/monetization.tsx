import { useCallback, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, Switch } from 'react-native';
import Text from '@/components/AppText';
import { router, Stack, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';
import { useAuth } from '@/lib/AuthContext';
import { fetchMonetization, saveMonetization, type MonetizationStatus } from '@/lib/coins';

// Turn on gifts for your comments, your profile and your messages, once you are eligible.
export default function Monetization() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const uid = session?.user?.id;
  const [s, setS] = useState<MonetizationStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!uid) return;
    const r = await fetchMonetization(uid);
    if (r) { setS(r); setFailed(false); } else setFailed(true);
  }, [uid]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const change = async (next: { comments: boolean; profile: boolean; dm: boolean }) => {
    if (!s || busy) return;
    setBusy(true);
    const r = await saveMonetization(next);
    setBusy(false);
    if (r.error) { Alert.alert("Couldn't save", r.error); return; }
    if (r.data) setS(r.data);
  };

  const allOn = !!s && (!s.post_eligible || (s.comments_on && s.profile_on)) && (!s.dm_eligible || s.dm_on) && (s.post_eligible);

  const Bar = ({ label, now, need }: { label: string; now: number; need: number }) => (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>{label}</Text>
        <Text style={{ color: colors.subtext, fontSize: 13 }}>{Math.min(now, need).toLocaleString()} / {need.toLocaleString()}</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, marginTop: 6, overflow: 'hidden' }}>
        <View style={{ height: 6, width: `${Math.min(100, (now / need) * 100)}%`, backgroundColor: colors.primary }} />
      </View>
    </View>
  );

  const Row = ({ icon, title, sub, on, locked, lockText, onChange }: { icon: any; title: string; sub: string; on: boolean; locked: boolean; lockText: string; onChange: (v: boolean) => void }) => (
    <View style={[styles.row, { borderBottomColor: colors.border, opacity: locked ? 0.55 : 1 }]}>
      <Ionicons name={icon} size={22} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>{title}</Text>
        <Text style={{ color: colors.subtext, fontSize: 12.5, marginTop: 1 }}>{locked ? lockText : sub}</Text>
      </View>
      {locked ? <Ionicons name="lock-closed" size={18} color={colors.faint} /> : <Switch value={on} onValueChange={onChange} disabled={busy} trackColor={{ true: colors.primary }} />}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.top, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 18 }}>Monetization</Text>
        <View style={{ width: 24 }} />
      </View>
      {!s ? (
        <View style={styles.center}>
          {failed ? <Text style={{ color: colors.subtext, textAlign: 'center', paddingHorizontal: 30 }}>Monetization isn't available yet. Run BATCH11_run_this.sql in Supabase, then reopen this screen.</Text> : <ActivityIndicator color={colors.primary} />}
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 50 }}>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {s.post_eligible ? (
              <>
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 17 }}>🎉 You're eligible</Text>
                <Text style={{ color: colors.subtext, lineHeight: 19, marginTop: 4 }}>
                  {s.badge ? 'Your badge unlocks gifts on your comments and profile.' : 'You have enough followers and likes to receive gifts on your comments and profile.'} Choose where you want to receive gifts. You earn coins every time someone gifts you.
                </Text>
              </>
            ) : (
              <>
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 17 }}>Almost there</Text>
                <Text style={{ color: colors.subtext, lineHeight: 19, marginTop: 4 }}>Get {s.need_followers} followers and {s.need_likes} likes in total to start receiving gifts on your comments and profile. A verified badge unlocks it right away.</Text>
                <Bar label="Followers" now={s.followers} need={s.need_followers} />
                <Bar label="Likes" now={s.likes} need={s.need_likes} />
              </>
            )}
          </View>

          {s.post_eligible && (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, paddingVertical: 4, marginTop: 14 }]}>
              <Row icon="flash-outline" title="Turn everything on" sub="Gifts on comments, profile and every option you can use" on={allOn} locked={false} lockText=""
                onChange={(v) => change({ comments: v, profile: v, dm: v && s.dm_eligible })} />
              <Row icon="chatbubble-ellipses-outline" title="Gifts on my comments" sub="People can gift you from your posts' comment sections" on={s.comments_on} locked={!s.post_eligible} lockText="Not unlocked yet"
                onChange={(v) => change({ comments: v, profile: s.profile_on, dm: s.dm_on })} />
              <Row icon="person-circle-outline" title="Gifts on my profile" sub="People can gift you from your profile" on={s.profile_on} locked={!s.post_eligible} lockText="Not unlocked yet"
                onChange={(v) => change({ comments: s.comments_on, profile: v, dm: s.dm_on })} />
              <Row icon="mail-outline" title="Gifts in messages" sub="People you chat with can gift you in your DMs" on={s.dm_on} locked={!s.dm_eligible}
                lockText={s.badge ? `Needs ${s.need_dm_followers} followers (you have ${s.followers.toLocaleString()})` : `Needs a verified badge and ${s.need_dm_followers} followers`}
                onChange={(v) => change({ comments: s.comments_on, profile: s.profile_on, dm: v })} />
            </View>
          )}

          <TouchableOpacity activeOpacity={0.7} onPress={() => router.push('/wallet' as any)} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 }]}>
            <Text style={{ fontSize: 22 }}>🪙</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>Your earnings</Text>
              <Text style={{ color: colors.subtext, fontSize: 12 }}>See what you've earned and when you can withdraw</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.7} onPress={() => router.push('/get-verified' as any)} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 }]}>
            <Ionicons name="shield-checkmark-outline" size={22} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>Get verified</Text>
              <Text style={{ color: colors.subtext, fontSize: 12 }}>A badge unlocks gifts straight away. Gifts in messages are for verified accounts.</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 54, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: 16, padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
});
