import { useEffect, useState } from 'react';
import { Modal, View, TouchableOpacity, ScrollView, StyleSheet, Pressable } from 'react-native';
import Text from '@/components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';
import { spacing } from '@/lib/theme';
import { whenText } from '@/lib/scheduled';

// Pick a day and a time (5-minute steps). Plain JavaScript, no extra native package.
const MIN_AHEAD_MS = 3 * 60 * 1000;
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

function defaultTime(): Date {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
  return d;
}

export default function SchedulePicker({ visible, initial, onCancel, onConfirm }: { visible: boolean; initial?: Date | null; onCancel: () => void; onConfirm: (d: Date) => void }) {
  const { colors } = useTheme();
  const [day, setDay] = useState(startOfDay(new Date()));
  const [h12, setH12] = useState(9);
  const [min, setMin] = useState(0);
  const [pm, setPm] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const d = initial || defaultTime();
    setDay(startOfDay(d));
    const h = d.getHours();
    setPm(h >= 12);
    setH12(h % 12 === 0 ? 12 : h % 12);
    setMin(Math.floor(d.getMinutes() / 5) * 5);
  }, [visible]);

  const days = Array.from({ length: 30 }, (_, i) => { const d = startOfDay(new Date()); d.setDate(d.getDate() + i); return d; });
  const chosen = new Date(day);
  chosen.setHours((h12 % 12) + (pm ? 12 : 0), min, 0, 0);
  const tooSoon = chosen.getTime() < Date.now() + MIN_AHEAD_MS;

  const stepHour = (d: number) => setH12((h) => ((h - 1 + d + 12) % 12) + 1);
  const stepMin = (d: number) => setMin((m) => (m + d * 5 + 60) % 60);

  const Spinner = ({ label, onUp, onDown }: { label: string; onUp: () => void; onDown: () => void }) => (
    <View style={styles.spin}>
      <TouchableOpacity onPress={onUp} hitSlop={10}><Ionicons name="chevron-up" size={26} color={colors.primary} /></TouchableOpacity>
      <Text style={[styles.big, { color: colors.text }]}>{label}</Text>
      <TouchableOpacity onPress={onDown} hitSlop={10}><Ionicons name="chevron-down" size={26} color={colors.primary} /></TouchableOpacity>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.bg, borderColor: colors.border }]} onPress={() => {}}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>Schedule post</Text>
          <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>Goes live on its own at the time you pick, even if your phone is off.</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 14 }}>
            {days.map((d, i) => {
              const on = d.getTime() === day.getTime();
              return (
                <TouchableOpacity key={i} onPress={() => setDay(d)} style={[styles.dayChip, { backgroundColor: on ? colors.primary : colors.inputBg }]}>
                  <Text style={{ color: on ? '#fff' : colors.subtext, fontSize: 11, fontWeight: '700' }}>{i === 0 ? 'TODAY' : d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}</Text>
                  <Text style={{ color: on ? '#fff' : colors.text, fontSize: 18, fontWeight: '800' }}>{d.getDate()}</Text>
                  <Text style={{ color: on ? '#fff' : colors.subtext, fontSize: 11 }}>{d.toLocaleDateString(undefined, { month: 'short' })}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.timeRow}>
            <Spinner label={String(h12)} onUp={() => stepHour(1)} onDown={() => stepHour(-1)} />
            <Text style={[styles.big, { color: colors.text }]}>:</Text>
            <Spinner label={String(min).padStart(2, '0')} onUp={() => stepMin(1)} onDown={() => stepMin(-1)} />
            <View style={{ gap: 8, marginLeft: 10 }}>
              {(['AM', 'PM'] as const).map((l) => {
                const on = (l === 'PM') === pm;
                return (
                  <TouchableOpacity key={l} onPress={() => setPm(l === 'PM')} style={[styles.ampm, { backgroundColor: on ? colors.primary : colors.inputBg }]}>
                    <Text style={{ color: on ? '#fff' : colors.text, fontWeight: '800' }}>{l}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <Text style={{ color: tooSoon ? colors.danger : colors.text, textAlign: 'center', fontWeight: '700', marginTop: 14 }}>
            {tooSoon ? 'Pick a time a few minutes from now' : whenText(chosen)}
          </Text>

          <View style={styles.btnRow}>
            <TouchableOpacity onPress={onCancel} style={[styles.btn, { backgroundColor: colors.inputBg }]}><Text style={{ color: colors.text, fontWeight: '700' }}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity disabled={tooSoon} onPress={() => onConfirm(chosen)} style={[styles.btn, { backgroundColor: colors.primary, opacity: tooSoon ? 0.5 : 1 }]}><Text style={{ color: '#fff', fontWeight: '800' }}>Set time</Text></TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing.lg },
  sheet: { borderRadius: 20, borderWidth: 1, padding: spacing.lg },
  dayChip: { width: 58, borderRadius: 14, alignItems: 'center', paddingVertical: 8, gap: 1 },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  spin: { alignItems: 'center', gap: 2, width: 64 },
  big: { fontSize: 34, fontWeight: '800' },
  ampm: { width: 54, alignItems: 'center', paddingVertical: 9, borderRadius: 12 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  btn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 14 },
});
