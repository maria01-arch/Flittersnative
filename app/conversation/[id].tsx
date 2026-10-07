import { useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Image, LayoutAnimation, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import MessageBubble from '@/components/MessageBubble';
import { setActiveConversation } from '@/lib/activeChatTracker';
import Avatar from '@/components/Avatar';
import VerifiedBadge from '@/components/VerifiedBadge';
import VoiceRecordingBar from '@/components/VoiceRecordingBar';
import VoicePreviewBar from '@/components/VoicePreviewBar';
import StickerTray from '@/components/StickerTray';
import ReportModal from '@/components/ReportModal';
import { spacing } from '@/lib/theme';
import { useOnlinePresence } from '@/lib/usePresence';
import { useAppForeground } from '@/lib/useAppForeground';
import { useVoiceRecorder } from '@/lib/useVoiceRecorder';
import { uploadVoiceNote, uploadImage, uploadVideo } from '@/lib/upload';
import { checkVideoLimits } from '@/lib/videoLimits';

// Required on Android under the old architecture for LayoutAnimation to do
// anything; on the New Architecture (confirmed active in this project via
// app.json) it's already a guaranteed no-op, and calling it anyway just
// prints a console warning on every load for no benefit — so the call
// itself is skipped rather than guarded.
const animateNextChange = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

const PAGE_SIZE = 30;

export default function ConversationScreen() {
  const { id, name, otherId, otherAvatar } = useLocalSearchParams();
  const { session } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  // Lets the push notification handler know this conversation is the one
  // currently open, so a message arriving for it doesn't also pop a
  // foreground banner on top of the thread you're already looking at.
  useEffect(() => {
    setActiveConversation(id as string);
    return () => setActiveConversation(null);
  }, [id]);
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
  const voice = useVoiceRecorder();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [voicePreview, setVoicePreview] = useState<{ uri: string; duration: number } | null>(null);
  const [otherProfile, setOtherProfile] = useState<any>(null);
  const [showStickerTray, setShowStickerTray] = useState(false);

  useEffect(() => {
    if (!otherId) return;
    // The top bar previously only had whatever was passed as route params
    // (name, avatar) — never the full profile, so there was no verified
    // badge data available at all. Fetching it directly means the badge
    // shows correctly regardless of which screen linked into this chat.
    supabase
      .from('profiles')
      .select('display_name,avatar_url,verified,is_authentic')
      .eq('id', otherId)
      .single()
      .then(({ data }) => setOtherProfile(data));
  }, [otherId]);

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

  // A pending/failed message lives in `messages` state immediately, tagged
  // with these fields, and is swapped for the real row once the server
  // confirms it — or left in place with _failed so the bubble can offer a
  // retry instead of the message just vanishing.
  const makeTempMessage = (fields: any) => ({
    id: `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    conversation_id: id,
    sender_id: session?.user?.id,
    created_at: new Date().toISOString(),
    read_at: null,
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
    setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...data, reactions: [] } : m)));
  };

  const failOptimistic = (tempId: string) => {
    animateNextChange();
    setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, _pending: false, _failed: true } : m)));
  };

  const broadcastSent = (data: any) => {
    channelRef.current?.send({ type: 'broadcast', event: 'new_message', payload: data });
    if (otherId) {
      supabase.channel(`inbox_${otherId}`).send({ type: 'broadcast', event: 'ping', payload: {} });
    }
  };

  const sendTextMessage = async (content: string, replyTo: any, tempId?: string) => {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: id,
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
    if (tempId) resolveOptimistic(tempId, data);
    else addIncomingMessage(data);
    broadcastSent(data);
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
      await supabase.from('messages').update({ content }).eq('id', editId).eq('sender_id', session.user.id);
      return;
    }

    const replyTo = replyingTo;
    setText('');
    setReplyingTo(null);

    // Drop the bubble in immediately — the network round trip happens in
    // the background and reconciles silently when it lands.
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
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.8 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (asset.type === 'video') {
      const issue = checkVideoLimits(asset);
      if (issue) {
        Alert.alert('Video too big', issue);
        return;
      }
      setVideoUri(asset.uri);
    } else {
      setImageUri(asset.uri);
    }
  };

  const sendImageMessage = async (localUri: string, tempId: string) => {
    const url = await uploadImage(localUri, `messages/${session!.user.id}`);
    if (!url) {
      console.error('[sendImage] upload returned no url');
      failOptimistic(tempId);
      return;
    }

    const { data, error } = await supabase
      .from('messages')
      .insert({ conversation_id: id, sender_id: session!.user.id, content: '', image_url: url })
      .select()
      .single();

    if (error || !data) {
      console.error('[sendImage] insert failed:', error?.message, error);
      failOptimistic(tempId);
      return;
    }
    resolveOptimistic(tempId, data);
    broadcastSent(data);
  };

  const sendImage = () => {
    if (!imageUri || !session?.user?.id) return;
    const localUri = imageUri;
    setImageUri(null);
    // image_url is set to the local file immediately so the picked photo
    // shows in the bubble at full quality right away — it's swapped for
    // the R2 url once the upload finishes, invisibly to the eye since it's
    // the same picture either way.
    const temp = makeTempMessage({ content: '', image_url: localUri });
    addOptimistic(temp);
    sendImageMessage(localUri, temp.id);
  };

  const sendVideoMessage = async (localUri: string, tempId: string) => {
    const url = await uploadVideo(localUri, `messages/${session!.user.id}`);
    if (!url) {
      console.error('[sendVideo] upload returned no url');
      failOptimistic(tempId);
      return;
    }
    const { data, error } = await supabase
      .from('messages')
      .insert({ conversation_id: id, sender_id: session!.user.id, content: '', video_url: url })
      .select()
      .single();
    if (error || !data) {
      console.error('[sendVideo] insert failed:', error?.message, error);
      failOptimistic(tempId);
      return;
    }
    resolveOptimistic(tempId, data);
    broadcastSent(data);
  };

  const sendVideo = () => {
    if (!videoUri || !session?.user?.id) return;
    const localUri = videoUri;
    setVideoUri(null);
    // Same trick as sendImage: show the local file in the bubble
    // immediately, swap in the uploaded R2 url once it lands.
    const temp = makeTempMessage({ content: '', video_url: localUri });
    addOptimistic(temp);
    sendVideoMessage(localUri, temp.id);
  };

  // Stickers are already-uploaded media (picked from the tray) — no upload
  // step here, just an insert, same shape as sendTextMessage.
  const sendStickerMessage = async (stickerUrl: string, tempId: string) => {
    const { data, error } = await supabase
      .from('messages')
      .insert({ conversation_id: id, sender_id: session!.user.id, content: '', is_sticker: true, sticker_url: stickerUrl })
      .select()
      .single();
    if (error || !data) {
      console.error('[sendSticker] insert failed:', error?.message, error);
      failOptimistic(tempId);
      return;
    }
    resolveOptimistic(tempId, data);
    broadcastSent(data);
  };

  const sendSticker = (stickerUrl: string) => {
    if (!session?.user?.id) return;
    setShowStickerTray(false);
    const temp = makeTempMessage({ content: '', is_sticker: true, sticker_url: stickerUrl });
    addOptimistic(temp);
    sendStickerMessage(stickerUrl, temp.id);
  };

  const startVoice = async () => {
    const ok = await voice.start();
    if (!ok) console.warn('[startVoice] permission denied or failed to start');
  };
  const cancelVoice = async () => {
    await voice.cancel();
  };

  // Recording stops into a local preview instead of sending straight away —
  // you can hear exactly what was captured (and confirm it recorded
  // anything at all) before it ever touches the network.
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
      .from('messages')
      .insert({
        conversation_id: id,
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
    resolveOptimistic(tempId, data);
    broadcastSent(data);
  };

  const confirmSendPreview = () => {
    if (!voicePreview || !session?.user?.id) return;
    const { uri, duration } = voicePreview;
    setVoicePreview(null);
    // Local file plays back immediately in the bubble while the upload
    // happens in the background.
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
    else if (m.is_sticker) sendStickerMessage(m.sticker_url, m.id);
    else if (m.video_url) sendVideoMessage(m.video_url, m.id);
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

  const [reportMessage, setReportMessage] = useState<any>(null);
  const handleReportMessage = (m: any) => setReportMessage(m);
  const submitMessageReport = async (reason: string, details: string) => {
    if (!session?.user?.id || !reportMessage) return;
    const { error } = await supabase
      .from('reports')
      .insert({ reporter_id: session.user.id, reported_message_id: reportMessage.id, reason, details: details || null });
    if (error) throw error;
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
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      // The old fixed 24px only accounted for gesture-nav phones (a thin
      // strip). On phones still using the classic 3-button nav bar, that
      // bar reserves real, variable height at the bottom — without
      // including it here, the keyboard (and the input bar sitting above
      // it) ended up rendered partly underneath it. insets.bottom is 0 on
      // gesture-nav phones (so this is unchanged there) and the real bar
      // height on 3-button phones.
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24 + insets.bottom}
    >
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.topBarCenter} onPress={() => otherId && router.push(`/user/${otherId}`)}>
          <View>
            <Avatar uri={otherProfile?.avatar_url || (otherAvatar as string)} size={34} />
            {isOtherOnline && <View style={[styles.onlineDot, { borderColor: colors.card }]} />}
          </View>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={[styles.topBarTitle, { color: colors.text }]}>{otherProfile?.display_name || name || 'Chat'}</Text>
              <VerifiedBadge verified={otherProfile?.verified} isAuthentic={otherProfile?.is_authentic} size={12} />
            </View>
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
        // Without this, the keyboard being up meant the first touch on a
        // message bubble was consumed just dismissing the keyboard instead
        // of reaching the swipe-to-reply gesture — so dragging a message
        // while the text box was focused silently did nothing.
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
              onRetry={retryMessage}
              onReport={handleReportMessage}
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
          {videoUri && (
            <View style={[styles.imagePreviewBar, { borderTopColor: colors.border, backgroundColor: colors.card }]}>
              <View style={[styles.imagePreviewThumb, styles.videoPreviewThumb, { backgroundColor: colors.inputBg }]}>
                <Ionicons name="videocam" size={22} color={colors.subtext} />
              </View>
              <TouchableOpacity onPress={() => setVideoUri(null)} style={styles.imagePreviewRemove}>
                <Ionicons name="close-circle" size={22} color={colors.subtext} />
              </TouchableOpacity>
              <TouchableOpacity onPress={sendVideo} style={[styles.sendImageBtn, { backgroundColor: colors.primary }]}>
                <Ionicons name="send" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
          <View style={[styles.inputBar, { borderTopColor: colors.border, backgroundColor: colors.card, paddingBottom: 10 + insets.bottom }]}>
            <TouchableOpacity onPress={pickImage}>
              <Ionicons name="image-outline" size={26} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowStickerTray((v) => !v)}>
              <Ionicons name={showStickerTray ? 'happy' : 'happy-outline'} size={26} color={colors.primary} />
            </TouchableOpacity>
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
          {showStickerTray && session?.user?.id && (
            <StickerTray
              userId={session.user.id}
              onSelectEmoji={(e) => setText((t) => t + e)}
              onSelectSticker={sendSticker}
              onClose={() => setShowStickerTray(false)}
            />
          )}
        </>
      )}
      <ReportModal visible={!!reportMessage} onClose={() => setReportMessage(null)} onSubmit={submitMessageReport} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 50, paddingHorizontal: spacing.lg, paddingBottom: 12, borderBottomWidth: 1 },
  topBarCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topBarAvatar: { width: 34, height: 34, borderRadius: 17 },
  onlineDot: { position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: '#22C55E', borderWidth: 2 },
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
  videoPreviewThumb: { justifyContent: 'center', alignItems: 'center' },
  imagePreviewRemove: { marginLeft: -14, marginTop: -30 },
  sendImageBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' },
});
