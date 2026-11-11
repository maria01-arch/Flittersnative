import { useEffect, useRef, useState } from 'react';
import { Modal, View, FlatList, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import Text from '@/components/AppText';
import { useTheme } from '@/lib/ThemeContext';

const ITEM_H = 44;
const VISIBLE = 5; // rows shown; the middle one is the selected one
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const daysIn = (month: number, year: number) => new Date(year, month + 1, 0).getDate();

// One scroll wheel: flick it and it snaps so one row always sits in the
// highlighted band in the middle. Pure JavaScript — no extra package, so
// nothing new to install or rebuild.
function Wheel({ items, index, onChange, flex = 1 }: { items: string[]; index: number; onChange: (i: number) => void; flex?: number }) {
  const { colors } = useTheme();
  const listRef = useRef<FlatList>(null);
  const settle = (y: number) => {
    const i = Math.max(0, Math.min(items.length - 1, Math.round(y / ITEM_H)));
    if (i !== index) onChange(i);
  };
  return (
    <View style={{ flex, height: ITEM_H * VISIBLE }}>
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(_, i) => String(i)}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        getItemLayout={(_, i) => ({ length: ITEM_H, offset: ITEM_H * i, index: i })}
        contentOffset={{ x: 0, y: index * ITEM_H }}
        contentContainerStyle={{ paddingVertical: ITEM_H * Math.floor(VISIBLE / 2) }}
        onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(e) => settle(e.nativeEvent.contentOffset.y)}
        renderItem={({ item, index: i }) => (
          <TouchableOpacity activeOpacity={0.7} style={styles.item} onPress={() => { listRef.current?.scrollToIndex({ index: i, animated: true }); onChange(i); }}>
            <Text style={{ fontSize: i === index ? 19 : 16, fontWeight: i === index ? '800' : '500', color: i === index ? colors.text : colors.faint }}>{item}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

// Bottom sheet birthday picker: Month / Day / Year wheels, instead of typing
// "YYYY-MM-DD" by hand. Value in and out is an ISO date string (YYYY-MM-DD).
export default function DatePickerSheet({
  visible,
  value,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  value: string;
  onClose: () => void;
  onConfirm: (iso: string) => void;
}) {
  const { colors } = useTheme();
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => String(thisYear - i)); // newest first

  const parse = () => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    if (m) return { y: Number(m[1]), mo: Number(m[2]) - 1, d: Number(m[3]) };
    return { y: thisYear - 18, mo: 0, d: 1 };
  };
  const [year, setYear] = useState(parse().y);
  const [month, setMonth] = useState(parse().mo);
  const [day, setDay] = useState(parse().d);

  // Start from the saved value each time the sheet opens.
  useEffect(() => {
    if (visible) {
      const p = parse();
      setYear(p.y);
      setMonth(p.mo);
      setDay(p.d);
    }
  }, [visible]);

  const maxDay = daysIn(month, year);
  const safeDay = Math.min(day, maxDay);
  const dayItems = Array.from({ length: maxDay }, (_, i) => String(i + 1));

  const confirm = () => {
    const pad = (n: number) => String(n).padStart(2, '0');
    onConfirm(`${year}-${pad(month + 1)}-${pad(safeDay)}`);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.card }]} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={[styles.title, { color: colors.text }]}>Your birthday</Text>
          <View style={styles.wheels}>
            {/* highlighted middle band */}
            <View pointerEvents="none" style={[styles.band, { backgroundColor: colors.inputBg }]} />
            <Wheel items={MONTHS} index={month} onChange={setMonth} flex={1.6} />
            {/* key includes maxDay so the day wheel rebuilds when the month changes length */}
            <Wheel key={`d${maxDay}`} items={dayItems} index={safeDay - 1} onChange={(i) => setDay(i + 1)} flex={0.9} />
            <Wheel items={years} index={Math.max(0, thisYear - year)} onChange={(i) => setYear(thisYear - i)} flex={1.1} />
          </View>
          <TouchableOpacity style={[styles.doneBtn, { backgroundColor: colors.primary }]} onPress={confirm}>
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function formatDob(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '';
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingBottom: 30, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(128,128,128,0.4)', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  wheels: { flexDirection: 'row', alignItems: 'center' },
  band: { position: 'absolute', left: 0, right: 0, top: ITEM_H * Math.floor(VISIBLE / 2), height: ITEM_H, borderRadius: 12 },
  item: { height: ITEM_H, alignItems: 'center', justifyContent: 'center' },
  doneBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  doneText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
