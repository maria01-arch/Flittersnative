import { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Alert } from 'react-native';
import Text from '@/components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';
import { spacing } from '@/lib/theme';
import { BanInfo, fetchBanInfo, sendAppeal, timeLeftText } from '@/lib/banInfo';

// Shown instead of the login form when the account is banned: why, for how
// long, and an appeal. The email and password come from the login form and
// are only kept in memory to prove who is asking.
export default function BannedView({
  email,
  password,
  info,
  onInfo,
  onBack,
  onLifted,
}: {
  email: string;
  password: string;
  info: BanInfo;
  onInfo: (i: BanInfo) => void;
  onBack: () => void;
  onLifted: () => void;
}) {
  const { colors } = useTheme();
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  // After being signed out by a ban there is no password in memory: ask for it
  // (it proves who is appealing).
  const [pw, setPw] = useState(password);

  const until = info.bannedUntil ? new Date(info.bannedUntil) : null;
  const untilDate = until ? until.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '';
  const rejected = info.appealStatus === 'rejected';
  const pending = info.appealStatus === 'pending';

  const refresh = async () => {
    if (!pw) {
      Alert.alert('Enter your password', 'We need your password to check your account.');
      return;
    }
    setBusy(true);
    const next = await fetchBanInfo(email, pw);
    setBusy(false);
    if (!next) {
      Alert.alert("Couldn't check", 'No connection right now. Try again in a moment.');
      return;
    }
    if (!next.banned) {
      onLifted();
      return;
    }
    onInfo(next);
  };

  const submit = async () => {
    const msg = text.trim();
    if (msg.length < 10) {
      Alert.alert('Tell us a bit more', 'Please write at least 10 characters.');
      return;
    }
    if (!pw) {
      Alert.alert('Enter your password', 'We need your password to send your appeal.');
      return;
    }
    setBusy(true);
    const res = await sendAppeal(email, pw, msg);
    if (res.ok) {
      const next = await fetchBanInfo(email, pw);
      setBusy(false);
      setWriting(false);
      if (next) onInfo(next);
      else onInfo({ ...info, appealStatus: 'pending' });
      return;
    }
    setBusy(false);
    if (res.error === 'already_appealed') {
      await refresh();
    } else if (res.error === 'network') {
      Alert.alert('No connection', 'Check your internet and try again.');
    } else {
      Alert.alert("Couldn't send", 'Please try again.');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
      <View style={[styles.iconCircle, { backgroundColor: colors.danger + '1F' }]}>
        <Ionicons name={info.permanent ? 'ban' : 'time-outline'} size={44} color={colors.danger} />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>{info.permanent ? 'Account permanently banned' : 'Account suspended'}</Text>
      <Text style={[styles.sub, { color: colors.subtext }]}>
        {info.permanent ? 'This account can no longer be used on Flitters.' : `You can't use Flitters until ${untilDate}.`}
      </Text>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {!info.permanent && !!until && (
          <View style={styles.line}>
            <Text style={[styles.k, { color: colors.subtext }]}>Time left</Text>
            <Text style={[styles.v, { color: colors.text }]}>{timeLeftText(info.bannedUntil)}</Text>
          </View>
        )}
        <View style={styles.line}>
          <Text style={[styles.k, { color: colors.subtext }]}>Reason</Text>
          <Text style={[styles.v, { color: colors.text, flex: 1, textAlign: 'right' }]}>{info.reason || 'Not shared'}</Text>
        </View>
      </View>

      {!password && (
        <View style={{ width: '100%' }}>
          <Text style={{ color: colors.subtext, marginBottom: 6 }}>Enter your password to appeal or check your status.</Text>
          <TextInput
            style={[styles.input, { minHeight: 0, borderColor: colors.border, color: colors.text, backgroundColor: colors.inputBg }]}
            value={pw}
            onChangeText={setPw}
            secureTextEntry
            autoCapitalize="none"
            placeholder="Password"
            placeholderTextColor={colors.faint}
          />
        </View>
      )}

      {rejected && (
        <View style={[styles.alert, { borderColor: colors.danger, backgroundColor: colors.danger + '14' }]}>
          <Ionicons name="alert-circle" size={20} color={colors.danger} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.danger, fontWeight: '800' }}>Your appeal was rejected</Text>
            {!!info.appealNote && <Text style={{ color: colors.text, marginTop: 3 }}>{info.appealNote}</Text>}
            <Text style={{ color: colors.subtext, marginTop: 3 }}>
              {info.permanent ? 'The ban stays permanent. You can only appeal once.' : `The suspension continues until ${untilDate}. You can only appeal once.`}
            </Text>
          </View>
        </View>
      )}

      {pending && (
        <View style={[styles.alert, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Ionicons name="hourglass-outline" size={20} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '800' }}>Appeal under review</Text>
            <Text style={{ color: colors.subtext, marginTop: 3 }}>We'll email you the answer. You can also check back here.</Text>
          </View>
        </View>
      )}

      {!info.appealStatus && !writing && (
        <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={() => setWriting(true)}>
          <Text style={styles.btnText}>Appeal this decision</Text>
        </TouchableOpacity>
      )}

      {!info.appealStatus && writing && (
        <View style={{ width: '100%' }}>
          <Text style={{ color: colors.subtext, marginBottom: 6 }}>Tell us why this was a mistake. You can only appeal once.</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.inputBg }]}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={1000}
            placeholder="Write your appeal…"
            placeholderTextColor={colors.faint}
          />
          <Text style={{ color: colors.faint, fontSize: 12, textAlign: 'right', marginTop: 2 }}>{text.length}/1000</Text>
          <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary, opacity: busy ? 0.7 : 1 }]} onPress={submit} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Send appeal</Text>}
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.link} onPress={refresh} disabled={busy}>
        <Text style={{ color: colors.primary, fontWeight: '700' }}>{busy && !writing ? 'Checking…' : 'Check status'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.link} onPress={onBack}>
        <Text style={{ color: colors.subtext, fontWeight: '600' }}>Back to log in</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingHorizontal: spacing.lg + 6, paddingTop: 90, paddingBottom: 40, gap: 12 },
  iconCircle: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: 4 },
  sub: { fontSize: 15, textAlign: 'center', lineHeight: 21 },
  card: { width: '100%', borderWidth: 1, borderRadius: 14, padding: 14, gap: 10, marginTop: 6 },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 14 },
  k: { fontSize: 14 },
  v: { fontSize: 14, fontWeight: '700' },
  alert: { width: '100%', flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 14, padding: 12 },
  btn: { width: '100%', borderRadius: 26, paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  input: { width: '100%', minHeight: 120, borderWidth: 1, borderRadius: 12, padding: 12, textAlignVertical: 'top', fontSize: 15 },
  link: { paddingVertical: 8 },
});
