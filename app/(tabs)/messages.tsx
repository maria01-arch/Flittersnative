import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, Image, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, Pressable } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import { useOnlinePresence } from '@/lib/usePresence';
import { useInbox } from '@/lib/InboxContext';
import { useAppForeground } from '@/lib/useAppForeground';
import { spacing } from '@/lib/theme';

export default function ChatsScreen() {
  const { session } = useAuth();
  const { colors } = useTheme();
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const onlineIds = useOnlinePresence(session?.user?.id);
  const { version } = useInbox();

  const load = useCallback(async () => {
    const myId = session?.user?.id;
    if (!myId) return;

    const { data: myParts } = await supabase.from('conversation_participants').select('conversation_id').eq('user_id', myId);
    const convIds = (myParts || []).map((p: any) => p.conversation_id);

    let dmChats: any[] = [];
    if (convIds.length) {
      const { data: otherParts } = await supabase
        .from('conversation_participants')
        .select('conversation_id,user_id')
        .in('conversation_id', convIds)
        .neq('user_id', myId);
      const otherIds = [...new Set((otherParts || []).map((p: any) => p.user_id))];
      const { data: profiles } = otherIds.length ? await supabase.from('profiles').select('*').in('id', otherIds) : { data: [] };
      const profMap: Record<string, any> = {};
      (profiles || []).forEach((p: any) => (profMap[p.id] = p));

      const { data: msgs } = await supabase
        .from('messages')
        .select('conversation_id,content,created_at')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false })
        .limit(500);
      const lastByConv: Record<string, any> = {};
      (msgs || []).forEach((m: any) => {
        if (!lastByConv[m.conversation_id]) lastByConv[m.conversation_id] = m;
      });

      dmChats = (otherParts || []).map((p: any) => ({
        kind: 'dm',
        id: p.conversation_id,
        title: profMap[p.user_id]?.display_name || 'Unknown',
        avatar: profMap[p.user_id]?.avatar_url,
        otherId: p.user_id,
        lastText: lastByConv[p.conversation_id]?.content,
        lastAt: lastByConv[p.conversation_id]?.created_at,
      }));
    }

    const { data: myGroups } = await supabase.from('group_members').select('group_id').eq('user_id', myId);
    const groupIds = (myGroups || []).map((g: any) => g.group_id);
    let groupChats: any[] = [];
    if (groupIds.length) {
      const { data: groups } = await supabase.from('groups').select('*').in('id', groupIds);
      const { data: gmsgs } = await supabase
        .from('group_messages')
        .select('group_id,content,created_at')
        .in('group_id', groupIds)
        .order('created_at', { ascending: false })
        .limit(500);
      const lastByGroup: Record<string, any> = {};
      (gmsgs || []).forEach((m: any) => {
        if (!lastByGroup[m.group_id]) lastByGroup[m.group_id] = m;
      });
      groupChats = (groups || []).map((g: any) => ({
        kind: 'group',
        id: g.id,
        title: g.name,
        avatar: g.avatar_url,
        coverColor: g.cover_color,
        lastText: lastByGroup[g.id]?.content,
        lastAt: lastByGroup[g.id]?.created_at,
      }));
    }

    const all = [...dmChats, ...groupChats].sort((a: any, b: any) => new Date(b.lastAt || 0).getTime() - new Date(a.lastAt || 0).getTime());
    setChats(all);
    setLoading(false);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
      const interval = setInterval(load, 5000);
      return () => clearInterval(interval);
    }, [load])
  );

  useEffect(() => {
    load();
  }, [version]);

  useAppForeground(() => {
    load();
  });

  const openChat = (item: any) => {
    if (item.kind === 'dm') {
      router.push({ pathname: '/conversation/[id]', params: { id: item.id, name: item.title, otherId: item.otherId, otherAvatar: item.avatar || '' } });
    } else {
      router.push({ pathname: '/groups/[id]', params: { id: item.id, name: item.title } });
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <Text style={[styles.topBarTitle, { color: colors.text }]}>Chats</Text>
        <TouchableOpacity style={[styles.newBtn, { backgroundColor: colors.primary }]} onPress={() => setMenuOpen(true)}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
      <FlatList
        data={chats}
        keyExtractor={(item) => `${item.kind}_${item.id}`}
        contentContainerStyle={{ paddingBottom: 110 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.row, { borderBottomColor: colors.border }]} onPress={() => openChat(item)}>
            <View>
              {item.kind === 'group' && !item.avatar ? (
                <View style={[styles.avatar, styles.groupAvatarFallback, { backgroundColor: item.coverColor || colors.primary }]}>
                  <Text style={styles.groupAvatarLetter}>{item.title?.[0]?.toUpperCase() || 'G'}</Text>
                </View>
              ) : (
                <Image source={{ uri: item.avatar || 'https://placehold.co/80x80/6C5CE7/fff?text=' + (item.title?.[0] || '?') }} style={styles.avatar} />
              )}
              {item.kind === 'dm' && onlineIds.has(item.otherId) && <View style={[styles.onlineDot, { borderColor: colors.bg }]} />}
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.chatTitle, { color: colors.text }]}>{item.title}</Text>
                {item.kind === 'group' && <Ionicons name="people" size={13} color={colors.faint} />}
              </View>
              <Text style={[styles.lastMessage, { color: colors.subtext }]} numberOfLines={1}>{item.lastText || 'No messages yet'}</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={[styles.empty, { color: colors.subtext }]}>No chats yet. Tap + to start one.</Text>}
      />

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.card }]} onPress={() => {}}>
            <TouchableOpacity
              style={styles.sheetRow}
              onPress={() => {
                setMenuOpen(false);
                router.push('/new-message');
              }}
            >
              <Ionicons name="person-outline" size={20} color={colors.text} />
              <Text style={[styles.sheetText, { color: colors.text }]}>New Message</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetRow}
              onPress={() => {
                setMenuOpen(false);
                router.push('/groups/create');
              }}
            >
              <Ionicons name="people-outline" size={20} color={colors.text} />
              <Text style={[styles.sheetText, { color: colors.text }]}>New Group</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetRow}
              onPress={() => {
                setMenuOpen(false);
                router.push('/flitters-ai');
              }}
            >
              <Ionicons name="sparkles-outline" size={20} color={colors.text} />
              <Text style={[styles.sheetText, { color: colors.text }]}>xChord AI</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: { paddingTop: 56, paddingBottom: 14, paddingHorizontal: spacing.lg, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topBarTitle: { fontSize: 22, fontWeight: '800' },
  newBtn: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, paddingHorizontal: spacing.lg, gap: 12, borderBottomWidth: 1 },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#ddd' },
  onlineDot: { position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: '#22C55E', borderWidth: 2 },
  groupAvatarFallback: { justifyContent: 'center', alignItems: 'center' },
  groupAvatarLetter: { color: '#fff', fontWeight: '800', fontSize: 18 },
  chatTitle: { fontWeight: '700', fontSize: 15 },
  lastMessage: { fontSize: 13, marginTop: 2 },
  empty: { textAlign: 'center', marginTop: 40 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingVertical: 16, paddingBottom: 34 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 20 },
  sheetText: { fontSize: 16, fontWeight: '600' },
});
