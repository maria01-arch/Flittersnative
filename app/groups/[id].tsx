import { useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Image, LayoutAnimation } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import MessageBubble from '@/components/MessageBubble';
import { setActiveGroup } from '@/lib/activeChatTracker';
import VoiceRecordingBar from '@/components/VoiceRecordingBar';
import VoicePreviewBar from '@/components/VoicePreviewBar';
import { spacing } from '@/lib/theme';

import { useAppForeground } from '@/lib/useAppForeground';
import { useVoiceRecorder } from '@/lib/useVoiceRecorder';
import { uploadVoiceNote, uploadImage } from '@/lib/upload';

// Required on Android under the old architecture for LayoutAnimation to do
// anything; on the New Architecture (confirmed active in this project via
// app.json) it's already a guaranteed no-op, and calling it anyway just
// prints a console warning on every load for no benefit — so the call
// itself is skipped rather than guarded.
const animateNextChange = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

const PAGE_SIZE = 30;

export default function GroupChatScreen() {
  const { id, name } = useLocalSearchParams();
  const { session } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    setActiveGroup(id as string);
    return () => setActiveGroup(null);
  }, [id]);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const channelRef = useRef<any>(null);
  const connectRef = useRef<() => void>(() => {});
  const myProfileRef = useRef<any>(null);
  const voice = useVoiceRecorder();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [voicePreview, setVoicePreview] = useState<{ uri: string; duration: number } | null>(null);

  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const typingLastSeen = useRef<Record<string, number>>({});
  const typingThrottle = useRef<any>(null);
  const typingNames = Object.values(typingUsers);

  const sendTyping = () => {
    if (typingThrottle.current) return;
    channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { user_id: session?.user?.id, name: session?.user?.email } });
    typingThrottle.current = setTimeout(() => {
      typingThrottle.current = null;
    }, 1500);
  };

  const attachExtras = async (msgs: any[]) => {
    if (!msgs.length) return msgs;
    const ids = msgs.map((m) => m.id);
    const senderIds = [...new Set(msgs.map((m) => m.sender_id))];
    const [{ data: reactions }, { data: authors }] = await Promise.all([
      supabase.from('group_message_reactions').select('group_message_id,user_id,emoji').in('group_message_id', ids),
      supabase.from('profiles').select('id,display_name,avatar_url').in('id', senderIds),
    ]);
    const authorMap: Record<string, any> = {};
    (authors || []).forEach((a: any) => (authorMap[a.id] = a));
    return msgs.map((m) => ({
      ...m,
      reactions: (reactions || []).filter((r: any) => r.group_message_id === m.id),
      author: authorMap[m.sender_id],
    }));
  };

  const loadInitial = async () => {
    const { data: msgs } = await supabase
      .from('group_messages')
      .select('*')
      .eq('group_id', id)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    const withExtras = await attachExtras(msgs || []);
    setMessages(withExtras);
    setHasMore((msgs || []).length === PAGE_SIZE);

    const { data: pins } = await supabase.from('pinned_messages').select('message_id').eq('group_id', id);
    setPinnedIds(new Set((pins || []).map((p: any) => p.message_id)));

    if (session?.user?.id) {
      const { data: me } = await supabase.from('profiles').select('id,display_name,avatar_url').eq('id', session.user.id).single();
      myProfileRef.current = me;
    }
    setLoading(false);
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    const oldest = messages[messages.length - 1];
    const { data: older } = await supabase
      .from('group_messages')
      .select('*')
      .eq('group_id', id)
      .lt('created_at', oldest.created_at)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    const withExtras = await attachExtras(older || []);
    setMessages((prev) => [...prev, ...withExtras]);
    setHasMore((older || []).length === PAGE_SIZE);
    setLoadingMore(false);
  };

  const refreshReactionsFor = async (messageId: string) => {
    const { data } = await supabase.from('group_message_reactions').select('user_id,emoji').eq('group_message_id', messageId);
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: data || [] } : m)));
  };

  const addIncomingMessage = (msg: any, author?: any) => {
    setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [{ ...msg, reactions: msg.reactions || [], author: author || msg.author }, ...prev]));
  };

  useEffect(() => {
    loadInitial();
    if (session?.user?.id) {
      supabase.from('group_members').update({ last_read_at: new Date().toISOString() }).eq('group_id', id).eq('user_id', session.user.id).then(() => {});
    }

    let active = true;
    let retry = 0;
    let connecting = false;

    const connect = async () => {
      if (!active || connecting) return;
      connecting = true;

      const existing = supabase.getChannels().filter((c: any) => c.topic === `realtime:gc:${id}`);
      for (const ch of existing) {
        await supabase.removeChannel(ch);
      }
      if (!active) return;

      let channel;
      try {
        channel = supabase
          .channel(`gc:${id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `group_id=eq.${id}` }, async (payload) => {
          const { data: author } = await supabase.from('profiles').select('display_name,avatar_url').eq('id', payload.new.sender_id).single();
          addIncomingMessage(payload.new, author);
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'group_messages', filter: `group_id=eq.${id}` }, (payload) => {
          setMessages((prev) => prev.map((m) => (m.id === payload.new.id ? { ...m, content: payload.new.content } : m)));
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'group_messages' }, (payload) => {
          setMessages((prev) => prev.filter((m) => m.id !== (payload.old as any).id));
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'group_message_reactions' }, (payload: any) => {
          const mid = payload.new?.group_message_id || payload.old?.group_message_id;
          if (mid) refreshReactionsFor(mid);
        })
        .on('broadcast', { event: 'new_message' }, (payload: any) => {
          const msg = payload.payload;
          if (!msg?.id) return;
          addIncomingMessage(msg, msg.author);
        })
        .on('broadcast', { event: 'typing' }, (payload: any) => {
          const { user_id, name } = payload.payload || {};
          if (!user_id || user_id === session?.user?.id) return;
          typingLastSeen.current[user_id] = Date.now();
          setTypingUsers((prev) => (prev[user_id] === (name || 'Someone') ? prev : { ...prev, [user_id]: name || 'Someone' }));
        })
        .subscribe((status: string) => {
            console.log('[GC] channel status:', status);
            connecting = false;
            if (status === 'SUBSCRIBED') {
              retry = 0;
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              const delay = Math.min(1000 * 2 ** retry, 10000);
              retry += 1;
              setTimeout(connect, delay);
            }
          });
        channelRef.current = channel;
      } catch (e) {
        console.log('[GC] channel setup failed, will retry:', e);
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

  const makeTempMessage = (fields: any) => ({
    id: `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    group_id: id,
    sender_id: session?.user?.id,
    author: myProfileRef.current,
    created_at: new Date().toISOString(),
    reactions: [],
    _pending: true,
    ...fields,
  });

  const addOptimistic = (msg: any) => {
    animateNextChange();
    setMessages((prev) => [msg, ...prev]);
  };

  const resolveOptimistic = (tempId: string, data: any) => {
    animateNextChange();
    const withAuthor = { ...data, author: myProfileRef.current };
    setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...withAuthor, reactions: [] } : m)));
    return withAuthor;
  };

  const failOptimistic = (tempId: string) => {
    animateNextChange();
    setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, _pending: false, _failed: true } : m)));
  };

  const sendTextMessage = async (content: string, replyTo: any, tempId?: string) => {
    const { data, error } = await supabase
      .from('group_messages')
      .insert({
        group_id: id,
        sender_id: session!.user.id,
        content,
        reply_to: replyTo?.content || null,
        reply_to_id: replyTo?.id || null,
      })
      .select()
      .single();

    if (error || !data) {
      console.error('[send] insert failed:', error?.message, error);
      if (tempId) failOptimistic(tempId);
      return;
    }
    let withAuthor;
    if (tempId) withAuthor = resolveOptimistic(tempId, data);
    else {
      withAuthor = { ...data, author: myProfileRef.current };
      addIncomingMessage(withAuthor);
    }
    channelRef.current?.send({ type: 'broadcast', event: 'new_message', payload: withAuthor });
  };

  const send = async () => {
    if (!text.trim() || !session?.user?.id) return;
    const content = text.trim();

    if (editingId) {
      animateNextChange();
      setMessages((prev) => prev.map((m) => (m.id === editingId ? { ...m, content } : m)));
      const editId = editingId;
      setEditingId(null);
      setText('');
      await supabase.from('group_messages').update({ content }).eq('id', editId).eq('sender_id', session.user.id);
      return;
    }

    const replyTo = replyingTo;
    setText('');
    setReplyingTo(null);

    const temp = makeTempMessage({
      content,
      reply_to: replyTo?.content || null,
      reply_to_id: replyTo?.id || null,
    });
    addOptimistic(temp);
    sendTextMessage(content, replyTo, temp.id);
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      console.warn('[pickImage] media library permission denied');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled && result.assets?.[0]) setImageUri(result.assets[0].uri);
  };

  const sendImageMessage = async (localUri: string, tempId: string) => {
    const url = await uploadImage(localUri, `messages/${session!.user.id}`);
    if (!url) {
      console.error('[sendImage] upload returned no url');
      failOptimistic(tempId);
      return;
    }

    const { data, error } = await supabase
      .from('group_messages')
      .insert({ group_id: id, sender_id: session!.user.id, content: '', image_url: url })
      .select()
      .single();

    if (error || !data) {
      console.error('[sendImage] insert failed:', error?.message, error);
      failOptimistic(tempId);
      return;
    }
    const withAuthor = resolveOptimistic(tempId, data);
    channelRef.current?.send({ type: 'broadcast', event: 'new_message', payload: withAuthor });
  };

  const sendImage = () => {
    if (!imageUri || !session?.user?.id) return;
    const localUri = imageUri;
    setImageUri(null);
    const temp = makeTempMessage({ content: '', image_url: localUri });
    addOptimistic(temp);
    sendImageMessage(localUri, temp.id);
  };

  const startVoice = async () => {
    const ok = await voice.start();
    if (!ok) console.warn('[startVoice] permission denied or failed to start');
  };
  const cancelVoice = async () => {
    await voice.cancel();
  };

  const stopToPreview = async () => {
    const result = await voice.stop();
    if (!result) {
      console.error('[stopToPreview] recorder returned no result (no uri)');
      return;
    }
    setVoicePreview(result);
  };
  const discardPreview = () => setVoicePreview(null);

  const sendVoiceMessage = async (localUri: string, duration: number, tempId: string) => {
    const voiceUrl = await uploadVoiceNote(localUri);
    if (!voiceUrl) {
      console.error('[sendVoiceNote] upload returned no url — see [Upload] log above for the server response');
      failOptimistic(tempId);
      return;
    }

    const { data, error } = await supabase
      .from('group_messages')
      .insert({
        group_id: id,
        sender_id: session!.user.id,
        content: '',
        is_voice: true,
        voice_url: voiceUrl,
        voice_duration: duration,
      })
      .select()
      .single();

    if (error || !data) {
      console.error('[sendVoiceNote] insert failed:', error?.message, error);
      failOptimistic(tempId);
      return;
    }
    const withAuthor = resolveOptimistic(tempId, data);
    channelRef.current?.send({ type: 'broadcast', event: 'new_message', payload: withAuthor });
  };

  const confirmSendPreview = () => {
    if (!voicePreview || !session?.user?.id) return;
    const { uri, duration } = voicePreview;
    setVoicePreview(null);
    const temp = makeTempMessage({
      content: '',
      is_voice: true,
      voice_url: uri,
      voice_duration: duration,
    });
    addOptimistic(temp);
    sendVoiceMessage(uri, duration, temp.id);
  };

  const retryMessage = (m: any) => {
    if (!m._failed) return;
    animateNextChange();
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, _pending: true, _failed: false } : x)));
    if (m.is_voice) sendVoiceMessage(m.voice_url, m.voice_duration, m.id);
    else if (m.image_url) sendImageMessage(m.image_url, m.id);
    else sendTextMessage(m.content, null, m.id);
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
    await supabase.from('group_messages').delete().eq('id', m.id).eq('sender_id', session.user.id);
  };
  const handleReact = async (m: any, emoji: string) => {
    if (!session?.user?.id) return;
    const mine = (m.reactions || []).find((r: any) => r.user_id === session.user.id);
    const optimistic = mine && mine.emoji === emoji
      ? (m.reactions || []).filter((r: any) => r.user_id !== session.user.id)
      : [...(m.reactions || []).filter((r: any) => r.user_id !== session.user.id), { user_id: session.user.id, emoji }];
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, reactions: optimistic } : x)));
    if (mine && mine.emoji === emoji) {
      await supabase.from('group_message_reactions').delete().eq('group_message_id', m.id).eq('user_id', session.user.id);
    } else {
      await supabase.from('group_message_reactions').upsert({ group_message_id: m.id, user_id: session.user.id, emoji }, { onConflict: 'group_message_id,user_id' });
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
      await supabase.from('pinned_messages').delete().eq('group_id', id).eq('message_id', m.id);
    } else {
      await supabase.from('pinned_messages').insert({ group_id: id, message_id: m.id, pinned_by: session.user.id });
    }
  };

  const pinnedMessage = messages.find((m) => pinnedIds.has(m.id));

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24 + insets.bottom}
    >
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.topBarCenter} onPress={() => router.push({ pathname: '/groups/settings', params: { id } })}>
          <View>
            <Text style={[styles.topBarTitle, { color: colors.text }]}>{name || 'Group'}</Text>
            {typingNames.length > 0 && (
              <Text style={[styles.statusText, { color: colors.primary }]} numberOfLines={1}>
                {typingNames.join(', ')} {typingNames.length === 1 ? 'is' : 'are'} typing...
              </Text>
            )}
          </View>
        </TouchableOpacity>
        <View style={{ width: 24 }} />
      </View>

      {pinnedMessage && (
        <View style={[styles.pinnedBanner, { backgroundColor: colors.bubbleTheirs, borderBottomColor: colors.border }]}>
          <Ionicons name="pin" size={14} color={colors.primary} />
          <Text style={[styles.pinnedBannerText, { color: colors.text }]} numberOfLines={1}>{pinnedMessage.content}</Text>
        </View>
      )}

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id?.toString()}
        inverted
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        keyboardShouldPersistTaps="handled"
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
              senderAvatar={item.author?.avatar_url}
              senderName={item.author?.display_name}
              showSender={item.sender_id !== session?.user?.id}
              isPinned={pinnedIds.has(item.id)}
              showTimestamp={!groupedWithBelow}
              tightTop={groupedWithAbove}
              onReply={handleReply}
              onCopy={handleCopy}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onReact={handleReact}
              onPin={handlePin}
              onRetry={retryMessage}
            />
          );
        }}
        ListEmptyComponent={<Text style={[styles.empty, { color: colors.subtext }]}>No messages yet. Say hi 👋</Text>}
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
      {voice.recording ? (
        <VoiceRecordingBar seconds={voice.seconds} onCancel={cancelVoice} onSend={stopToPreview} />
      ) : voicePreview ? (
        <VoicePreviewBar uri={voicePreview.uri} duration={voicePreview.duration} onDiscard={discardPreview} onSend={confirmSendPreview} />
      ) : (
        <>
          {imageUri && (
            <View style={[styles.imagePreviewBar, { borderTopColor: colors.border, backgroundColor: colors.card }]}>
              <Image source={{ uri: imageUri }} style={styles.imagePreviewThumb} />
              <TouchableOpacity onPress={() => setImageUri(null)} style={styles.imagePreviewRemove}>
                <Ionicons name="close-circle" size={22} color={colors.subtext} />
              </TouchableOpacity>
              <TouchableOpacity onPress={sendImage} style={[styles.sendImageBtn, { backgroundColor: colors.primary }]}>
                <Ionicons name="send" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
          <View style={[styles.inputBar, { borderTopColor: colors.border, backgroundColor: colors.card, paddingBottom: 10 + insets.bottom }]}>
            <TouchableOpacity onPress={pickImage}>
              <Ionicons name="image-outline" size={26} color={colors.primary} />
            </TouchableOpacity>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text }]}
              placeholder="Message the group..."
              placeholderTextColor={colors.faint}
              value={text}
              onChangeText={(t) => {
                setText(t);
                sendTyping();
              }}
            />
            {text.trim() ? (
              <TouchableOpacity onPress={send} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="send" size={26} color={colors.primary} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={startVoice} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="mic" size={28} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 50, paddingHorizontal: spacing.lg, paddingBottom: 12, borderBottomWidth: 1 },
  topBarCenter: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginHorizontal: 10 },
  topBarTitle: { fontSize: 16, fontWeight: '700' },
  statusText: { fontSize: 11, marginTop: 1, minHeight: 14 },
  pinnedBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.lg, paddingVertical: 8, borderBottomWidth: 1 },
  pinnedBannerText: { flex: 1, fontSize: 13 },
  empty: { textAlign: 'center', marginTop: 30, transform: [{ scaleY: -1 }] },
  previewBar: { flexDirection: 'row', alignItems: 'center', padding: 10, paddingHorizontal: spacing.lg, borderTopWidth: 1, gap: 10 },
  previewLabel: { fontSize: 12, fontWeight: '700' },
  previewText: { fontSize: 13, marginTop: 1 },
  inputBar: { flexDirection: 'row', alignItems: 'center', padding: 12, borderTopWidth: 1, gap: 12 },
  input: { flex: 1, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 11, fontSize: 16, maxHeight: 120, minHeight: 44 },
  imagePreviewBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: 10, borderTopWidth: 1, gap: 10 },
  imagePreviewThumb: { width: 52, height: 52, borderRadius: 10, backgroundColor: '#00000010' },
  imagePreviewRemove: { marginLeft: -14, marginTop: -30 },
  sendImageBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' },
});
