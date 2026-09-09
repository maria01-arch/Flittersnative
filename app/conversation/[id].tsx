import { useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import MessageBubble from '@/components/MessageBubble';
import { spacing } from '@/lib/theme';
import { useOnlinePresence } from '@/lib/usePresence';
import { useAppForeground } from '@/lib/useAppForeground';

const PAGE_SIZE = 30;

export default function ConversationScreen() {
  const { id, name, otherId, otherAvatar } = useLocalSearchParams();
  const { session } = useAuth();
  const { colors } = useTheme();
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [otherLastRead, setOtherLastRead] = useState<string | null>(null);
  const channelRef = useRef<any>(null);
  const connectRef = useRef<() => void>(() => {});

  const onlineIds = useOnlinePresence(session?.user?.id);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const typingLastSeen = useRef<Record<string, number>>({});
  const typingThrottle = useRef<any>(null);
  const isOtherTyping = Object.keys(typingUsers).length > 0;

  const sendTyping = () => {
    if (typingThrottle.current) return;
    channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { user_id: session?.user?.id, name: session?.user?.email } });
    typingThrottle.current = setTimeout(() => {
      typingThrottle.current = null;
    }, 1500);
  };
  const isOtherOnline = otherId ? onlineIds.has(otherId as string) : false;

  const attachReactions = async (msgs: any[]) => {
    if (!msgs.length) return msgs;
    const ids = msgs.map((m) => m.id);
    const { data: reactions } = await supabase.from('message_reactions').select('message_id,user_id,emoji').in('message_id', ids);
    return msgs.map((m) => ({ ...m, reactions: (reactions || []).filter((r: any) => r.message_id === m.id) }));
  };

  const loadInitial = async () => {
    const { data: msgs } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    const withReactions = await attachReactions(msgs || []);
    setMessages(withReactions);
    setHasMore((msgs || []).length === PAGE_SIZE);

    const { data: pins } = await supabase.from('pinned_messages').select('message_id').eq('conversation_id', id);
    setPinnedIds(new Set((pins || []).map((p: any) => p.message_id)));
    setLoading(false);
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    const oldest = messages[messages.length - 1];
    const { data: older } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', id)
      .lt('created_at', oldest.created_at)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    const withReactions = await attachReactions(older || []);
    setMessages((prev) => [...prev, ...withReactions]);
    setHasMore((older || []).length === PAGE_SIZE);
    setLoadingMore(false);
  };

  const refreshReactionsFor = async (messageId: string) => {
    const { data } = await supabase.from('message_reactions').select('user_id,emoji').eq('message_id', messageId);
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: data || [] } : m)));
  };

  const loadOtherReadState = async () => {
    if (!otherId) return;
    const { data } = await supabase.from('conversation_participants').select('last_read_at').eq('conversation_id', id).eq('user_id', otherId).maybeSingle();
    setOtherLastRead(data?.last_read_at || null);
  };

  const addIncomingMessage = (msg: any) => {
    setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [{ ...msg, reactions: msg.reactions || [] }, ...prev]));
    if (msg.sender_id !== session?.user?.id && !msg.read_at) {
      const readAt = new Date().toISOString();
      supabase.from('messages').update({ read_at: readAt }).eq('id', msg.id).then(() => {
        channelRef.current?.send({ type: 'broadcast', event: 'read_receipt', payload: { reader_id: session?.user?.id, read_at: readAt } });
      });
    }
  };

  const markAllRead = async () => {
    if (!session?.user?.id) return;
    const readAt = new Date().toISOString();
    await supabase
      .from('messages')
      .update({ read_at: readAt })
      .eq('conversation_id', id)
      .neq('sender_id', session.user.id)
      .is('read_at', null);
    // Broadcast instantly — Postgres replication of this UPDATE can lag
    // by several seconds, but the other person should see the tick
    // change the moment we've actually read it.
    channelRef.current?.send({ type: 'broadcast', event: 'read_receipt', payload: { reader_id: session?.user?.id, read_at: readAt } });
  };

  useEffect(() => {
    loadInitial();
    loadOtherReadState();
    if (session?.user?.id) {
      supabase.from('conversation_participants').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', id).eq('user_id', session.user.id).then(() => {});
    }

    let active = true;
    let retry = 0;
    let connecting = false;

    const connect = async () => {
      if (!active || connecting) return;
      connecting = true;

      // Fully remove any existing channel with this same topic before
      // creating a new one — Supabase reuses channel objects by topic
      // name, so creating one while an old one is still registered
      // (even mid-teardown) hands back the stale, already-subscribed
      // instance and crashes when we try to attach new listeners to it.
      const existing = supabase.getChannels().filter((c: any) => c.topic === `realtime:m:${id}`);
      for (const ch of existing) {
        await supabase.removeChannel(ch);
      }
      if (!active) return;

      let channel;
      try {
        channel = supabase
          .channel(`m:${id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, (payload) => {
          addIncomingMessage(payload.new);
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, (payload) => {
          setMessages((prev) => prev.map((m) => (m.id === payload.new.id ? { ...m, content: payload.new.content } : m)));
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
          setMessages((prev) => prev.filter((m) => m.id !== (payload.old as any).id));
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, (payload: any) => {
          const mid = payload.new?.message_id || payload.old?.message_id;
          if (mid) refreshReactionsFor(mid);
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_participants', filter: `conversation_id=eq.${id}` }, (payload: any) => {
          if (payload.new.user_id === otherId) setOtherLastRead(payload.new.last_read_at);
        })
        .on('broadcast', { event: 'new_message' }, (payload: any) => {
          const msg = payload.payload;
          if (!msg?.id) return;
          addIncomingMessage(msg);
          if (msg.sender_id !== session?.user?.id) {
            supabase.from('conversation_participants').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', id).eq('user_id', session?.user?.id).then(() => {});
          }
        })
        .on('broadcast', { event: 'typing' }, (payload: any) => {
          const { user_id, name } = payload.payload || {};
          if (!user_id || user_id === session?.user?.id) return;
          typingLastSeen.current[user_id] = Date.now();
          setTypingUsers((prev) => (prev[user_id] === (name || 'Someone') ? prev : { ...prev, [user_id]: name || 'Someone' }));
        })
        .on('broadcast', { event: 'read_receipt' }, (payload: any) => {
          const { reader_id, read_at } = payload.payload || {};
          if (!reader_id || reader_id === session?.user?.id || !read_at) return;
          setMessages((prev) =>
            prev.map((m) =>
              m.sender_id === session?.user?.id && !m.read_at && new Date(m.created_at) <= new Date(read_at)
                ? { ...m, read_at }
                : m
            )
          );
        })
        .subscribe((status: string) => {
            console.log('[DM] channel status:', status);
            connecting = false;
            if (status === 'SUBSCRIBED') {
              retry = 0;
              markAllRead();
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              const delay = Math.min(1000 * 2 ** retry, 10000);
              retry += 1;
              setTimeout(connect, delay);
            }
          });
        channelRef.current = channel;
      } catch (e) {
        console.log('[DM] channel setup failed, will retry:', e);
        connecting = false;
        const delay = Math.min(1000 * 2 ** retry, 10000);
        retry += 1;
        setTimeout(connect, delay);
      }
    };

    connectRef.current = connect;
    connect();

    return () => {
      active = false;
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [id]);

  useAppForeground(() => {
    loadInitial();
    loadOtherReadState();
    markAllRead();
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setTypingUsers((prev) => {
        let changed = false;
        const next = { ...prev };
        Object.keys(next).forEach((uid) => {
          if (now - (typingLastSeen.current[uid] || 0) > 3000) {
            delete next[uid];
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const send = async () => {
    if (!text.trim() || !session?.user?.id) return;
    const content = text.trim();

    if (editingId) {
      setMessages((prev) => prev.map((m) => (m.id === editingId ? { ...m, content } : m)));
      const editId = editingId;
      setEditingId(null);
      setText('');
      await supabase.from('messages').update({ content }).eq('id', editId).eq('sender_id', session.user.id);
      return;
    }

    const replyTo = replyingTo;
    setText('');
    setReplyingTo(null);

    const { data } = await supabase
      .from('messages')
      .insert({
        conversation_id: id,
        sender_id: session.user.id,
        content,
        reply_to: replyTo?.content || null,
        reply_to_id: replyTo?.id || null,
      })
      .select()
      .single();

    if (data) {
      addIncomingMessage(data);
      // Broadcast the full message straight to the other side — no waiting
      // on Postgres replication lag for it to feel instant on their end.
      channelRef.current?.send({ type: 'broadcast', event: 'new_message', payload: data });
      // Also ping the recipient's personal inbox channel directly, so
      // their Chats list updates instantly even if they're not currently
      // inside this conversation — that channel only otherwise updates
      // via Postgres replication, which can lag.
      if (otherId) {
        supabase.channel(`inbox_${otherId}`).send({ type: 'broadcast', event: 'ping', payload: {} });
      }
    }
  };

  const handleReply = (m: any) => {
    setEditingId(null);
    setReplyingTo(m);
  };
  const handleCopy = async (m: any) => {
    await Clipboard.setStringAsync(m.content);
  };
  const handleEdit = (m: any) => {
    setReplyingTo(null);
    setEditingId(m.id);
    setText(m.content);
  };
  const handleDelete = async (m: any) => {
    if (!session?.user?.id) return;
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    await supabase.from('messages').delete().eq('id', m.id).eq('sender_id', session.user.id);
  };
  const handleReact = async (m: any, emoji: string) => {
    if (!session?.user?.id) return;
    const mine = (m.reactions || []).find((r: any) => r.user_id === session.user.id);
    const optimistic = mine && mine.emoji === emoji
      ? (m.reactions || []).filter((r: any) => r.user_id !== session.user.id)
      : [...(m.reactions || []).filter((r: any) => r.user_id !== session.user.id), { user_id: session.user.id, emoji }];
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, reactions: optimistic } : x)));
    if (mine && mine.emoji === emoji) {
      await supabase.from('message_reactions').delete().eq('message_id', m.id).eq('user_id', session.user.id);
    } else {
      await supabase.from('message_reactions').upsert({ message_id: m.id, user_id: session.user.id, emoji }, { onConflict: 'message_id,user_id' });
    }
  };
  const handlePin = async (m: any) => {
    if (!session?.user?.id) return;
    const isPinned = pinnedIds.has(m.id);
    const next = new Set(pinnedIds);
    if (isPinned) next.delete(m.id);
    else next.add(m.id);
    setPinnedIds(next);
    if (isPinned) {
      await supabase.from('pinned_messages').delete().eq('conversation_id', id).eq('message_id', m.id);
    } else {
      await supabase.from('pinned_messages').insert({ conversation_id: id, message_id: m.id, pinned_by: session.user.id });
    }
  };

  const pinnedMessage = messages.find((m) => pinnedIds.has(m.id));

  useEffect(() => {
    const interval = setInterval(() => {
      loadOtherReadState();
    }, 5000);
    return () => clearInterval(interval);
  }, [id]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.topBarCenter} onPress={() => otherId && router.push(`/user/${otherId}`)}>
          <View>
            <Image source={{ uri: (otherAvatar as string) || 'https://placehold.co/80x80/6C5CE7/fff?text=?' }} style={styles.topBarAvatar} />
            {isOtherOnline && <View style={[styles.onlineDot, { borderColor: colors.card }]} />}
          </View>
          <View>
            <Text style={[styles.topBarTitle, { color: colors.text }]}>{name || 'Chat'}</Text>
            <Text style={[styles.statusText, { color: isOtherTyping ? colors.primary : colors.subtext }]}>
              {isOtherTyping ? 'typing...' : isOtherOnline ? 'Active now' : ''}
            </Text>
          </View>
        </TouchableOpacity>
        <View style={{ width: 24 }} />
      </View>

      {pinnedMessage && (
        <TouchableOpacity style={[styles.pinnedBanner, { backgroundColor: colors.bubbleTheirs, borderBottomColor: colors.border }]}>
          <Ionicons name="pin" size={14} color={colors.primary} />
          <Text style={[styles.pinnedBannerText, { color: colors.text }]} numberOfLines={1}>{pinnedMessage.content}</Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id?.toString()}
        inverted
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 10 }} color={colors.primary} /> : null}
        contentContainerStyle={{ paddingVertical: 8 }}
        renderItem={({ item, index }) => {
          const older = messages[index + 1];
          const newer = messages[index - 1];
          const groupedWithAbove = !!older && older.sender_id === item.sender_id && (new Date(item.created_at).getTime() - new Date(older.created_at).getTime()) <= 120000;
          const groupedWithBelow = !!newer && newer.sender_id === item.sender_id && (new Date(newer.created_at).getTime() - new Date(item.created_at).getTime()) <= 120000;
          return (
            <MessageBubble
              message={item}
              isMine={item.sender_id === session?.user?.id}
              currentUserId={session?.user?.id}
              isPinned={pinnedIds.has(item.id)}
              isRead={item.sender_id === session?.user?.id ? !!item.read_at : undefined}
              showTimestamp={!groupedWithBelow}
              tightTop={groupedWithAbove}
              onReply={handleReply}
              onCopy={handleCopy}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onReact={handleReact}
              onPin={handlePin}
            />
          );
        }}
        ListEmptyComponent={<Text style={[styles.empty, { color: colors.subtext }]}>Say hi 👋</Text>}
      />
      {(replyingTo || editingId) && (
        <View style={[styles.previewBar, { borderTopColor: colors.border, backgroundColor: colors.bubbleTheirs }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.previewLabel, { color: colors.primary }]}>{editingId ? 'Editing message' : 'Replying to'}</Text>
            <Text style={[styles.previewText, { color: colors.subtext }]} numberOfLines={1}>
              {editingId ? messages.find((m) => m.id === editingId)?.content : replyingTo?.content}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              setReplyingTo(null);
              setEditingId(null);
              setText('');
            }}
          >
            <Ionicons name="close" size={20} color={colors.subtext} />
          </TouchableOpacity>
        </View>
      )}
      <View style={[styles.inputBar, { borderTopColor: colors.border, backgroundColor: colors.card }]}>
        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text }]}
          placeholder="Message..."
          placeholderTextColor={colors.faint}
          value={text}
          onChangeText={(t) => {
            setText(t);
            sendTyping();
          }}
          multiline
        />
        <TouchableOpacity onPress={send} disabled={!text.trim()}>
          <Ionicons name="send" size={22} color={text.trim() ? colors.primary : colors.faint} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 50, paddingHorizontal: spacing.lg, paddingBottom: 12, borderBottomWidth: 1 },
  topBarCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topBarAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#ddd' },
  onlineDot: { position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: '#22C55E', borderWidth: 2 },
  topBarTitle: { fontSize: 16, fontWeight: '700' },
  statusText: { fontSize: 11, marginTop: 1, minHeight: 14 },
  pinnedBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.lg, paddingVertical: 8, borderBottomWidth: 1 },
  pinnedBannerText: { flex: 1, fontSize: 13 },
  empty: { textAlign: 'center', marginTop: 30, transform: [{ scaleY: -1 }] },
  previewBar: { flexDirection: 'row', alignItems: 'center', padding: 10, paddingHorizontal: spacing.lg, borderTopWidth: 1, gap: 10 },
  previewLabel: { fontSize: 12, fontWeight: '700' },
  previewText: { fontSize: 13, marginTop: 1 },
  inputBar: { flexDirection: 'row', alignItems: 'center', padding: 10, borderTopWidth: 1, gap: 10 },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, maxHeight: 120, minHeight: 38 },
});
