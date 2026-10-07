import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, Pressable, Alert } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import { useOnlinePresence } from '@/lib/usePresence';
import { useInbox } from '@/lib/InboxContext';
import { useAppForeground } from '@/lib/useAppForeground';
import { spacing } from '@/lib/theme';
import Avatar from '@/components/Avatar';
import ActionSheet, { ActionSheetOption } from '@/components/ActionSheet';
import ReportModal from '@/components/ReportModal';
import { ListSkeleton } from '@/components/Skeleton';

function previewText(msg: any): string | null {
  if (!msg) return null;
  if (msg.is_voice) return '🎤 Voice message';
  if (msg.is_sticker) return '🖼️ Sticker';
  if (msg.video_url) return '🎥 Video';
  if (msg.image_url) return '📷 Photo';
  return msg.content || null;
}

export default function ChatsScreen() {
  const { session } = useAuth();
  const { colors } = useTheme();
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const onlineIds = useOnlinePresence(session?.user?.id);
  const { version } = useInbox();
  const swipeRefs = useRef<Record<string, Swipeable | null>>({});

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
        .select('conversation_id,content,is_voice,is_sticker,video_url,image_url,created_at')
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
        lastText: previewText(lastByConv[p.conversation_id]),
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
        .select('group_id,content,is_voice,is_sticker,video_url,image_url,created_at')
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
        lastText: previewText(lastByGroup[g.id]),
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

  const removeChatLocally = (item: any) => setChats((prev) => prev.filter((c) => c.id !== item.id || c.kind !== item.kind));

  const deleteChat = async (item: any) => {
    if (!session?.user?.id) return;
    if (item.kind === 'dm') {
      await supabase.from('conversation_participants').delete().eq('conversation_id', item.id).eq('user_id', session.user.id);
    } else {
      await supabase.from('group_members').delete().eq('group_id', item.id).eq('user_id', session.user.id);
    }
    removeChatLocally(item);
  };

  const blockFromChat = async (item: any) => {
    if (!session?.user?.id || item.kind !== 'dm') return;
    await supabase.from('blocks').insert({ blocker_id: session.user.id, blocked_id: item.otherId });
    await supabase.from('follows').delete().eq('follower_id', session.user.id).eq('following_id', item.otherId);
    await supabase.from('follows').delete().eq('follower_id', item.otherId).eq('following_id', session.user.id);
    removeChatLocally(item);
  };

  // Was inserting {reported_type, reported_id} — columns the real table
  // doesn't have. The real schema (matching the webapp) only has
  // reported_user_id / reported_post_id / reported_message_id /
  // reported_reel_id — there's no "report a group" concept at all, so
  // that option is now DM-only below; a specific bad message in a group
  // can be reported directly instead (see MessageActionSheet).
  const [reportTarget, setReportTarget] = useState<any>(null);
  const submitChatReport = async (reason: string, details: string) => {
    if (!session?.user?.id || !reportTarget) return;
    const { error } = await supabase
      .from('reports')
      .insert({ reporter_id: session.user.id, reported_user_id: reportTarget.otherId, reason, details: details || null });
    if (error) throw error;
  };

  const [chatMenuItem, setChatMenuItem] = useState<any>(null);

  const openChatMenu = (item: any) => {
    swipeRefs.current[`${item.kind}_${item.id}`]?.close();
    setChatMenuItem(item);
  };

  const chatMenuOptions: ActionSheetOption[] = chatMenuItem
    ? [
        ...(chatMenuItem.kind === 'dm'
          ? [{ label: 'Block', icon: 'ban-outline' as const, destructive: true, onPress: () => blockFromChat(chatMenuItem) }]
          : []),
        {
          label: chatMenuItem.kind === 'dm' ? 'Delete chat' : 'Leave group',
          icon: 'trash-outline',
          destructive: true,
          onPress: () =>
            Alert.alert(chatMenuItem.kind === 'dm' ? 'Delete this chat?' : 'Leave this group?', undefined, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Confirm', style: 'destructive', onPress: () => deleteChat(chatMenuItem) },
            ]),
        },
        ...(chatMenuItem.kind === 'dm' ? [{ label: 'Report', icon: 'flag-outline' as const, onPress: () => setReportTarget(chatMenuItem) }] : []),
      ]
    : [];

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: 60 }}>
        <ListSkeleton />
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
        renderItem={({ item }) => {
          const key = `${item.kind}_${item.id}`;
          return (
            <Swipeable
              ref={(ref) => {
                swipeRefs.current[key] = ref;
              }}
              renderLeftActions={() => (
                <TouchableOpacity style={styles.swipeAction} onPress={() => openChatMenu(item)}>
                  <Ionicons name="trash" size={22} color="#fff" />
                </TouchableOpacity>
              )}
              overshootLeft={false}
            >
              <TouchableOpacity style={[styles.row, { backgroundColor: colors.bg }]} onPress={() => openChat(item)}>
                <View>
                  {item.kind === 'group' && !item.avatar ? (
                    <View style={[styles.avatar, styles.groupAvatarFallback, { backgroundColor: item.coverColor || colors.primary }]}>
                      <Text style={styles.groupAvatarLetter}>{item.title?.[0]?.toUpperCase() || 'G'}</Text>
                    </View>
                  ) : (
                    <Avatar uri={item.avatar} size={50} />
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
            </Swipeable>
          );
        }}
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

      <ActionSheet
        visible={!!chatMenuItem}
        title={chatMenuItem?.title}
        options={chatMenuOptions}
        onClose={() => setChatMenuItem(null)}
      />
      <ReportModal visible={!!reportTarget} onClose={() => setReportTarget(null)} onSubmit={submitChatReport} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: { paddingTop: 56, paddingBottom: 14, paddingHorizontal: spacing.lg, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topBarTitle: { fontSize: 22, fontWeight: '800' },
  newBtn: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, paddingHorizontal: spacing.lg, gap: 12 },
  swipeAction: { backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center', width: 72 },
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
