import { useCallback, useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Modal, FlatList, Pressable, Alert, ActivityIndicator } from 'react-native';
import Text from '@/components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';
import Avatar from './Avatar';
import { fetchPoll, fetchCounts, votePoll, fetchVoters, Poll, PollCount } from '@/lib/polls';

// A poll inside a chat message or a comment. Tap an option to vote; tap it again to
// take the vote back. "Pick one" polls move your vote, "pick many" polls keep them all.
export default function PollCard({ pollId, onDark = false, width = 232 }: { pollId: string; onDark?: boolean; width?: number }) {
  const { colors } = useTheme();
  const [poll, setPoll] = useState<Poll | null>(null);
  const [counts, setCounts] = useState<Record<number, PollCount>>({});
  const [missing, setMissing] = useState(false);
  // Percentages or plain vote counts on each answer (the creator picks; tap a number to flip it).
  const [asCount, setAsCount] = useState(false);
  const [votersOpen, setVotersOpen] = useState(false);
  const [voters, setVoters] = useState<any[] | null>(null);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    const c = await fetchCounts(pollId);
    if (c) setCounts(c);
  }, [pollId]);

  useEffect(() => {
    let live = true;
    (async () => {
      const p = await fetchPoll(pollId);
      if (!live) return;
      if (!p) setMissing(true);
      else {
        setPoll(p);
        setAsCount(!!p.show_counts);
        refresh();
      }
    })();
    return () => {
      live = false;
    };
  }, [pollId, refresh]);

  const txt = onDark ? '#fff' : colors.text;
  const sub = onDark ? 'rgba(255,255,255,0.75)' : colors.subtext;
  const barBg = onDark ? 'rgba(255,255,255,0.18)' : colors.border;
  const barFill = onDark ? 'rgba(255,255,255,0.38)' : colors.primary + '55';

  if (missing) return <Text style={{ color: sub, fontSize: 13 }}>This poll is no longer available.</Text>;
  if (!poll) return <ActivityIndicator color={onDark ? '#fff' : colors.primary} style={{ width, paddingVertical: 20 }} />;

  const closed = !!poll.closes_at && new Date(poll.closes_at).getTime() < Date.now();
  const total = Object.values(counts).reduce((a, c) => a + c.votes, 0);
  const people = total; // for "pick one" polls this equals the number of voters

  const vote = async (idx: number) => {
    if (busy.current || closed) return;
    busy.current = true;
    // Show the change right away; the database answer follows.
    setCounts((prev) => {
      const next: Record<number, PollCount> = {};
      Object.keys(prev).forEach((k) => (next[Number(k)] = { ...prev[Number(k)] }));
      const was = !!next[idx]?.mine;
      if (!poll.multiple) {
        Object.keys(next).forEach((k) => {
          if (next[Number(k)].mine) next[Number(k)] = { votes: Math.max(0, next[Number(k)].votes - 1), mine: false };
        });
      }
      const cur = next[idx] || { votes: 0, mine: false };
      next[idx] = was ? { votes: Math.max(0, cur.votes - 1), mine: false } : { votes: cur.votes + 1, mine: true };
      return next;
    });
    const ok = await votePoll(pollId, idx);
    busy.current = false;
    if (!ok) Alert.alert("Couldn't vote", 'Check your connection and try again.');
    refresh();
  };

  const openVoters = async () => {
    setVotersOpen(true);
    setVoters(null);
    setVoters(await fetchVoters(pollId));
  };

  return (
    <View style={{ width }}>
      <Text style={{ color: txt, fontSize: 15, fontWeight: '800', marginBottom: 2, flexShrink: 1 }}>{poll.question}</Text>
      <Text style={{ color: sub, fontSize: 12, marginBottom: 8 }}>{closed ? 'Poll closed' : poll.multiple ? 'Select one or more' : 'Select one'}</Text>
      {poll.options.map((o, i) => {
        const c = counts[i] || { votes: 0, mine: false };
        const pct = total ? Math.round((c.votes / total) * 100) : 0;
        return (
          <TouchableOpacity key={i} activeOpacity={0.8} disabled={closed} onPress={() => vote(i)} style={[styles.opt, { backgroundColor: barBg, borderColor: c.mine ? (onDark ? '#fff' : colors.primary) : 'transparent' }]}>
            <View style={[styles.fill, { width: `${pct}%`, backgroundColor: barFill }]} />
            <View style={[styles.mark, { borderColor: c.mine ? (onDark ? '#fff' : colors.primary) : sub, backgroundColor: c.mine ? (onDark ? '#fff' : colors.primary) : 'transparent', borderRadius: poll.multiple ? 5 : 10 }]}>
              {c.mine && <Ionicons name="checkmark" size={13} color={onDark ? colors.primary : '#fff'} />}
            </View>
            <Text style={{ color: txt, fontSize: 14, flex: 1, flexShrink: 1 }} numberOfLines={3}>{o}</Text>
            <Text onPress={() => setAsCount((v) => !v)} suppressHighlighting style={{ color: sub, fontSize: 12, fontWeight: '700' }}>{asCount ? String(c.votes) : total ? `${pct}%` : ''}</Text>
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity onPress={openVoters} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={{ color: sub, fontSize: 12, marginTop: 4, fontWeight: '700' }}>
          {total === 0 ? 'No votes yet' : poll.multiple ? `${total} ${total === 1 ? 'vote' : 'votes'} · see who voted` : `${people} ${people === 1 ? 'vote' : 'votes'} · see who voted`}
        </Text>
      </TouchableOpacity>

      <Modal visible={votersOpen} transparent animationType="fade" onRequestClose={() => setVotersOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setVotersOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.bg }]} onPress={() => {}}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', marginBottom: 8 }}>Who voted</Text>
            {voters === null ? (
              <ActivityIndicator color={colors.primary} style={{ margin: 20 }} />
            ) : voters.length === 0 ? (
              <Text style={{ color: colors.subtext, padding: 12 }}>No votes yet.</Text>
            ) : (
              <FlatList
                data={voters}
                keyExtractor={(v, i) => v.user_id + ':' + v.option_idx + ':' + i}
                style={{ maxHeight: 360 }}
                renderItem={({ item: v }) => (
                  <TouchableOpacity
                    style={styles.voterRow}
                    onPress={() => {
                      setVotersOpen(false);
                      router.push(`/user/${v.user_id}`);
                    }}
                  >
                    <Avatar uri={v.avatar_url} size={34} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={1}>{v.display_name || v.username || 'Someone'}</Text>
                      <Text style={{ color: colors.subtext, fontSize: 12 }} numberOfLines={1}>{poll.options[v.option_idx] || ''}</Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  opt: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1.5, paddingVertical: 10, paddingHorizontal: 10, marginBottom: 6, overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  mark: { width: 20, height: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  sheet: { borderRadius: 20, padding: 16 },
  voterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
});
