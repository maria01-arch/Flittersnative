import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, TextInput, FlatList, TouchableOpacity, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import Text from '@/components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/ThemeContext';
import Avatar from './Avatar';
import { ForwardTarget } from '@/lib/forward';

// Pick one or more of your chats (people and groups). Used by "Forward" and
// by "Send in message" on a post.
export default function ChatPickerSheet({
  visible,
  userId,
  title = 'Send to',
  busy,
  dmOnly,
  header,
  onClose,
  onSend,
}: {
  visible: boolean;
  userId?: string;
  title?: string;
  busy?: boolean;
  // Only people (no groups) — used when something is shared into Flitters.
  dmOnly?: boolean;
  header?: React.ReactNode;
  onClose: () => void;
  onSend: (targets: ForwardTarget[]) => void;
}) {
  const { colors } = useTheme();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Record<string, ForwardTarget>>({});

  useEffect(() => {
    if (!visible || !userId) return;
    setPicked({});
    setQ('');
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: myParts }, { data: myGroups }] = await Promise.all([
        supabase.from('conversation_participants').select('conversation_id').eq('user_id', userId),
        dmOnly ? Promise.resolve({ data: [] as any[] }) : supabase.from('group_members').select('group_id').eq('user_id', userId),
      ]);
      const convIds = (myParts || []).map((p: any) => p.conversation_id);
      const groupIds = (myGroups || []).map((g: any) => g.group_id);
      const out: any[] = [];
      if (convIds.length) {
        const { data: others } = await supabase.from('conversation_participants').select('conversation_id,user_id').in('conversation_id', convIds).neq('user_id', userId);
        const ids = [...new Set((others || []).map((o: any) => o.user_id))];
        const { data: profs } = ids.length ? await supabase.from('profiles').select('id,display_name,username,avatar_url').in('id', ids) : { data: [] };
        const pm: Record<string, any> = {};
        (profs || []).forEach((p: any) => (pm[p.id] = p));
        (others || []).forEach((o: any) => {
          const p = pm[o.user_id];
          if (p) out.push({ key: `dm_${o.conversation_id}`, kind: 'dm', id: o.conversation_id, otherId: o.user_id, name: p.display_name || p.username || 'Unknown', sub: '@' + (p.username || ''), avatar: p.avatar_url });
        });
      }
      if (!dmOnly && groupIds.length) {
        const { data: gs } = await supabase.from('groups').select('id,name,avatar_url,cover_color').in('id', groupIds);
        (gs || []).forEach((g: any) => out.push({ key: `group_${g.id}`, kind: 'group', id: g.id, name: g.name, sub: 'Group', avatar: g.avatar_url, color: g.cover_color }));
      }
      out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      if (!cancelled) {
        setItems(out);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, userId, dmOnly]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? items.filter((i) => String(i.name).toLowerCase().includes(t) || String(i.sub).toLowerCase().includes(t)) : items;
  }, [items, q]);
  const count = Object.keys(picked).length;

  const toggle = (i: any) =>
    setPicked((prev) => {
      const next = { ...prev };
      if (next[i.key]) delete next[i.key];
      else if (Object.keys(next).length < 10) next[i.key] = { kind: i.kind, id: i.id, otherId: i.otherId };
      return next;
    });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: colors.card }]} onPress={() => {}}>
          <View style={styles.head}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={colors.subtext} />
            </TouchableOpacity>
          </View>
          {header}
          <TextInput
            style={[styles.search, { backgroundColor: colors.inputBg, color: colors.text }]}
            placeholder={dmOnly ? 'Search people' : 'Search chats'}
            placeholderTextColor={colors.faint}
            value={q}
            onChangeText={setQ}
          />
          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 40 }} />
          ) : (
            <FlatList
              data={shown}
              keyExtractor={(i) => i.key}
              style={{ maxHeight: 360 }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={{ color: colors.subtext, textAlign: 'center', marginVertical: 30 }}>No chats found</Text>}
              renderItem={({ item }) => {
                const on = !!picked[item.key];
                return (
                  <TouchableOpacity style={styles.row} onPress={() => toggle(item)}>
                    {item.kind === 'group' && !item.avatar ? (
                      <View style={[styles.gAvatar, { backgroundColor: item.color || colors.primary }]}>
                        <Text style={{ color: '#fff', fontWeight: '800' }}>{item.name?.[0]?.toUpperCase()}</Text>
                      </View>
                    ) : (
                      <Avatar uri={item.avatar} size={40} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={1}>{item.name}</Text>
                      <Text style={{ color: colors.subtext, fontSize: 12 }} numberOfLines={1}>{item.sub}</Text>
                    </View>
                    <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={on ? colors.primary : colors.faint} />
                  </TouchableOpacity>
                );
              }}
            />
          )}
          <TouchableOpacity
            disabled={!count || busy}
            onPress={() => onSend(Object.values(picked))}
            style={[styles.send, { backgroundColor: colors.primary, opacity: !count || busy ? 0.5 : 1 }]}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>{count ? `Send to ${count}` : 'Pick a chat'}</Text>}
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 18 },
  card: { borderRadius: 20, padding: 16 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  search: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 9, fontSize: 14, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  gAvatar: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  send: { borderRadius: 22, paddingVertical: 13, alignItems: 'center', marginTop: 12 },
});
