import { useEffect, useState } from 'react';
import { Modal, View, TouchableOpacity, StyleSheet, Pressable, ActivityIndicator, Alert, ScrollView } from 'react-native';
import Text from '@/components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import { useAuth } from '@/lib/AuthContext';
import { loadGifts, sendGift, useWallet, fmtCoins, type GiftItem, type GiftContext } from '@/lib/coins';

// Pick a gift and send it. Used from chats, post comments and profiles.
export default function GiftSheet({
  visible, onClose, toUserId, toName, context, conversationId, postId, onSent,
}: {
  visible: boolean; onClose: () => void; toUserId?: string | null; toName?: string | null;
  context: GiftContext; conversationId?: string | null; postId?: string | null; onSent?: () => void;
}) {
  const { colors } = useTheme();
  const { session } = useAuth();
  const { balance, setBalance, reload } = useWallet(session?.user?.id);
  const [gifts, setGifts] = useState<GiftItem[]>([]);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<GiftItem | null>(null);

  useEffect(() => {
    if (!visible) return;
    setPick(null); setDone(null); reload();
    loadGifts().then(setGifts);
  }, [visible]);

  const chosen = gifts.find((g) => g.id === pick);
  const short = !!chosen && balance != null && balance < chosen.cost;

  const send = async () => {
    if (!chosen || !toUserId || busy) return;
    if (short) { onClose(); router.push('/wallet' as any); return; }
    setBusy(true);
    const r = await sendGift({ giftId: chosen.id, toUserId, context, conversationId, postId });
    setBusy(false);
    if (!r.ok) { Alert.alert("Couldn't send the gift", r.error || 'Please try again.'); return; }
    if (r.balance != null) setBalance(r.balance);
    setDone(chosen);
    onSent?.();
    setTimeout(onClose, 1400);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.dim} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.card }]}>
        <View style={[styles.grab, { backgroundColor: colors.border }]} />
        {done ? (
          <View style={{ alignItems: 'center', paddingVertical: 36 }}>
            <Text style={{ fontSize: 64 }}>{done.emoji}</Text>
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 17, marginTop: 10 }}>{done.name} sent{toName ? ` to ${toName}` : ''}!</Text>
          </View>
        ) : (
          <>
            <View style={styles.head}>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 17, flexShrink: 1 }} numberOfLines={1}>Send a gift{toName ? ` to ${toName}` : ''}</Text>
              <TouchableOpacity onPress={() => { onClose(); router.push('/wallet' as any); }} style={[styles.bal, { backgroundColor: colors.inputBg }]}>
                <Text style={{ fontSize: 14 }}>🪙</Text>
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 14 }}>{fmtCoins(balance)}</Text>
                <Ionicons name="add-circle" size={16} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={styles.grid}>
              {gifts.length === 0 ? <ActivityIndicator color={colors.primary} style={{ margin: 30 }} /> : gifts.map((g) => {
                const on = g.id === pick;
                return (
                  <TouchableOpacity key={g.id} activeOpacity={0.8} onPress={() => setPick(g.id)} style={[styles.item, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary + '18' : colors.inputBg }]}>
                    <Text style={{ fontSize: 34 }}>{g.emoji}</Text>
                    <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12.5, marginTop: 4 }} numberOfLines={1}>{g.name}</Text>
                    <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 1 }}>🪙 {fmtCoins(g.cost)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity disabled={!chosen || busy} onPress={send} style={[styles.send, { backgroundColor: chosen ? colors.primary : colors.border }]}>
              {busy ? <ActivityIndicator color="#fff" /> : (
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>
                  {!chosen ? 'Pick a gift' : short ? 'Not enough coins · Get coins' : `Send ${chosen.name} · 🪙 ${fmtCoins(chosen.cost)}`}
                </Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingBottom: 26, paddingTop: 8 },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
  bal: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  item: { width: '22.5%', alignItems: 'center', borderWidth: 1.5, borderRadius: 14, paddingVertical: 10 },
  send: { marginTop: 14, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
});
