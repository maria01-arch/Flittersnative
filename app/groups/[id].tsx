import { PlusButton, ActionTray } from '@/components/ComposerActions';
import { useViewOnce } from '@/lib/viewOnce';
import ViewOnceViewer from '@/components/ViewOnceViewer';
import PollCreateSheet from '@/components/PollCreateSheet';
import JoinRequestsBanner from '@/components/JoinRequestsBanner';
import { pollContent } from '@/lib/polls';
import { useCallback, useEffect, useRef, useState } from 'react';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { supportsReplyId } from '@/lib/replySupport';
import Avatar from '@/components/Avatar';
import ImageEditor from '@/components/ImageEditor';
import JumpToBottom from '@/components/JumpToBottom';
import ActionSheet from '@/components/ActionSheet';
import TopMenu from '@/components/TopMenu';
import { BlurTarget, BlurTargetContext } from '@/lib/blurTarget';
import { getClearedAt, clearHistoryUpTo, isAfterCleared } from '@/lib/clearHistory';
import { addStickerToMyPack, StickerResult } from '@/lib/stickerActions';
import { StickerPackSheet } from '@/components/StickerPackCard';
import { LinearGradient } from 'expo-linear-gradient';
import { ChatTheme, DEFAULT_THEME, WALLPAPER_PRESETS, resolveBubble, loadChatTheme, saveChatTheme, clearChatTheme, peekChatTheme } from '@/lib/chatTheme';
import ChatThemeSheet from '@/components/ChatThemeSheet';
import PinnedBar from '@/components/PinnedBar';
import PeopleListSheet, { PersonRow } from '@/components/PeopleListSheet';
import { MAX_PINS, STICKER_LABEL, PinnedItem, fetchPins, messageLabel, PIN_DURATIONS } from '@/lib/pins';
import { saveEdit } from '@/lib/msgExtras';
import { isVerifiedUser } from '@/lib/postActions';
import { cleanSearchText } from '@/lib/searchText';
import { acquireTyping, sendTyping as sendTypingSignal } from '@/lib/typingHub';
import { View, FlatList, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Image, LayoutAnimation, Alert, Keyboard } from 'react-native';
import Text from '@/components/AppText';
import PasteTextInput from '@/components/PasteTextInput';
import { useClipboardImage } from '@/lib/clipboardImage';
import PasteImageChip from '@/components/PasteImageChip';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { sendInbox } from '@/lib/inboxPing';
import { useAuth } from '@/lib/AuthContext';
import { useInbox } from '@/lib/InboxContext';
import { useTheme } from '@/lib/ThemeContext';
import MessageBubble from '@/components/MessageBubble';
import ChatPickerSheet from '@/components/ChatPickerSheet';
import { playSound } from '@/lib/sounds';
import { getCachedMessages, setCachedMessages } from '@/lib/chatCache';
import { useKeyboardPadding } from '@/lib/useKeyboardPadding';
import { forwardTo, payloadFromMessage } from '@/lib/forward';
import { setActiveGroup } from '@/lib/activeChatTracker';
import VoiceRecordingBar from '@/components/VoiceRecordingBar';
import VoicePreviewBar from '@/components/VoicePreviewBar';
import StickerTray from '@/components/StickerTray';
import { deleteLast } from '@/lib/emojiSplit';
import ReportModal from '@/components/ReportModal';
import { spacing } from '@/lib/theme';

import { useAppForeground } from '@/lib/useAppForeground';
import { useVoiceRecorder } from '@/lib/useVoiceRecorder';
import { uploadVoiceNote, uploadImage, uploadVideo } from '@/lib/upload';
import { checkVideoLimits, getVideoLimitSeconds, canTrimToFit } from '@/lib/videoLimits';
import VideoTrimmer from '@/components/VideoTrimmer';

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
  const { pushEvent } = useInbox();
  const memberIdsRef = useRef<string[] | null>(null);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // ---- Tap a quoted reply -> scroll to that message and flash it.
  const listRef = useRef<FlatList>(null);
  // Own display name, sent with the typing signal (it used to send the email).
  const [myName, setMyName] = useState('Someone');
  const [myReceiptsOn, setMyReceiptsOn] = useState(true);
  useEffect(() => {
    if (session?.user?.id) supabase.from('profiles').select('display_name,username,show_read_receipts').eq('id', session.user.id).maybeSingle().then(({ data }) => {
      setMyReceiptsOn(data?.show_read_receipts !== false);
      const dn = data?.display_name || '';
      const label = dn && !dn.includes('@') ? dn : data?.username || dn;
      if (label) setMyName(label);
    });
  }, [session?.user?.id]);
  // ---- Jump to bottom + "+N new" while scrolled up.
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const awayRef = useRef(false);
  const [newWhileAway, setNewWhileAway] = useState(0);
  const lastTopId = useRef<string | null>(null);
  const stickerDone = (r: StickerResult) => {
    if (r.status === 'added') Alert.alert('Saved', r.count && r.count > 1 ? `${r.count} stickers added to your pack.` : 'Added to your stickers.');
    else if (r.status === 'exists') Alert.alert('Already saved', 'You already have this in your stickers.');
    else if (r.status === 'own') Alert.alert("That's your pack", 'These stickers are already yours.');
    else if (r.status === 'limit') Alert.alert('Daily limit reached', 'You can save 20 stickers a day. Try again tomorrow.');
    else Alert.alert("Couldn't add", r.message || 'Please try again.');
  };
  const [stickerSheetUrl, setStickerSheetUrl] = useState<string | null>(null);
  const [viewPackUrl, setViewPackUrl] = useState<string | null>(null);
  const stickerMenu = (url: string) => {
    if (session?.user?.id && url) setStickerSheetUrl(url);
  };
  const jumpToBottom = () => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setNewWhileAway(0);
  };
  // Jump to a message (pins, replies). If it is far up and not loaded yet, load
  // the chat back to that message first (up to ~1000 messages), then scroll.
  const jumpingRef = useRef(false);
  const scrollToId = async (targetId: string) => {
    const show = (list: any[]) => {
      const idx = list.findIndex((m) => m.id === targetId);
      if (idx < 0) return false;
      setTimeout(() => {
        listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
        setHighlightId(targetId);
        setTimeout(() => setHighlightId(null), 1800);
      }, 60);
      return true;
    };
    if (show(messagesRef.current)) return;
    if (jumpingRef.current) return;
    jumpingRef.current = true;
    try {
      const { data: target } = await supabase.from('group_messages').select('created_at').eq('id', targetId).maybeSingle();
      if (!target) {
        Alert.alert('Message not found', 'That message was deleted.');
        loadPins();
        return;
      }
      let cur: string | null = cursorRef.current || messagesRef.current[messagesRef.current.length - 1]?.created_at || null;
      if (!cur) return;
      let added: any[] = [];
      for (let round = 0; round < 5; round++) {
        const { data: older } = await supabase.from('group_messages').select('*').eq('group_id', id).lt('created_at', cur).order('created_at', { ascending: false }).limit(200);
        if (!older || !older.length) break;
        added = added.concat(await attachExtras(older));
        cur = older[older.length - 1].created_at;
        cursorRef.current = cur;
        if (String(cur) <= String(target.created_at)) break;
      }
      const have = new Set(messagesRef.current.map((m) => m.id));
      const merged = [...messagesRef.current, ...added.filter((m) => !have.has(m.id))];
      setMessages(merged);
      setHasMore(true);
      setTimeout(() => show(merged), 250);
    } finally {
      jumpingRef.current = false;
    }
  };

  const [groupInfo, setGroupInfo] = useState<any>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  useEffect(() => {
    supabase.from('groups').select('avatar_url,cover_color,name,creator_id').eq('id', id).maybeSingle().then(({ data }) => setGroupInfo(data));
  }, [id]);
  // Am I an admin of this group? (The creator counts as one.) Admins can delete anyone's message.
  const [myRole, setMyRole] = useState<string | null>(null);
  useEffect(() => {
    if (!session?.user?.id) return;
    supabase.from('group_members').select('role').eq('group_id', id).eq('user_id', session.user.id).maybeSingle().then(({ data }) => setMyRole(data?.role || null));
  }, [id, session?.user?.id]);
  const isGroupAdmin = myRole === 'admin' || (!!groupInfo?.creator_id && groupInfo.creator_id === session?.user?.id);
  // The theme chosen in Settings (wallpaper + own bubble colour) applies to groups too.
  const [chatTheme, setChatTheme] = useState<ChatTheme>(() => peekChatTheme('group_' + String(id)) || DEFAULT_THEME);
  useEffect(() => {
    loadChatTheme('group_' + String(id)).then(setChatTheme);
  }, [id]);
  // Each group can have its own theme (verified members), kept on this phone only.
  const [themeOpen, setThemeOpen] = useState(false);
  const [topMenuOpen, setTopMenuOpen] = useState(false);
  const blurRef = useRef<any>(null);
  const clearedRef = useRef<string | null>(null);
  const [meVerified, setMeVerified] = useState(false);
  useEffect(() => {
    isVerifiedUser(session?.user?.id).then(setMeVerified);
  }, [session?.user?.id]);
  const changeTheme = (t: ChatTheme) => {
    setChatTheme(t);
    saveChatTheme('group_' + String(id), t);
  };
  const wp = chatTheme.wallpaper;
  const bubbleLook = resolveBubble(chatTheme.bubble, colors.primary);
  const myBubbleColor = bubbleLook.color;
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [replyIdOk, setReplyIdOk] = useState(false);
  useEffect(() => {
    supportsReplyId('group_messages').then(setReplyIdOk);
  }, []);
  const replyIdFields = (m: any) => (replyIdOk && m?.id ? { reply_to_id: m.id } : {});
  // A message still being sent has a temporary id that the database doesn't know.
  const realId = (m: any) => (m?.id && !String(m.id).startsWith('temp') ? m.id : null);
  const jumpToReply = (msg: any) => {
    // Exact match by id when the reply stored one; for older replies, the
    // nearest earlier message with the same text.
    let idx = msg.reply_to_id ? messages.findIndex((m) => m.id === msg.reply_to_id) : -1;
    if (idx < 0) {
      const from = messages.findIndex((m) => m.id === msg.id);
      idx = messages.findIndex((m, i) => i > from && (m.content === msg.reply_to || (!m.content && ((m.image_url && msg.reply_to === '📷 Photo') || (m.video_url && msg.reply_to === '🎥 Video') || (m.voice_url && msg.reply_to === '🎤 Voice message') || (m.sticker_url && msg.reply_to === STICKER_LABEL)))));
    }
    if (idx < 0) return;
    listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
    setHighlightId(messages[idx].id);
    setTimeout(() => setHighlightId(null), 1800);
  };
  // iPhone: KeyboardAvoidingView lifts the screen above the keyboard. Android
  // already resizes the window for the keyboard itself, so adding
  // KeyboardAvoidingView on top of that double-counted — that was the extra
  // gap above the keyboard, and the lag opening/closing it.
  const Wrapper: any = Platform.OS === 'ios' ? KeyboardAvoidingView : Animated.View;
  // Android: bottom padding = keyboard height as it animates (or the phone's
  // navigation bar when the keyboard is down). Smooth, with no gap.
  const kbStyle = useKeyboardPadding(insets.bottom);
  const wrapperProps: any = Platform.OS === 'ios' ? { behavior: 'padding' } : {};
  // Image / video / voice messages have no text, so replying to one used to
  // quote an empty line. Give them a label instead.
  const replyLabel = (m: any): string | null =>
    m?.content || (m?.image_url ? '📷 Photo' : m?.video_url ? '🎥 Video' : m?.voice_url ? '🎤 Voice message' : m?.sticker_url ? STICKER_LABEL : null);
  // While the keyboard is up the input sits right on it; the extra space for
  // the phone's navigation bar is only needed when it is down.
  const [kbOpen, setKbOpen] = useState(false);
  useEffect(() => {
    const a = Keyboard.addListener('keyboardDidShow', () => setKbOpen(true));
    const b = Keyboard.addListener('keyboardDidHide', () => setKbOpen(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);

  useEffect(() => {
    setActiveGroup(id as string);
    return () => setActiveGroup(null);
  }, [id]);
  const [messages, setMessages] = useState<any[]>(() => getCachedMessages(`gc:${id}`) || []);
  const messagesRef = useRef<any[]>([]);
  messagesRef.current = messages;
  useEffect(() => {
    const top = messages[0];
    if (top && lastTopId.current && top.id !== lastTopId.current && awayRef.current && top.sender_id !== session?.user?.id && !String(top.id).startsWith('temp')) {
      setNewWhileAway((c) => c + 1);
    }
    lastTopId.current = top?.id ?? null;
  }, [messages[0]?.id]);
  // While this screen is open, every message that lands (yours or theirs) is
  // read. Without this the read marker stayed at when you opened the chat,
  // so the chat list called the group "new" even right after you replied.
  useEffect(() => {
    if (!session?.user?.id || !messages.length) return;
    pushEvent({ kind: 'group', id: String(id), msg: { __read: true } });
    supabase.from('group_members').update({ last_read_at: new Date().toISOString() }).eq('group_id', id).eq('user_id', session.user.id).then(() => {});
  }, [messages[0]?.id]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(() => !getCachedMessages(`gc:${id}`));
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [pinItems, setPinItems] = useState<PinnedItem[]>([]);
  const [pinChoice, setPinChoice] = useState<any>(null);
  // Where the next page of older messages starts (kept apart from the list, because
  // messages you deleted "for me" are hidden from it).
  const cursorRef = useRef<string | null>(null);
  // Sheet listing people (who reacted / who saw a message).
  const [people, setPeople] = useState<{ title: string; rows: PersonRow[]; loading: boolean; note?: string; emptyText?: string } | null>(null);
  const channelRef = useRef<any>(null);
  const inputRef = useRef<any>(null);
  const connectRef = useRef<() => void>(() => {});
  const myProfileRef = useRef<any>(null);
  const voice = useVoiceRecorder();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const clip = useClipboardImage();
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [viewOnceOn, setViewOnceOn] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [voMsg, setVoMsg] = useState<any>(null);
  const [trimmer, setTrimmer] = useState<{ uri: string; duration: number | null; max: number } | null>(null);
  const [voicePreview, setVoicePreview] = useState<{ uri: string; duration: number; waveform?: string } | null>(null);
  const [showStickerTray, setShowStickerTray] = useState(false);

  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const typingLastSeen = useRef<Record<string, number>>({});
  const typingThrottle = useRef<any>(null);
  const typingNames = Object.values(typingUsers);

  // Also tell the chat list of everyone in this group (it shows "Ada is typing…").
  const outsideThrottle = useRef<any>(null);
  useEffect(() => acquireTyping(`typing:gc:${id}`), [id]);
  // Forward: pick chats, then copy the message into each.
  const [forwardMsg, setForwardMsg] = useState<any>(null);
  const [forwarding, setForwarding] = useState(false);
  const doForward = async (targets: any[]) => {
    if (!forwardMsg || !session?.user?.id) return;
    setForwarding(true);
    const r = await forwardTo(targets, session.user.id, payloadFromMessage(forwardMsg));
    setForwarding(false);
    setForwardMsg(null);
    if (r.failed) Alert.alert('Forwarded to ' + r.sent, r.failed + ' chat(s) did not accept it. Please try again.');
    else Alert.alert('Forwarded', r.sent === 1 ? 'Sent.' : `Sent to ${r.sent} chats.`);
  };

  const sendTyping = () => {
    if (!outsideThrottle.current) {
      sendTypingSignal(`typing:gc:${id}`, { user_id: session?.user?.id, name: myName });
      outsideThrottle.current = setTimeout(() => {
        outsideThrottle.current = null;
      }, 2500);
    }
    if (typingThrottle.current) return;
    channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { user_id: session?.user?.id, name: myName } });
    typingThrottle.current = setTimeout(() => {
      typingThrottle.current = null;
    }, 1500);
  };

  const attachExtras = async (msgs: any[]) => {
    if (!msgs.length) return msgs;
    const ids = msgs.map((m) => m.id);
    const senderIds = [...new Set(msgs.map((m) => m.sender_id).filter(Boolean))];
    const [{ data: reactions }, { data: authors }, hiddenRes] = await Promise.all([
      supabase.from('group_message_reactions').select('group_message_id,user_id,emoji').in('group_message_id', ids),
      supabase.from('profiles').select('id,display_name,avatar_url').in('id', senderIds),
      // Messages this person deleted "for me". If that table isn't there yet, nothing is hidden.
      session?.user?.id
        ? supabase.from('hidden_messages').select('message_id').eq('user_id', session.user.id).in('message_id', ids.map(String))
        : Promise.resolve({ data: null } as any),
    ]);
    const hidden = new Set(((hiddenRes as any)?.data || []).map((h: any) => String(h.message_id)));
    const authorMap: Record<string, any> = {};
    (authors || []).forEach((a: any) => (authorMap[a.id] = a));
    return msgs.filter((m) => !hidden.has(String(m.id))).map((m) => ({
      ...m,
      reactions: (reactions || []).filter((r: any) => r.group_message_id === m.id),
      author: authorMap[m.sender_id],
    }));
  };

  const loadInitial = async () => {
    const [{ data: rawMsgs }, cleared] = await Promise.all([
      supabase.from('group_messages').select('*').eq('group_id', id).order('created_at', { ascending: false }).limit(PAGE_SIZE),
      getClearedAt('group', String(id), session?.user?.id),
    ]);
    clearedRef.current = cleared;
    const msgs = (rawMsgs || []).filter((m: any) => isAfterCleared(m.created_at, cleared));
    const withExtras = await attachExtras(msgs || []);
    // Merge, so live or still-sending messages don't vanish (see the DM screen).
    setMessages((prev) => {
      if (!prev.length) return withExtras;
      const fetchedIds = new Set(withExtras.map((m: any) => m.id));
      const newest = withExtras[0]?.created_at || '';
      const prevById: Record<string, any> = {};
      prev.forEach((m: any) => (prevById[m.id] = m));
      const kept = prev.filter((m: any) => !fetchedIds.has(m.id) && (m._pending || m._failed || String(m.id).startsWith('temp_') || (m.created_at || '') > newest));
      const fresh = withExtras.map((m: any) => (prevById[m.id]?.localImage ? { ...m, localImage: prevById[m.id].localImage } : m));
      return [...kept, ...fresh].sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
    });
    setHasMore((rawMsgs || []).length === PAGE_SIZE && msgs.length === (rawMsgs || []).length);
    cursorRef.current = msgs && msgs.length ? msgs[msgs.length - 1].created_at : null;
    setCachedMessages(`gc:${id}`, withExtras);
    // Show the chat now; pins and my own profile fill in behind it.
    setLoading(false);
    loadPins();
    if (session?.user?.id && !myProfileRef.current) {
      supabase.from('profiles').select('id,display_name,avatar_url').eq('id', session.user.id).single().then(({ data: me }) => {
        myProfileRef.current = me;
      });
    }
  };

  // The pinned messages of this group (up to 3).
  const loadPins = async () => {
    const items = await fetchPins('group', String(id));
    setPinItems(items);
    setPinnedIds(new Set(items.map((i) => i.id)));
  };

  // Pins with an end time disappear on their own while the chat is open.
  useEffect(() => {
    const t = setInterval(() => loadPins(), 60 * 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Clear history: hides everything up to the newest message, for me only.
  const askClearHistory = () => {
    const newest = messagesRef.current[0]?.created_at;
    if (!newest) {
      Alert.alert('Nothing to clear', 'There are no messages here yet.');
      return;
    }
    Alert.alert('Clear history?', 'All messages in this chat will be removed for you only. Other people keep theirs.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          if (!session?.user?.id) return;
          const res = await clearHistoryUpTo('group', String(id), session.user.id, newest);
          if (!res.ok) {
            Alert.alert('Could not clear', res.error || 'Try again.');
            return;
          }
          clearedRef.current = newest;
          setMessages([]);
          setHasMore(false);
          cursorRef.current = null;
          setCachedMessages(`gc:${id}`, []);
        },
      },
    ]);
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    const oldest = messages[messages.length - 1];
    const { data: older } = await supabase
      .from('group_messages')
      .select('*')
      .eq('group_id', id)
      .lt('created_at', cursorRef.current || oldest.created_at)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    const olderKept = (older || []).filter((m: any) => isAfterCleared(m.created_at, clearedRef.current));
    const withExtras = await attachExtras(olderKept);
    if (olderKept.length) cursorRef.current = olderKept[olderKept.length - 1].created_at;
    setMessages((prev) => [...prev, ...withExtras]);
    setHasMore((older || []).length === PAGE_SIZE && olderKept.length === (older || []).length);
    setLoadingMore(false);
  };

  const refreshReactionsFor = async (messageId: string) => {
    const { data } = await supabase.from('group_message_reactions').select('user_id,emoji').eq('group_message_id', messageId);
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions: data || [] } : m)));
  };

  const addIncomingMessage = (msg: any, author?: any) => {
    if (msg.sender_id !== session?.user?.id && !msg.system_event) playSound('incoming');
    if (msg.sender_id !== session?.user?.id) pushEvent({ kind: 'group', id: String(id), msg: { __read: true } });
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
          const { data: author } = payload.new.system_event || !payload.new.sender_id ? { data: null } : await supabase.from('profiles').select('display_name,avatar_url').eq('id', payload.new.sender_id).single();
          addIncomingMessage(payload.new, author);
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'group_messages', filter: `group_id=eq.${id}` }, (payload) => {
          setMessages((prev) => prev.map((m) => (m.id === payload.new.id ? { ...m, content: payload.new.content, edited_at: payload.new.edited_at ?? m.edited_at } : m)));
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'group_messages' }, (payload) => {
          setMessages((prev) => prev.filter((m) => m.id !== (payload.old as any).id));
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'group_message_reactions' }, (payload: any) => {
          const mid = payload.new?.group_message_id || payload.old?.group_message_id;
          if (mid) refreshReactionsFor(mid);
        })
        .on('broadcast', { event: 'reaction_changed' }, (payload: any) => {
          const { message_id, user_id, emoji } = payload.payload || {};
          if (!message_id || !user_id || user_id === session?.user?.id) return;
          setMessages((prev) => prev.map((m) => {
            if (m.id !== message_id) return m;
            const rest = (m.reactions || []).filter((r: any) => r.user_id !== user_id);
            return { ...m, reactions: emoji ? [...rest, { user_id, emoji }] : rest };
          }));
        })
        .on('broadcast', { event: 'new_message' }, (payload: any) => {
          const msg = payload.payload;
          if (!msg?.id) return;
          addIncomingMessage(msg, msg.author);
        })
        .on('broadcast', { event: 'pins_changed' }, () => {
          loadPins();
        })
        .on('broadcast', { event: 'message_deleted' }, (payload: any) => {
          const mid = payload.payload?.id;
          if (!mid) return;
          setMessages((prev) => prev.filter((m) => m.id !== mid));
          setPinItems((prev) => prev.filter((i) => i.id !== mid));
          setPinnedIds((prev) => {
            if (!prev.has(mid)) return prev;
            const n = new Set(prev);
            n.delete(mid);
            return n;
          });
        })
        .on('broadcast', { event: 'message_edited' }, (payload: any) => {
          const e = payload.payload;
          if (!e?.id) return;
          setMessages((prev) => prev.map((m) => (m.id === e.id ? { ...m, content: e.content, edited_at: e.edited_at } : m)));
        })
        .on('broadcast', { event: 'typing' }, (payload: any) => {
          const { user_id, name } = payload.payload || {};
          if (!user_id || user_id === session?.user?.id) return;
          typingLastSeen.current[user_id] = Date.now();
          playSound('typing');
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
      setCachedMessages(`gc:${id}`, messagesRef.current);
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

  // Update my own chat list now, and tell small groups' members so their
  // chat lists move this group to the top straight away.
  const announceSent = async (data: any) => {
    if (!data?.id || !session?.user?.id) return;
    const msg = { id: data.id, group_id: data.group_id, sender_id: data.sender_id, content: data.content, is_voice: data.is_voice, is_sticker: data.is_sticker, video_url: data.video_url, image_url: data.image_url, created_at: data.created_at };
    pushEvent({ kind: 'group', id: id as string, msg });
    try {
      if (!memberIdsRef.current) {
        const { data: ms } = await supabase.from('group_members').select('user_id').eq('group_id', id).limit(60);
        memberIdsRef.current = (ms || []).map((m: any) => m.user_id);
      }
      if (memberIdsRef.current.length > 40) return; // big groups: realtime handles it
      memberIdsRef.current.forEach((uid) => {
        if (uid !== session.user.id) sendInbox(uid, { type: 'broadcast', event: 'ping', payload: { kind: 'group', id, msg } });
      });
    } catch {}
  };

  const resolveOptimistic = (tempId: string, data: any) => {
    announceSent(data);
    // Soft tap once the server has the message (delivered).
    playSound('send');
    animateNextChange();
    const withAuthor = { ...data, author: myProfileRef.current };
    // _key keeps the row's identity, so the bubble is not rebuilt (blinks) when it gets its real id.
    setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...withAuthor, reactions: [], _key: m._key || m.id } : m)));
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
        reply_to: replyLabel(replyTo),
        ...replyIdFields(replyTo),
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
      announceSent(data);
    }
    channelRef.current?.send({ type: 'broadcast', event: 'new_message', payload: withAuthor });
  };

  const send = async () => {
    // A picture is waiting: the send button sends it together with the text.
    if (imageUri) return sendImage();
    if (videoUri) return sendVideo();
    if (!text.trim() || !session?.user?.id) return;
    const content = text.trim();
    if (mentionQuery !== null) closeMention();

    if (editingId) {
      animateNextChange();
      setMessages((prev) => prev.map((m) => (m.id === editingId ? { ...m, content } : m)));
      const editId = editingId;
      setEditingId(null);
      setText('');
      const editedAt = await saveEdit('group_messages', editId, session.user.id, content);
      if (editedAt) {
        setMessages((prev) => prev.map((m) => (m.id === editId ? { ...m, edited_at: editedAt } : m)));
        channelRef.current?.send({ type: 'broadcast', event: 'message_edited', payload: { id: editId, content, edited_at: editedAt } });
      }
      return;
    }

    const replyTo = replyingTo;
    setText('');
    setReplyingTo(null);

    const temp = makeTempMessage({
      content,
      reply_to: replyLabel(replyTo),
      ...replyIdFields(replyTo),
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
      const limit = await getVideoLimitSeconds(session?.user?.id);
      if (canTrimToFit(asset, limit)) {
        setTrimmer({ uri: asset.uri, duration: (asset.duration as number) / 1000, max: limit });
        return;
      }
      const issue = checkVideoLimits(asset, limit);
      if (issue) {
        Alert.alert('Video too long', issue);
        return;
      }
      setVideoUri(asset.uri);
    } else {
      setImageUri(asset.uri);
    }
  };

  const { opened: voOpened, markOpened: voMark } = useViewOnce(messages, session?.user?.id);

  // ---- Polls: a poll is a message that points at a poll (poll_id).
  const [pollOpen, setPollOpen] = useState(false);
  const sendPoll = async (pollId: string, question: string) => {
    if (!session?.user?.id) return;
    const content = pollContent(question);
    const temp = makeTempMessage({ content, poll_id: pollId });
    addOptimistic(temp);
    const { data, error } = await supabase
      .from('group_messages')
      .insert({ group_id: id, sender_id: session.user.id, content, poll_id: pollId })
      .select()
      .single();
    if (error || !data) {
      console.error('[sendPoll] insert failed:', error?.message, error);
      failOptimistic(temp.id);
      return;
    }
    const withAuthor = resolveOptimistic(temp.id, data);
    channelRef.current?.send({ type: 'broadcast', event: 'new_message', payload: withAuthor });
  };

  // ---- Admins: how many people are waiting to join (banner at the top).
  const [joinCount, setJoinCount] = useState(0);
  const [joinDismissed, setJoinDismissed] = useState(0);
  const loadJoinCount = useCallback(async () => {
    if (!isGroupAdmin || !id) return;
    const { count, error } = await supabase.from('group_join_requests').select('id', { count: 'exact', head: true }).eq('group_id', id).eq('status', 'pending');
    if (!error && typeof count === 'number') setJoinCount(count);
  }, [isGroupAdmin, id]);
  useFocusEffect(
    useCallback(() => {
      loadJoinCount();
      const t = setInterval(loadJoinCount, 30000);
      return () => clearInterval(t);
    }, [loadJoinCount])
  );

  const sendImageMessage = async (localUri: string, tempId: string, caption = '', reply?: { label: string | null; id: string | null }, viewOnce = false) => {
    const url = await uploadImage(localUri, `messages/${session!.user.id}`);
    if (!url) {
      console.error('[sendImage] upload returned no url');
      failOptimistic(tempId);
      return;
    }

    const { data, error } = await supabase
      .from('group_messages')
      .insert({ group_id: id, sender_id: session!.user.id, content: caption, image_url: url, ...(reply?.label ? { reply_to: reply.label } : {}), ...(replyIdOk && reply?.id ? { reply_to_id: reply.id } : {}), ...(viewOnce ? { view_once: true } : {}) })
      .select()
      .single();

    if (error || !data) {
      console.error('[sendImage] insert failed:', error?.message, error);
      failOptimistic(tempId);
      return;
    }
    // Keep the local picture on the message until the uploaded one is ready,
    // so it doesn't blink out and back in when it finishes sending.
    const withAuthor = resolveOptimistic(tempId, { ...data, localImage: localUri });
    channelRef.current?.send({ type: 'broadcast', event: 'new_message', payload: { ...withAuthor, localImage: undefined } });
  };

  const sendImage = () => {
    if (!imageUri || !session?.user?.id) return;
    const localUri = imageUri;
    const caption = text.trim();
    setText('');
    setImageUri(null);
    // A picture sent while replying carries the reply, and can be "view once".
    const replyTo = replyingTo;
    const reply = replyTo ? { label: replyLabel(replyTo), id: realId(replyTo) } : undefined;
    const once = viewOnceOn;
    setReplyingTo(null);
    setViewOnceOn(false);
    const temp = makeTempMessage({ content: caption, image_url: localUri, ...(reply?.label ? { reply_to: reply.label, reply_to_id: reply.id } : {}), ...(once ? { view_once: true } : {}) });
    addOptimistic(temp);
    sendImageMessage(localUri, temp.id, caption, reply, once);
  };

  const sendVideoMessage = async (localUri: string, tempId: string, reply?: { label: string | null; id: string | null }, viewOnce = false, caption = '') => {
    const url = await uploadVideo(localUri, `messages/${session!.user.id}`);
    if (!url) {
      console.error('[sendVideo] upload returned no url');
      failOptimistic(tempId);
      return;
    }
    const { data, error } = await supabase
      .from('group_messages')
      .insert({ group_id: id, sender_id: session!.user.id, content: caption, video_url: url, ...(reply?.label ? { reply_to: reply.label } : {}), ...(replyIdOk && reply?.id ? { reply_to_id: reply.id } : {}), ...(viewOnce ? { view_once: true } : {}) })
      .select()
      .single();
    if (error || !data) {
      console.error('[sendVideo] insert failed:', error?.message, error);
      failOptimistic(tempId);
      return;
    }
    const withAuthor = resolveOptimistic(tempId, data);
    channelRef.current?.send({ type: 'broadcast', event: 'new_message', payload: withAuthor });
  };

  const sendVideo = () => {
    if (!videoUri || !session?.user?.id) return;
    const localUri = videoUri;
    // Whatever is typed goes out WITH the video as its caption.
    const caption = text.trim();
    setText('');
    setVideoUri(null);
    const replyTo = replyingTo;
    const reply = replyTo ? { label: replyLabel(replyTo), id: realId(replyTo) } : undefined;
    const once = viewOnceOn;
    setReplyingTo(null);
    setViewOnceOn(false);
    const temp = makeTempMessage({ content: caption, video_url: localUri, ...(reply?.label ? { reply_to: reply.label, reply_to_id: reply.id } : {}), ...(once ? { view_once: true } : {}) });
    addOptimistic(temp);
    sendVideoMessage(localUri, temp.id, reply, once, caption);
  };

  const sendStickerMessage = async (stickerUrl: string, tempId: string, reply?: { label: string | null; id: string | null }) => {
    const { data, error } = await supabase
      .from('group_messages')
      .insert({
        group_id: id,
        sender_id: session!.user.id,
        content: '',
        is_sticker: true,
        sticker_url: stickerUrl,
        ...(reply?.label ? { reply_to: reply.label } : {}),
        ...(replyIdOk && reply?.id ? { reply_to_id: reply.id } : {}),
      })
      .select()
      .single();
    if (error || !data) {
      console.error('[sendSticker] insert failed:', error?.message, error);
      failOptimistic(tempId);
      return;
    }
    const withAuthor = resolveOptimistic(tempId, data);
    channelRef.current?.send({ type: 'broadcast', event: 'new_message', payload: withAuthor });
  };

  const sendSticker = (stickerUrl: string) => {
    if (!session?.user?.id) return;
    setShowStickerTray(false);
    // A sticker sent while replying carries the reply with it.
    const replyTo = replyingTo;
    setReplyingTo(null);
    const reply = replyTo ? { label: replyLabel(replyTo), id: realId(replyTo) } : undefined;
    const temp = makeTempMessage({ content: '', is_sticker: true, sticker_url: stickerUrl, ...(reply?.label ? { reply_to: reply.label, reply_to_id: reply.id } : {}) });
    addOptimistic(temp);
    sendStickerMessage(stickerUrl, temp.id, reply);
  };

  const sendPack = (packId: string, packName: string) => {
    if (!session?.user?.id) return;
    setShowStickerTray(false);
    const temp = makeTempMessage({ content: `🗂️ Sticker pack: ${packName}`, shared_pack_id: packId });
    addOptimistic(temp);
    (async () => {
      const { data, error } = await supabase
        .from('group_messages')
        .insert({ group_id: id, sender_id: session.user.id, content: temp.content, shared_pack_id: packId })
        .select()
        .single();
      if (error || !data) {
        console.error('[sendPack] insert failed:', error?.message);
        failOptimistic(temp.id);
        return;
      }
      const withAuthor = resolveOptimistic(temp.id, data);
      channelRef.current?.send({ type: 'broadcast', event: 'new_message', payload: withAuthor });
    })();
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

  const sendVoiceMessage = async (localUri: string, duration: number, tempId: string, waveform?: string) => {
    const voiceUrl = await uploadVoiceNote(localUri, waveform);
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
    const { uri, duration, waveform } = voicePreview;
    setVoicePreview(null);
    const temp = makeTempMessage({
      content: '',
      is_voice: true,
      voice_url: uri,
      voice_duration: duration,
    });
    addOptimistic(temp);
    sendVoiceMessage(uri, duration, temp.id, waveform);
  };

  const retryMessage = (m: any) => {
    if (!m._failed) return;
    animateNextChange();
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, _pending: true, _failed: false } : x)));
    if (m.is_voice) sendVoiceMessage(m.voice_url, m.voice_duration, m.id);
    else if (m.is_sticker) sendStickerMessage(m.sticker_url, m.id, m.reply_to ? { label: m.reply_to, id: m.reply_to_id || null } : undefined);
    else if (m.video_url) sendVideoMessage(m.video_url, m.id, m.reply_to ? { label: m.reply_to, id: m.reply_to_id || null } : undefined, !!m.view_once, m.content || '');
    else if (m.image_url) sendImageMessage(m.image_url, m.id, m.content || '', m.reply_to ? { label: m.reply_to, id: m.reply_to_id || null } : undefined, !!m.view_once);
    else sendTextMessage(m.content, null, m.id);
  };

  // Focus the box after the swipe has finished. Android ignores a focus() that
  // arrives while the finger is still lifting, or when the box thinks it is
  // already focused with the keyboard hidden — so: blur, focus, and check once
  // or twice that the keyboard really opened.
  const focusInput = () => {
    const attempt = (n: number) => {
      const el = inputRef.current;
      if (!el) return;
      try { el.blur?.(); } catch {}
      setTimeout(() => {
        try { el.focus?.(); } catch {}
        if (n < 2) setTimeout(() => { try { if (!Keyboard.isVisible()) attempt(n + 1); } catch {} }, 350);
      }, 50);
    };
    setTimeout(() => attempt(0), 140);
  };
  const handleReply = (m: any) => {
    setEditingId(null);
    setReplyingTo(m);
    focusInput();
  };
  const handleCopy = async (m: any) => {
    await Clipboard.setStringAsync(m.content);
  };
  const handleEdit = (m: any) => {
    setReplyingTo(null);
    setEditingId(m.id);
    setText(m.content);
  };
  // Delete for me: only hidden on this account (everyone else still sees it).
  const deleteForMe = async (m: any) => {
    if (!session?.user?.id) return;
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    setPinItems((prev) => prev.filter((i) => i.id !== m.id));
    if (!realId(m)) return;
    const { error } = await supabase.from('hidden_messages').insert({ user_id: session.user.id, message_id: String(m.id) });
    if (error && !/duplicate/i.test(error.message)) {
      console.warn('[GC] delete for me failed:', error.message);
      Alert.alert("Couldn't delete", 'Delete for me needs a one-time database update first (run the SQL from the chat).');
      loadInitial();
    }
  };
  // Delete for everyone: your own messages; and any message if you are a group admin.
  const deleteForEveryone = async (m: any) => {
    if (!session?.user?.id) return;
    const mine = m.sender_id === session.user.id;
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    setPinItems((prev) => prev.filter((i) => i.id !== m.id));
    if (!realId(m)) return;
    let q = supabase.from('group_messages').delete().eq('id', m.id);
    if (mine) q = q.eq('sender_id', session.user.id);
    const { data, error } = await q.select('id');
    if (error || !data?.length) {
      console.warn('[GC] delete for everyone failed:', error?.message);
      Alert.alert("Couldn't delete", mine ? error?.message || 'The database did not allow it.' : 'The database did not allow an admin to delete this. Run the admin SQL from the chat first.');
      loadInitial();
    }
    if (!error && data?.length) channelRef.current?.send({ type: 'broadcast', event: 'message_deleted', payload: { id: m.id } });
  };
  const handleDelete = (m: any) => {
    const mine = m.sender_id === session?.user?.id;
    if (mine || isGroupAdmin) {
      Alert.alert('Delete message?', mine ? 'Choose how you want to delete this message.' : 'You are an admin, so you can delete this for everyone.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete for me', onPress: () => deleteForMe(m) },
        { text: 'Delete for everyone', style: 'destructive', onPress: () => deleteForEveryone(m) },
      ]);
    } else {
      Alert.alert('Delete message?', 'This removes the message from your view only. Everyone else still sees it.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete for me', style: 'destructive', onPress: () => deleteForMe(m) },
      ]);
    }
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
    channelRef.current?.send({ type: 'broadcast', event: 'reaction_changed', payload: { message_id: m.id, user_id: session.user.id, emoji: mine && mine.emoji === emoji ? null : emoji } });
  };
  const handlePin = async (m: any) => {
    if (!session?.user?.id || !realId(m)) return;
    const isPinned = pinnedIds.has(m.id);
    if (!isPinned) {
      if (pinItems.length >= MAX_PINS) {
        Alert.alert('Pin limit', 'You can pin up to 3 messages. Unpin one first.');
        return;
      }
      // Ask how long it should stay pinned.
      setPinChoice(m);
      return;
    }
    // Unpin. Remove it on screen at once, then make sure the database really
    // removed it — if it didn't, put it back and say why (it used to quietly
    // come back by itself).
    const keepIds = pinnedIds;
    const keepItems = pinItems;
    const next = new Set(pinnedIds);
    next.delete(m.id);
    setPinnedIds(next);
    setPinItems((prev) => prev.filter((i) => i.id !== m.id));
    const { data, error } = await supabase.from('pinned_messages').delete().eq('group_id', id).eq('message_id', m.id).select('message_id');
    if (error || !data?.length) {
      const still = await fetchPins('group', String(id));
      if (still.some((i) => i.id === m.id)) {
        setPinnedIds(keepIds);
        setPinItems(keepItems);
        Alert.alert("Couldn't unpin", error?.message || 'The database did not allow it. Run the pin SQL from the chat.');
        return;
      }
    }
    channelRef.current?.send({ type: 'broadcast', event: 'pins_changed', payload: { by: session.user.id } });
  };
  const doPin = async (m: any, ms: number) => {
    if (!session?.user?.id) return;
    const next = new Set(pinnedIds);
    next.add(m.id);
    setPinnedIds(next);
    setPinItems((prev) => [{ id: m.id, label: messageLabel(m) }, ...prev]);
    const row: any = { group_id: id, message_id: m.id, pinned_by: session.user.id };
    let { error } = await supabase.from('pinned_messages').insert({ ...row, expires_at: new Date(Date.now() + ms).toISOString() });
    // The expires_at column may not exist yet: pin without an end time.
    if (error && /expires_at/i.test(error.message || '')) ({ error } = await supabase.from('pinned_messages').insert(row));
    if (error) Alert.alert("Couldn't pin", error.message);
    channelRef.current?.send({ type: 'broadcast', event: 'pins_changed', payload: { by: session.user.id } });
    loadPins();
  };


  // Long-press a reaction: who reacted with what.
  const showReactors = async (m: any) => {
    const rs: any[] = m.reactions || [];
    const title = `Reactions · ${rs.length}`;
    setPeople({ title, rows: [], loading: true });
    const uids = [...new Set(rs.map((r) => r.user_id))];
    const { data } = uids.length ? await supabase.from('profiles').select('id,display_name,username,avatar_url').in('id', uids) : { data: [] as any[] };
    const byId: Record<string, any> = {};
    (data || []).forEach((p: any) => (byId[p.id] = p));
    const freq: Record<string, number> = {};
    rs.forEach((r) => (freq[r.emoji] = (freq[r.emoji] || 0) + 1));
    const rows: PersonRow[] = [...rs]
      .sort((a, b) => freq[b.emoji] - freq[a.emoji] || String(a.emoji).localeCompare(String(b.emoji)))
      .map((r) => ({ id: r.user_id, name: byId[r.user_id]?.display_name || 'Someone', username: byId[r.user_id]?.username, avatar: byId[r.user_id]?.avatar_url, right: r.emoji }));
    setPeople({ title, rows, loading: false });
  };

  // Long-press YOUR OWN message > "Seen by": members whose chat was opened after the
  // message arrived. Privacy: members who turned read receipts off are hidden, and
  // it only works if yours are on. Group ADMINS bypass this and always see everyone.
  const showSeenBy = async (m: any) => {
    if (!isGroupAdmin && !myReceiptsOn) {
      setPeople({ title: 'Seen by', rows: [], loading: false, emptyText: 'Read receipts are off for you.', note: 'Turn them on in Settings to see who saw your messages.' });
      return;
    }
    setPeople({ title: 'Seen by', rows: [], loading: true });
    const { data } = await supabase
      .from('group_members')
      .select('user_id,last_read_at,profile:profiles(id,display_name,username,avatar_url,show_read_receipts)')
      .eq('group_id', id)
      .gte('last_read_at', m.created_at)
      .neq('user_id', m.sender_id)
      .order('last_read_at', { ascending: true })
      .limit(100);
    const rows: PersonRow[] = (data || [])
      .filter((r: any) => r.profile && (isGroupAdmin || r.profile.show_read_receipts !== false))
      .map((r: any) => ({ id: r.user_id, name: r.profile.display_name || 'Someone', username: r.profile.username, avatar: r.profile.avatar_url }));
    setPeople({
      title: rows.length ? `Seen by · ${rows.length}` : 'Seen by',
      rows,
      loading: false,
      emptyText: 'Nobody has seen this yet.',
      note: isGroupAdmin ? 'As an admin you see everyone, even members who turned read receipts off.' : undefined,
    });
  };

  // ---- @mentions: "@" lists the first 50 members; "@jo" finds members named jo.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<any[]>([]);
  const [mentionBusy, setMentionBusy] = useState(false);
  const mentionSeq = useRef(0);
  const mentionTimer = useRef<any>(null);
  const first50Ref = useRef<any[] | null>(null);
  const closeMention = () => {
    mentionSeq.current++;
    clearTimeout(mentionTimer.current);
    setMentionQuery(null);
    setMentionResults([]);
    setMentionBusy(false);
  };
  // "@all" tags everyone in the group.
  const ALL_ITEM = { id: '__all', display_name: 'Everyone in this group', username: 'all', avatar_url: null, isAll: true };
  const MENTION_END = /(^|\s)@([A-Za-z0-9_]{0,30})$/;
  const onTextChange = (t: string) => {
    setText(t);
    sendTyping();
    const mt = MENTION_END.exec(t);
    if (!mt) {
      if (mentionQuery !== null) closeMention();
      return;
    }
    const q = mt[2];
    setMentionQuery(q);
    setMentionBusy(true);
    const seq = ++mentionSeq.current;
    clearTimeout(mentionTimer.current);
    mentionTimer.current = setTimeout(async () => {
      let list: any[] = [];
      if (!q) {
        if (!first50Ref.current) {
          const { data } = await supabase.from('group_members').select('user_id,profile:profiles(id,display_name,username,avatar_url)').eq('group_id', id).limit(50);
          first50Ref.current = (data || []).map((r: any) => r.profile).filter(Boolean);
        }
        list = [ALL_ITEM, ...(first50Ref.current as any[])];
      } else {
        const clean = cleanSearchText(q);
        if (clean) {
          const { data: found } = await supabase
            .from('profiles')
            .select('id,display_name,username,avatar_url')
            .or(`username.ilike.${clean}%,display_name.ilike.%${clean}%`)
            .limit(30);
          const ids = (found || []).map((p: any) => p.id);
          if (ids.length) {
            const { data: inGroup } = await supabase.from('group_members').select('user_id').eq('group_id', id).in('user_id', ids);
            const ok = new Set((inGroup || []).map((r: any) => r.user_id));
            list = (found || []).filter((p: any) => ok.has(p.id));
          }
          if ('all'.startsWith(clean.toLowerCase())) list = [ALL_ITEM, ...list];
        }
      }
      if (seq !== mentionSeq.current) return;
      setMentionResults(list.filter((p) => p.username && p.id !== session?.user?.id));
      setMentionBusy(false);
    }, q ? 200 : 0);
  };
  const pickMention = (p: any) => {
    setText((prev) => prev.replace(MENTION_END, (_m, sp) => `${sp}@${p.username} `));
    closeMention();
  };

  const [reportMessage, setReportMessage] = useState<any>(null);
  const handleReportMessage = (m: any) => setReportMessage(m);
  const submitMessageReport = async (reason: string, details: string) => {
    if (!session?.user?.id || !reportMessage) return;
    // Same reported_message_id column the webapp uses for both DM and
    // group message reports — it isn't tied to one specific table.
    const { error } = await supabase
      .from('reports')
      .insert({ reporter_id: session.user.id, reported_message_id: reportMessage.id, reported_user_id: reportMessage.sender_id || null, reason, details: details || null });
    if (error) throw error;
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Wrapper style={Platform.OS === 'ios' ? { flex: 1, backgroundColor: colors.bg } : [{ flex: 1, backgroundColor: colors.bg }, kbStyle]} {...wrapperProps}>
      <BlurTargetContext.Provider value={blurRef}>
      <BlurTarget ref={blurRef} style={{ flex: 1 }}>
      {wp.kind === 'preset' && (
        <LinearGradient colors={WALLPAPER_PRESETS.find((x) => x.id === wp.id)?.colors || ['#000', '#000']} style={StyleSheet.absoluteFill} pointerEvents="none" />
      )}
      {wp.kind === 'upload' && (
        <>
          <Image source={{ uri: wp.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${chatTheme.dim ?? 0.25})` }]} pointerEvents="none" />
        </>
      )}
      <View style={[styles.topBar, { borderBottomColor: colors.border, backgroundColor: colors.bg, paddingTop: insets.top + 6 }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.topBarCenter} onPress={() => router.push({ pathname: '/groups/settings', params: { id } })}>
          {groupInfo?.avatar_url ? (
            <Avatar uri={groupInfo.avatar_url} size={34} />
          ) : (
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: groupInfo?.cover_color || colors.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>{String(groupInfo?.name || name || 'G')[0]?.toUpperCase()}</Text>
            </View>
          )}
          <View>
            <Text style={[styles.topBarTitle, { color: colors.text }]}>{name || 'Group'}</Text>
            {typingNames.length > 0 && (
              <Text style={[styles.statusText, { color: colors.primary }]} numberOfLines={1}>
                {typingNames.join(', ')} {typingNames.length === 1 ? 'is' : 'are'} typing...
              </Text>
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setTopMenuOpen(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="ellipsis-vertical" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>
      <TopMenu
        visible={topMenuOpen}
        onClose={() => setTopMenuOpen(false)}
        options={[
          { label: 'Chat theme', icon: 'color-palette-outline', onPress: () => setThemeOpen(true) },
          { label: 'Clear history', icon: 'trash-outline', destructive: true, onPress: () => askClearHistory() },
        ]}
      />

      {(pinItems.length > 0 || (isGroupAdmin && joinCount > joinDismissed)) && (
        <View>
          {pinItems.length > 0 && <PinnedBar items={pinItems} onJump={scrollToId} />}
          {isGroupAdmin && joinCount > joinDismissed && (
            <JoinRequestsBanner
              count={joinCount}
              overlay={pinItems.length > 0}
              onOpen={() => router.push({ pathname: '/groups/settings', params: { id } })}
              onDismiss={() => setJoinDismissed(joinCount)}
            />
          )}
        </View>
      )}

      {/* The list is inverted (flipped upside down internally so the newest message
          sits at the bottom). Anything drawn INSIDE it comes out flipped too, which is
          why the greeting kept appearing upside down. So it is drawn on top of the list
          instead, as an ordinary, un-flipped overlay. */}
      <View style={{ flex: 1 }}>
      <FlatList
        ref={listRef}
        onTouchStart={() => {
          if (showStickerTray) setShowStickerTray(false);
        }}
        onScroll={(e) => {
          const away = e.nativeEvent.contentOffset.y > 250;
          if (away !== awayRef.current) {
            awayRef.current = away;
            setAwayFromBottom(away);
            if (!away) setNewWhileAway(0);
          }
        }}
        scrollEventThrottle={64}
        onScrollToIndexFailed={(info) => listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true })}
        data={messages}
        keyExtractor={(item) => String(item._key || item.id)}
        inverted
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        initialNumToRender={14}
        maxToRenderPerBatch={8}
        windowSize={9}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 10 }} color={colors.primary} /> : null}
        contentContainerStyle={{ paddingVertical: 8 }}
        renderItem={({ item, index }) => {
          if (item.system_event) {
            return (
              <View style={{ alignItems: 'center', paddingVertical: 6, paddingHorizontal: 24 }}>
                <Text style={{ fontSize: 12, color: colors.subtext, textAlign: 'center' }}>{item.content}</Text>
              </View>
            );
          }
          const older = messages[index + 1];
          const newer = messages[index - 1];
          const groupedWithAbove = !!older && older.sender_id === item.sender_id && (new Date(item.created_at).getTime() - new Date(older.created_at).getTime()) <= 120000;
          const groupedWithBelow = !!newer && newer.sender_id === item.sender_id && (new Date(newer.created_at).getTime() - new Date(item.created_at).getTime()) <= 120000;
          return (
            <MessageBubble
              message={item}
              viewOnceOpened={voOpened.has(String(item.id))}
              onOpenViewOnce={(m) => { setVoMsg(m); voMark(m.id); }}
              onForward={(m) => setForwardMsg(m)}
              myBubbleColor={myBubbleColor}
              myBubbleGradient={bubbleLook.gradient}
              onPressReply={() => jumpToReply(item)}
              onStickerPress={(m) => stickerMenu(m.sticker_url)}
              highlighted={highlightId === item.id}
              isMine={item.sender_id === session?.user?.id}
              currentUserId={session?.user?.id}
              senderAvatar={item.author?.avatar_url}
              senderName={item.author?.display_name}
              senderId={item.sender_id}
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
              onReport={handleReportMessage}
              compactReactions
              onShowReactors={showReactors}
              onShowSeenBy={showSeenBy}
              replyHeader={(() => { if (!item.reply_to_id) return undefined; const o = messages.find((x) => x.id === item.reply_to_id); if (!o) return undefined; const meId = session?.user?.id; if (o.sender_id === meId) return item.sender_id === meId ? undefined : 'replied to you'; const nm = (o.author?.display_name || '').split(' ')[0]; if (!nm) return undefined; return item.sender_id === meId ? `You replied to ${nm}` : `replied to ${nm}`; })()}
              replyThumb={(() => { const o = item.reply_to_id ? messages.find((x) => x.id === item.reply_to_id) : null; return o && o.image_url && !o.view_once && !o.is_sticker && !o.is_voice && !o.video_url ? o.image_url : undefined; })()}
              replySticker={item.reply_to === STICKER_LABEL && item.reply_to_id ? messages.find((x) => x.id === item.reply_to_id)?.sticker_url : undefined}
            />
          );
        }}
      />
        {!loading && messages.length === 0 && (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Text style={[styles.empty, { color: colors.subtext }]}>No messages yet. Say hi 👋</Text>
          </View>
        )}
      </View>
      {(replyingTo || editingId) && (
        <View style={[styles.previewBar, { borderTopColor: colors.border, backgroundColor: colors.bubbleTheirs }]}>
          {!editingId && replyingTo?.image_url && !replyingTo?.view_once && !replyingTo?.is_sticker && !replyingTo?.is_voice && !replyingTo?.video_url ? (
            <Image source={{ uri: replyingTo.image_url }} style={{ width: 40, height: 40, borderRadius: 8, marginRight: 10 }} resizeMode="cover" />
          ) : null}
          <View style={{ flex: 1 }}>
            <Text style={[styles.previewLabel, { color: colors.primary }]}>{editingId ? 'Editing message' : 'Replying to'}</Text>
            <Text style={[styles.previewText, { color: colors.subtext }]} numberOfLines={1}>
              {editingId ? messages.find((m) => m.id === editingId)?.content : replyLabel(replyingTo)}
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
      {mentionQuery !== null && (mentionResults.length > 0 || (!mentionBusy && mentionQuery.length > 0)) && (
        <View style={[styles.mentionBox, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          {mentionResults.length > 0 ? (
            <FlatList
              data={mentionResults}
              keyExtractor={(u) => u.id}
              keyboardShouldPersistTaps="always"
              style={{ maxHeight: 220 }}
              renderItem={({ item: u }) => (
                <TouchableOpacity style={styles.mentionRow} onPress={() => pickMention(u)}>
                  {u.isAll ? (
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="people" size={17} color="#fff" />
                    </View>
                  ) : (
                    <Avatar uri={u.avatar_url} size={32} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>{u.display_name}</Text>
                    <Text style={{ color: colors.subtext, fontSize: 12 }} numberOfLines={1}>@{u.username}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          ) : (
            <Text style={{ color: colors.subtext, padding: 12, fontSize: 13 }}>No one in this group matches.</Text>
          )}
        </View>
      )}
      {voice.recording ? (
        <VoiceRecordingBar levels={voice.levels} seconds={voice.seconds} onCancel={cancelVoice} onSend={stopToPreview} />
      ) : voicePreview ? (
        <VoicePreviewBar uri={voicePreview.uri} duration={voicePreview.duration} onDiscard={discardPreview} onSend={confirmSendPreview} />
      ) : (
        <>
          {imageUri && (
            <View style={[styles.imagePreviewBar, { borderTopColor: colors.border, backgroundColor: colors.card }]}>
              <TouchableOpacity onPress={() => setEditorOpen(true)}>
                <Image source={{ uri: imageUri }} style={styles.imagePreviewThumb} />
                <View style={{ position: 'absolute', right: 3, bottom: 3, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, padding: 3 }}>
                  <Ionicons name="pencil" size={12} color="#fff" />
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setImageUri(null)} style={styles.imagePreviewRemove}>
                <Ionicons name="close-circle" size={22} color={colors.subtext} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setViewOnceOn((v) => !v)} style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: viewOnceOn ? colors.primary : colors.inputBg }}>
                <Ionicons name="flame" size={15} color={viewOnceOn ? '#fff' : colors.subtext} />
                <Text style={{ color: viewOnceOn ? '#fff' : colors.subtext, fontWeight: '700', fontSize: 12 }}>View once</Text>
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
              <TouchableOpacity onPress={() => setViewOnceOn((v) => !v)} style={{ marginLeft: 8, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: viewOnceOn ? colors.primary : colors.inputBg }}>
                <Ionicons name="flame" size={15} color={viewOnceOn ? '#fff' : colors.subtext} />
                <Text style={{ color: viewOnceOn ? '#fff' : colors.subtext, fontWeight: '700', fontSize: 12 }}>View once</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={sendVideo} style={[styles.sendImageBtn, { backgroundColor: colors.primary }]}>
                <Ionicons name="send" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
          {clip.has && !imageUri && !videoUri && (
            <PasteImageChip
              onPaste={async () => {
                const u = await clip.take();
                if (u) setImageUri(u);
              }}
              onDismiss={clip.dismiss}
            />
          )}
          <ActionTray
            open={plusOpen}
            onClose={() => setPlusOpen(false)}
            actions={[
              { key: 'media', icon: 'image-outline', label: 'Photo', onPress: pickImage },
              { key: 'sticker', icon: 'happy-outline', label: 'Stickers', onPress: () => { if (!showStickerTray) Keyboard.dismiss(); setShowStickerTray(true); } },
              { key: 'poll', icon: 'stats-chart-outline', label: 'Poll', onPress: () => { Keyboard.dismiss(); setPollOpen(true); } },
            ]}
          />
          <View style={[styles.inputBar, { borderTopColor: colors.border, backgroundColor: colors.card, paddingBottom: 10 + (Platform.OS === 'ios' && !kbOpen ? insets.bottom : 0) }]}>
            <PlusButton open={plusOpen} onPress={() => setPlusOpen((v) => !v)} />
            <PasteTextInput
              ref={inputRef}
              onPasteImage={(u) => setImageUri(u)}
              style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text }]}
              placeholder="Message the group..."
              placeholderTextColor={colors.faint}
              showSoftInputOnFocus={!showStickerTray}
              multiline
              submitBehavior="newline"
              returnKeyType="default"
              value={text}
              onChangeText={onTextChange}
            />
            {text.trim() || imageUri || videoUri ? (
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
              onSendPack={sendPack}
              onClose={() => setShowStickerTray(false)}
              onBackspace={() => setText((t) => deleteLast(t))}
              onSend={() => send()}
              canSend={!!(text.trim() || imageUri || videoUri)}
              onCancel={() => { setShowStickerTray(false); focusInput(); }}
            />
          )}
        </>
      )}
      <PeopleListSheet
        visible={!!people}
        title={people?.title || ''}
        rows={people?.rows || []}
        loading={people?.loading}
        note={people?.note}
        emptyText={people?.emptyText}
        onClose={() => setPeople(null)}
      />
      <ChatThemeSheet
        visible={themeOpen}
        onClose={() => setThemeOpen(false)}
        conversationId={'group_' + String(id)}
        theme={chatTheme}
        onChange={changeTheme}
        verified={meVerified}
        note="Only you see this theme, and only for this group."
        onReset={async () => {
          await clearChatTheme('group_' + String(id));
          setChatTheme(await loadChatTheme('group_' + String(id)));
        }}
      />
      <ReportModal visible={!!reportMessage} onClose={() => setReportMessage(null)} onSubmit={submitMessageReport} />
      <VideoTrimmer
        visible={!!trimmer}
        uri={trimmer?.uri ?? ''}
        durationSeconds={trimmer?.duration ?? undefined}
        maxSeconds={trimmer?.max ?? 20}
        onCancel={() => setTrimmer(null)}
        onDone={(u) => { setVideoUri(u); setTrimmer(null); }}
      />
      <ViewOnceViewer message={voMsg} onClose={() => setVoMsg(null)} />
      <PollCreateSheet visible={pollOpen} onClose={() => setPollOpen(false)} onCreated={sendPoll} />
      <ImageEditor visible={editorOpen} uri={imageUri} onCancel={() => setEditorOpen(false)} onDone={(u) => { setImageUri(u); setEditorOpen(false); }} />
      <ActionSheet
        visible={!!stickerSheetUrl}
        onClose={() => setStickerSheetUrl(null)}
        options={[
          { label: 'Add to my stickers', icon: 'add-circle-outline', onPress: async () => stickerDone(await addStickerToMyPack(session!.user.id, stickerSheetUrl!)) },
          { label: 'View this pack', icon: 'albums-outline', onPress: () => { const u = stickerSheetUrl; setTimeout(() => setViewPackUrl(u), 250); } },
        ]}
      />
      <StickerPackSheet visible={!!viewPackUrl} stickerUrl={viewPackUrl} me={session?.user?.id} onClose={() => setViewPackUrl(null)} />
      <ActionSheet
        visible={!!pinChoice}
        title="Pin for how long?"
        onClose={() => setPinChoice(null)}
        options={PIN_DURATIONS.map((d) => ({ label: d.label, icon: 'pin-outline' as const, onPress: () => pinChoice && doPin(pinChoice, d.ms) }))}
      />
      <ChatPickerSheet visible={!!forwardMsg} userId={session?.user?.id} title="Forward to" busy={forwarding} onClose={() => setForwardMsg(null)} onSend={doForward} />
      <JumpToBottom visible={awayFromBottom} count={newWhileAway} onPress={jumpToBottom} bottom={imageUri ? 160 : 96} />
      </BlurTarget>
      </BlurTargetContext.Provider>
    </Wrapper>
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
  empty: { textAlign: 'center', marginTop: 30 },
  mentionBox: { borderTopWidth: 1 },
  mentionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.lg, paddingVertical: 8 },
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
