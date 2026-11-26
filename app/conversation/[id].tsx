import { PlusButton, ActionTray } from '@/components/ComposerActions';
import GiftSheet from '@/components/GiftSheet';
import GiftCard from '@/components/GiftCard';
import { useGiftAccess } from '@/lib/coins';
import { useViewOnce } from '@/lib/viewOnce';
import ViewOnceViewer from '@/components/ViewOnceViewer';
import { useCallback, useEffect, useRef, useState } from 'react';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { supportsReplyId } from '@/lib/replySupport';
import { View, FlatList, TextInput, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Image, LayoutAnimation, Alert, Keyboard } from 'react-native';
import TouchableOpacity from '@/components/PressScale';
import Text from '@/components/AppText';
import PasteTextInput from '@/components/PasteTextInput';
import { useClipboardImage } from '@/lib/clipboardImage';
import PasteImageChip from '@/components/PasteImageChip';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchStreaks, streakHint, REWARD_DAYS, type Streak } from '@/lib/streaks';
import StreakFlame from '@/components/StreakFlame';
import { startOutgoing, onCallFinished } from '@/lib/calls/callManager';
import CallCard from '@/components/CallCard';
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
import { useKeyboardPadding } from '@/lib/useKeyboardPadding';
import { forwardTo, payloadFromMessage } from '@/lib/forward';
import { setActiveConversation } from '@/lib/activeChatTracker';
import { playSound } from '@/lib/sounds';
import { getCachedMessages, setCachedMessages } from '@/lib/chatCache';
import Avatar from '@/components/Avatar';
import RingAvatar from '@/components/RingAvatar';
import VerifiedBadge from '@/components/VerifiedBadge';
import VoiceRecordingBar from '@/components/VoiceRecordingBar';
import VoicePreviewBar from '@/components/VoicePreviewBar';
import StickerTray from '@/components/StickerTray';
import { deleteLast } from '@/lib/emojiSplit';
import ReportModal from '@/components/ReportModal';
import { spacing } from '@/lib/theme';
import { lastSeenText } from '@/lib/timeAgo';
import { LinearGradient } from 'expo-linear-gradient';
import ChatThemeSheet from '@/components/ChatThemeSheet';
import { ChatTheme, DEFAULT_THEME, WALLPAPER_PRESETS, resolveBubble, loadChatTheme, saveChatTheme, clearChatTheme, peekChatTheme } from '@/lib/chatTheme';
import { isVerifiedUser } from '@/lib/postActions';
import ImageEditor from '@/components/ImageEditor';
import JumpToBottom from '@/components/JumpToBottom';
import ActionSheet from '@/components/ActionSheet';
import TopMenu from '@/components/TopMenu';
import { BlurTarget, BlurTargetContext } from '@/lib/blurTarget';
import NewChatIntro from '@/components/NewChatIntro';
import { getClearedAt, clearHistoryUpTo, isAfterCleared } from '@/lib/clearHistory';
import PinnedBar from '@/components/PinnedBar';
import { MAX_PINS, STICKER_LABEL, PinnedItem, fetchPins, messageLabel, PIN_DURATIONS } from '@/lib/pins';
import { saveEdit } from '@/lib/msgExtras';
import { addStickerToMyPack, StickerResult } from '@/lib/stickerActions';
import { StickerPackSheet } from '@/components/StickerPackCard';
import { acquireTyping, sendTyping as sendTypingSignal } from '@/lib/typingHub';
import { useOnlinePresence } from '@/lib/usePresence';
import { useAppForeground } from '@/lib/useAppForeground';
import { useVoiceRecorder } from '@/lib/useVoiceRecorder';
import { uploadVoiceNote, uploadImage, uploadVideo, uploadDocument } from '@/lib/upload';
import { pickDocument } from '@/lib/chatFiles';
import { checkVideoLimits, getVideoLimitSeconds, canTrimToFit } from '@/lib/videoLimits';
import VideoTrimmer from '@/components/VideoTrimmer';

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
  const { pushEvent } = useInbox();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // ---- Tap a quoted reply -> scroll to that message and flash it.
  const listRef = useRef<FlatList>(null);
  // Own display name, sent with the typing signal (it used to send the email).
  const [myName, setMyName] = useState('Someone');
  useEffect(() => {
    if (session?.user?.id) supabase.from('profiles').select('display_name,username').eq('id', session.user.id).maybeSingle().then(({ data }) => {
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
      const { data: target } = await supabase.from('messages').select('created_at').eq('id', targetId).maybeSingle();
      if (!target) {
        Alert.alert('Message not found', 'That message was deleted.');
        loadPins();
        return;
      }
      let cur: string | null = cursorRef.current || messagesRef.current[messagesRef.current.length - 1]?.created_at || null;
      if (!cur) return;
      let added: any[] = [];
      for (let round = 0; round < 5; round++) {
        const { data: older } = await supabase.from('messages').select('*').eq('conversation_id', id).lt('created_at', cur).order('created_at', { ascending: false }).limit(200);
        if (!older || !older.length) break;
        added = added.concat(await attachReactions(older));
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

  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [replyIdOk, setReplyIdOk] = useState(false);
  useEffect(() => {
    supportsReplyId('messages').then(setReplyIdOk);
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

  // Lets the push notification handler know this conversation is the one
  // currently open, so a message arriving for it doesn't also pop a
  // foreground banner on top of the thread you're already looking at.
  useEffect(() => {
    setActiveConversation(id as string);
    return () => setActiveConversation(null);
  }, [id]);
  const [messages, setMessages] = useState<any[]>(() => getCachedMessages(`dm:${id}`) || []);
  const messagesRef = useRef<any[]>([]);
  messagesRef.current = messages;
  const catchUpRef = useRef<() => void>(() => {});
  useEffect(() => {
    const top = messages[0];
    if (top && lastTopId.current && top.id !== lastTopId.current && awayRef.current && top.sender_id !== session?.user?.id && !String(top.id).startsWith('temp')) {
      setNewWhileAway((c) => c + 1);
    }
    lastTopId.current = top?.id ?? null;
  }, [messages[0]?.id]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(() => !getCachedMessages(`dm:${id}`));
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
  const [otherLastRead, setOtherLastRead] = useState<string | null>(null);
  const channelRef = useRef<any>(null);
  const inputRef = useRef<any>(null);
  const connectRef = useRef<() => void>(() => {});
  const voice = useVoiceRecorder();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const clip = useClipboardImage();
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [viewOnceOn, setViewOnceOn] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const giftAccess = useGiftAccess(otherId ? String(otherId) : null);
  const [voMsg, setVoMsg] = useState<any>(null);
  const [trimmer, setTrimmer] = useState<{ uri: string; duration: number | null; max: number } | null>(null);
  const [voicePreview, setVoicePreview] = useState<{ uri: string; duration: number; waveform?: string } | null>(null);
  const [otherProfile, setOtherProfile] = useState<any>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  // Voice call: asks the server to ring them, then opens the call screen.
  const startVoiceCall = async () => {
    if (!otherId) return;
    const r = await startOutgoing(
      { id: String(otherId), name: otherProfile?.display_name || (name as string) || 'Chat', avatar: otherProfile?.avatar_url || (otherAvatar as string) || null },
      String(id)
    );
    if (!r.ok) Alert.alert('Call', r.message || "Couldn't start the call.");
    else router.push('/call' as any);
  };
  useEffect(() => {
    let alive = true;
    const pull = () => fetchStreaks(String(id)).then((r) => {
      if (!alive) return;
      setStreak(r[0] || null);
      // First time this chat reaches 30 days: tell them about the reward, once.
      if (r[0] && r[0].streak >= REWARD_DAYS) {
        const key = `streak_reward_told_${id}`;
        AsyncStorage.getItem(key).then((v) => {
          if (v) return;
          AsyncStorage.setItem(key, '1').catch(() => {});
          Alert.alert('30-day streak! 🔥', 'You unlocked a live cover photo. Add it any time in Edit profile.');
        }).catch(() => {});
      }
    });
    pull();
    const t = setInterval(pull, 60000);
    return () => { alive = false; clearInterval(t); };
  }, [id]);
  const [showStickerTray, setShowStickerTray] = useState(false);

  useEffect(() => {
    if (!otherId) return;
    // The top bar previously only had whatever was passed as route params
    // (name, avatar) — never the full profile, so there was no verified
    // badge data available at all. Fetching it directly means the badge
    // shows correctly regardless of which screen linked into this chat.
    supabase
      .from('profiles')
      .select('*')
      .eq('id', otherId)
      .single()
      .then(({ data }) => setOtherProfile(data));
    if (session?.user?.id) {
      supabase.from('profiles').select('*').eq('id', session.user.id).single().then(({ data }) => setMyPrefs(data));
    }
  }, [otherId]);

  const onlineIds = useOnlinePresence(session?.user?.id);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const typingLastSeen = useRef<Record<string, number>>({});
  const typingThrottle = useRef<any>(null);
  const isOtherTyping = Object.keys(typingUsers).length > 0;

  // Also tell the other person's chat list (it shows "typing…" next to this chat).
  const outsideThrottle = useRef<any>(null);
  useEffect(() => (otherId ? acquireTyping(`typing_to:${otherId}`) : undefined), [otherId]);
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
    if (otherId && !outsideThrottle.current) {
      sendTypingSignal(`typing_to:${otherId}`, { conversation_id: id, user_id: session?.user?.id, name: myName });
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
  const isOtherOnline = otherId ? onlineIds.has(otherId as string) : false;
  // Privacy is mutual, like WhatsApp: read ticks only show when BOTH people
  // have read receipts on; last seen only when both have it on.
  const [myPrefs, setMyPrefs] = useState<any>(null);
  // Personal chat theme (verified members): wallpaper + own bubble colour.
  const [chatTheme, setChatTheme] = useState<ChatTheme>(() => peekChatTheme(String(id)) || DEFAULT_THEME);
  const [themeOpen, setThemeOpen] = useState(false);
  const [topMenuOpen, setTopMenuOpen] = useState(false);
  const blurRef = useRef<any>(null);
  // 'mine' = I blocked them, 'theirs' = they blocked me. Either way nobody can
  // send or react in this chat (the webapp does the same).
  const [blockState, setBlockState] = useState<null | 'mine' | 'theirs'>(null);
  useEffect(() => {
    const me = session?.user?.id;
    if (!me || !otherId) return;
    const other = String(otherId);
    supabase
      .from('blocks')
      .select('blocker_id,blocked_id')
      .or(`and(blocker_id.eq.${me},blocked_id.eq.${other}),and(blocker_id.eq.${other},blocked_id.eq.${me})`)
      .then(({ data }) => {
        const rows: any[] = data || [];
        setBlockState(rows.some((r) => r.blocker_id === me) ? 'mine' : rows.length ? 'theirs' : null);
      });
  }, [session?.user?.id, otherId]);
  const unblockOther = async () => {
    if (!session?.user?.id || !otherId) return;
    await supabase.from('blocks').delete().eq('blocker_id', session.user.id).eq('blocked_id', String(otherId)).select();
    setBlockState(null);
  };
  const clearedRef = useRef<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [meVerified, setMeVerified] = useState(false);
  // Back from Chat info: pick up a theme changed there.
  useFocusEffect(useCallback(() => { if (id) loadChatTheme(String(id)).then(setChatTheme); }, [id]));
  useEffect(() => {
    if (id) loadChatTheme(String(id)).then(setChatTheme);
    isVerifiedUser(session?.user?.id).then(setMeVerified);
  }, [id, session?.user?.id]);
  const changeTheme = (t: ChatTheme) => {
    setChatTheme(t);
    saveChatTheme(String(id), t);
  };
  const wp = chatTheme.wallpaper;
  const bubbleLook = resolveBubble(chatTheme.bubble, colors.primary);
  const myBubbleColor = bubbleLook.color;
  // Keep the other person's last-seen fresh while this chat is open: re-read
  // their profile every 30 seconds, and the moment they stop being "active".
  useEffect(() => {
    if (!otherId) return;
    const refetch = () => supabase.from('profiles').select('*').eq('id', otherId).single().then(({ data }) => data && setOtherProfile(data));
    const t = setInterval(refetch, 30000);
    return () => clearInterval(t);
  }, [otherId]);
  useEffect(() => {
    if (otherId && !isOtherOnline) supabase.from('profiles').select('*').eq('id', otherId).single().then(({ data }) => data && setOtherProfile(data));
  }, [isOtherOnline]);
  const receiptsVisible = otherProfile?.show_read_receipts !== false && myPrefs?.show_read_receipts !== false;
  const lastSeenVisible = otherProfile?.show_last_seen !== false && myPrefs?.show_last_seen !== false;

  const attachReactions = async (msgs: any[]) => {
    if (!msgs.length) return msgs;
    const ids = msgs.map((m) => m.id);
    const [{ data: reactions }, hiddenRes] = await Promise.all([
      supabase.from('message_reactions').select('message_id,user_id,emoji').in('message_id', ids),
      // Messages this person deleted "for me". If that table isn't there yet, nothing is hidden.
      session?.user?.id
        ? supabase.from('hidden_messages').select('message_id').eq('user_id', session.user.id).in('message_id', ids.map(String))
        : Promise.resolve({ data: null } as any),
    ]);
    const hidden = new Set(((hiddenRes as any)?.data || []).map((h: any) => String(h.message_id)));
    return msgs.filter((m) => !hidden.has(String(m.id))).map((m) => ({ ...m, reactions: (reactions || []).filter((r: any) => r.message_id === m.id) }));
  };

  const loadInitial = async () => {
    const [{ data: rawMsgs }, cleared] = await Promise.all([
      supabase.from('messages').select('*').eq('conversation_id', id).order('created_at', { ascending: false }).limit(PAGE_SIZE),
      getClearedAt('dm', String(id), session?.user?.id),
    ]);
    clearedRef.current = cleared;
    const msgs = (rawMsgs || []).filter((m: any) => isAfterCleared(m.created_at, cleared));
    const withReactions = await attachReactions(msgs || []);
    // MERGE, don't replace: a message that arrived live (or one still being
    // sent) while this download was running is newer than the download, and
    // replacing the list with it made those messages vanish until you left
    // and re-opened the chat.
    setMessages((prev) => {
      if (!prev.length) return withReactions;
      const fetchedIds = new Set(withReactions.map((m: any) => m.id));
      const newest = withReactions[0]?.created_at || '';
      const prevById: Record<string, any> = {};
      prev.forEach((m: any) => (prevById[m.id] = m));
      const kept = prev.filter((m: any) => !fetchedIds.has(m.id) && (m._pending || m._failed || String(m.id).startsWith('temp_') || (m.created_at || '') > newest));
      const fresh = withReactions.map((m: any) => (prevById[m.id]?.localImage ? { ...m, localImage: prevById[m.id].localImage } : m));
      return [...kept, ...fresh].sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
    });
    setHasMore((rawMsgs || []).length === PAGE_SIZE && msgs.length === (rawMsgs || []).length);
    cursorRef.current = msgs && msgs.length ? msgs[msgs.length - 1].created_at : null;
    setCachedMessages(`dm:${id}`, withReactions);
    // Show the chat now; the pinned bar fills in a moment later.
    setLoading(false);
    loadPins();
  };

  // The pinned messages of this chat (up to 3).
  const loadPins = async () => {
    const items = await fetchPins('dm', String(id));
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
          const res = await clearHistoryUpTo('dm', String(id), session.user.id, newest);
          if (!res.ok) {
            Alert.alert('Could not clear', res.error || 'Try again.');
            return;
          }
          clearedRef.current = newest;
          setMessages([]);
          setHasMore(false);
          cursorRef.current = null;
          setCachedMessages(`dm:${id}`, []);
        },
      },
    ]);
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    const oldest = messages[messages.length - 1];
    const { data: older } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', id)
      .lt('created_at', cursorRef.current || oldest.created_at)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    const olderKept = (older || []).filter((m: any) => isAfterCleared(m.created_at, clearedRef.current));
    const withReactions = await attachReactions(olderKept);
    if (olderKept.length) cursorRef.current = olderKept[olderKept.length - 1].created_at;
    setMessages((prev) => [...prev, ...withReactions]);
    setHasMore((older || []).length === PAGE_SIZE && olderKept.length === (older || []).length);
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
    if (msg.sender_id !== session?.user?.id) playSound('incoming');
    const mine = msg.sender_id === session?.user?.id;
    if (!mine) pushEvent({ kind: 'dm', id: String(id), msg: { __read: true } });
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      // My own message coming back from the server while its bubble is still
      // being sent: the send path swaps it in, so don't add a second copy.
      if (mine) {
        // The server's copy of a message I'm still sending (slow network: its answer hasn't come back yet).
        // It completes that bubble in place, so the message shows even if the answer never arrives.
        const pend = prev.find((m: any) => m._pending && String(m.id).startsWith('temp_') && (m.content || '') === (msg.content || '') && !!m.image_url === !!msg.image_url && !!m.video_url === !!msg.video_url && !!m.is_voice === !!msg.is_voice && !!m.is_sticker === !!msg.is_sticker);
        if (pend) return prev.map((m: any) => (m.id === pend.id ? { ...msg, reactions: [], _key: m._key || m.id, ...(pend.localImage ? { localImage: pend.localImage } : {}) } : m));
      }
      return [{ ...msg, reactions: msg.reactions || [] }, ...prev];
    });
    if (!mine && !msg.read_at) {
      // Tell them first, save second — the tick changes right away even when
      // the network is slow.
      const readAt = new Date().toISOString();
      channelRef.current?.send({ type: 'broadcast', event: 'read_receipt', payload: { reader_id: session?.user?.id, read_at: readAt } });
      supabase.from('messages').update({ read_at: readAt }).eq('id', msg.id).then(() => {});
    }
  };

  // After a call the card is written by the server a moment later; pull it in
  // right away (a few quick tries) instead of waiting for the next refresh.
  useEffect(() => {
    if (!id) return;
    const timers: any[] = [];
    const pull = () => {
      supabase.from('messages').select('*').eq('conversation_id', id).not('call_id', 'is', null).order('created_at', { ascending: false }).limit(5).then(({ data }) => {
        if (!data?.length) return;
        setMessages((prev) => {
          const have = new Set(prev.map((m: any) => m.id));
          const add = data.filter((m: any) => !have.has(m.id)).map((m: any) => ({ ...m, reactions: [] }));
          return add.length ? [...add, ...prev].sort((a: any, b: any) => +new Date(b.created_at) - +new Date(a.created_at)) : prev;
        });
      });
    };
    const off = onCallFinished(() => { [200, 900, 2200].forEach((ms) => timers.push(setTimeout(pull, ms))); });
    return () => { off(); timers.forEach(clearTimeout); };
  }, [id]);

  const markAllRead = async () => {
    if (!session?.user?.id) return;
    const readAt = new Date().toISOString();
    pushEvent({ kind: 'dm', id: String(id), msg: { __read: true } });
    channelRef.current?.send({ type: 'broadcast', event: 'read_receipt', payload: { reader_id: session?.user?.id, read_at: readAt } });
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
          setMessages((prev) => prev.map((m) => (m.id === payload.new.id ? { ...m, content: payload.new.content, edited_at: payload.new.edited_at ?? m.edited_at } : m)));
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
          addIncomingMessage(msg);
          if (msg.sender_id !== session?.user?.id) {
            supabase.from('conversation_participants').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', id).eq('user_id', session?.user?.id).then(() => {});
          }
        })
        .on('broadcast', { event: 'typing' }, (payload: any) => {
          const { user_id, name } = payload.payload || {};
          if (!user_id || user_id === session?.user?.id) return;
          typingLastSeen.current[user_id] = Date.now();
          playSound('typing');
          setTypingUsers((prev) => (prev[user_id] === (name || 'Someone') ? prev : { ...prev, [user_id]: name || 'Someone' }));
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
              catchUpRef.current();
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
      setCachedMessages(`dm:${id}`, messagesRef.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [id]);

  useEffect(() => {
    const t = setInterval(() => catchUpRef.current(), 20000);
    return () => clearInterval(t);
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
    // Soft tap once the server has the message (delivered).
    playSound('send');
    animateNextChange();
    // If the server's copy already arrived live, drop it so there is one bubble.
    // _key keeps the row's identity, so the bubble is not rebuilt (blinks) when it gets its real id.
    setMessages((prev) => {
      const temp = prev.find((m) => m.id === tempId);
      if (!temp) return prev.some((m) => m.id === data.id) ? prev : [{ ...data, reactions: [] }, ...prev];   // already completed by the live copy
      return prev.filter((m) => m.id !== data.id).map((m) => (m.id === tempId ? { ...data, reactions: [], _key: m._key || m.id, ...(m.localImage && !data.localImage ? { localImage: m.localImage } : {}) } : m));
    });
  };

  const failOptimistic = async (tempId: string) => {
    // On a bad network the message may have reached the server even though its answer got lost.
    // Look for it before telling the person it failed (and before a retry would send it twice).
    const t = messagesRef.current.find((m: any) => m.id === tempId);
    if (t && session?.user?.id) {
      try {
        const since = new Date(new Date(t.created_at).getTime() - 20000).toISOString();
        const { data } = await supabase.from('messages').select('*').eq('conversation_id', id).eq('sender_id', session.user.id).gte('created_at', since).order('created_at', { ascending: false }).limit(10);
        const hit = (data || []).find((r: any) => (r.content || '') === (t.content || '') && !!r.image_url === !!t.image_url && !!r.video_url === !!t.video_url && !!r.is_voice === !!t.is_voice && !!r.is_sticker === !!t.is_sticker && !messagesRef.current.some((m: any) => m.id === r.id && m.id !== tempId));
        if (hit) { resolveOptimistic(tempId, hit); broadcastSent(hit); return; }
      } catch {}
    }
    animateNextChange();
    setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, _pending: false, _failed: true } : m)));
  };

  // Fetch anything newer than what is on screen: after the live connection dropped and came back, and every 20 seconds as a safety net.
  catchUpRef.current = async () => {
    try {
      const real = messagesRef.current.filter((m: any) => !String(m.id).startsWith('temp_'));
      const newest = real.reduce((a: string, m: any) => ((m.created_at || '') > a ? m.created_at : a), '');
      if (!newest) return;
      const { data } = await supabase.from('messages').select('*').eq('conversation_id', id).gt('created_at', newest).order('created_at', { ascending: true }).limit(50);
      (data || []).filter((m: any) => isAfterCleared(m.created_at, clearedRef.current)).forEach((m: any) => addIncomingMessage(m));
    } catch {}
  };

  const broadcastSent = (data: any) => {
    if (data?.id && data?.conversation_id) pushEvent({ kind: 'dm', id: data.conversation_id, msg: data });
    channelRef.current?.send({ type: 'broadcast', event: 'new_message', payload: data });
    if (otherId) {
      // The ping carries the message itself, so the other person's chat list
      // can update straight away without re-downloading everything.
      sendInbox(otherId, {
        type: 'broadcast',
        event: 'ping',
        payload: {
          kind: 'dm',
          id: data?.conversation_id,
          msg: data ? { id: data.id, conversation_id: data.conversation_id, sender_id: data.sender_id, content: data.content, is_voice: data.is_voice, is_sticker: data.is_sticker, video_url: data.video_url, image_url: data.image_url, created_at: data.created_at } : null,
        },
      });
    }
  };

  const sendTextMessage = async (content: string, replyTo: any, tempId?: string) => {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: id,
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
    if (tempId) resolveOptimistic(tempId, data);
    else addIncomingMessage(data);
    broadcastSent(data);
  };

  const send = async (override?: string) => {
    if (blockState) return;
    const typed = typeof override === 'string' ? override : text;
    // A picture is waiting: the send button sends it together with the text.
    if (typeof override !== 'string' && imageUri) return sendImage();
    if (typeof override !== 'string' && videoUri) return sendVideo();
    if (!typed.trim() || !session?.user?.id) return;
    const content = typed.trim();

    if (editingId) {
      animateNextChange();
      setMessages((prev) => prev.map((m) => (m.id === editingId ? { ...m, content } : m)));
      const editId = editingId;
      setEditingId(null);
      setText('');
      const editedAt = await saveEdit('messages', editId, session.user.id, content);
      if (editedAt) {
        setMessages((prev) => prev.map((m) => (m.id === editId ? { ...m, edited_at: editedAt } : m)));
        channelRef.current?.send({ type: 'broadcast', event: 'message_edited', payload: { id: editId, content, edited_at: editedAt } });
      }
      return;
    }

    const replyTo = replyingTo;
    setText('');
    setReplyingTo(null);

    // Drop the bubble in immediately — the network round trip happens in
    // the background and reconciles silently when it lands.
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

  const sendFileMessage = async (f: { uri: string; name: string; size: number }, tempId: string) => {
    const url = await uploadDocument(f.uri, `messages/${session!.user.id}`, f.name);
    if (!url) { failOptimistic(tempId); return; }
    const { data, error } = await supabase
      .from('messages')
      .insert({ conversation_id: id, sender_id: session!.user.id, content: f.name, file_url: url, file_name: f.name, file_size: f.size })
      .select()
      .single();
    if (error || !data) { console.error('[sendFile] insert failed:', error?.message); failOptimistic(tempId); return; }
    resolveOptimistic(tempId, data);
    broadcastSent(data);
  };

  const pickFile = async () => {
    try {
      const f = await pickDocument();
      if (!f || !session?.user?.id) return;
      if (f.size > 50 * 1024 * 1024) { Alert.alert('File too large', 'Files can be up to 50 MB.'); return; }
      const temp = makeTempMessage({ content: f.name, file_url: f.uri, file_name: f.name, file_size: f.size });
      addOptimistic(temp);
      sendFileMessage(f, temp.id);
    } catch (e) {
      Alert.alert('Files unavailable', 'Update the app to send files.');
    }
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Camera permission needed', 'Allow camera access in Settings.'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'], quality: 0.9, videoMaxDuration: 60 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (asset.type === 'video') setVideoUri(asset.uri);
    else setImageUri(asset.uri);
  };

  const { opened: voOpened, markOpened: voMark } = useViewOnce(messages, session?.user?.id);

  const sendImageMessage = async (localUri: string, tempId: string, caption = '', reply?: { label: string | null; id: string | null }, viewOnce = false) => {
    const url = await uploadImage(localUri, `messages/${session!.user.id}`);
    if (!url) {
      console.error('[sendImage] upload returned no url');
      failOptimistic(tempId);
      return;
    }

    const { data, error } = await supabase
      .from('messages')
      .insert({ conversation_id: id, sender_id: session!.user.id, content: caption, image_url: url, ...(reply?.label ? { reply_to: reply.label } : {}), ...(replyIdOk && reply?.id ? { reply_to_id: reply.id } : {}), ...(viewOnce ? { view_once: true } : {}) })
      .select()
      .single();

    if (error || !data) {
      console.error('[sendImage] insert failed:', error?.message, error);
      failOptimistic(tempId);
      return;
    }
    resolveOptimistic(tempId, { ...data, localImage: localUri });
    broadcastSent(data);
  };

  const sendImage = () => {
    if (!imageUri || !session?.user?.id) return;
    const localUri = imageUri;
    // Whatever is typed goes out WITH the picture as one message (it used to
    // be sent as a separate text message next to the image).
    const caption = text.trim();
    setText('');
    setImageUri(null);
    // A picture sent while replying carries the reply, and can be "view once".
    const replyTo = replyingTo;
    const reply = replyTo ? { label: replyLabel(replyTo), id: realId(replyTo) } : undefined;
    const once = viewOnceOn;
    setReplyingTo(null);
    setViewOnceOn(false);
    // image_url is set to the local file immediately so the picked photo
    // shows in the bubble at full quality right away — it's swapped for
    // the R2 url once the upload finishes, invisibly to the eye since it's
    // the same picture either way.
    const temp = makeTempMessage({ content: caption, image_url: localUri, localImage: localUri, ...(reply?.label ? { reply_to: reply.label, reply_to_id: reply.id } : {}), ...(once ? { view_once: true } : {}) });
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
      .from('messages')
      .insert({ conversation_id: id, sender_id: session!.user.id, content: caption, video_url: url, ...(reply?.label ? { reply_to: reply.label } : {}), ...(replyIdOk && reply?.id ? { reply_to_id: reply.id } : {}), ...(viewOnce ? { view_once: true } : {}) })
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
    // Whatever is typed goes out WITH the video as its caption.
    const caption = text.trim();
    setText('');
    setVideoUri(null);
    const replyTo = replyingTo;
    const reply = replyTo ? { label: replyLabel(replyTo), id: realId(replyTo) } : undefined;
    const once = viewOnceOn;
    setReplyingTo(null);
    setViewOnceOn(false);
    // Same trick as sendImage: show the local file in the bubble
    // immediately, swap in the uploaded R2 url once it lands.
    const temp = makeTempMessage({ content: caption, video_url: localUri, ...(reply?.label ? { reply_to: reply.label, reply_to_id: reply.id } : {}), ...(once ? { view_once: true } : {}) });
    addOptimistic(temp);
    sendVideoMessage(localUri, temp.id, reply, once, caption);
  };

  // Stickers are already-uploaded media (picked from the tray) — no upload
  // step here, just an insert, same shape as sendTextMessage.
  const sendStickerMessage = async (stickerUrl: string, tempId: string, reply?: { label: string | null; id: string | null }) => {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: id,
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
    resolveOptimistic(tempId, data);
    broadcastSent(data);
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
        .from('messages')
        .insert({ conversation_id: id, sender_id: session.user.id, content: temp.content, shared_pack_id: packId })
        .select()
        .single();
      if (error || !data) {
        console.error('[sendPack] insert failed:', error?.message);
        failOptimistic(temp.id);
        return;
      }
      resolveOptimistic(temp.id, data);
      broadcastSent(data);
    })();
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

  const sendVoiceMessage = async (localUri: string, duration: number, tempId: string, waveform?: string) => {
    const voiceUrl = await uploadVoiceNote(localUri, waveform);
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
    const { uri, duration, waveform } = voicePreview;
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
  // Delete for me: only hidden on this account (other people still see it).
  const deleteForMe = async (m: any) => {
    if (!session?.user?.id) return;
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    setPinItems((prev) => prev.filter((i) => i.id !== m.id));
    if (!realId(m)) return;
    const { error } = await supabase.from('hidden_messages').insert({ user_id: session.user.id, message_id: String(m.id) });
    if (error && !/duplicate/i.test(error.message)) {
      console.warn('[DM] delete for me failed:', error.message);
      Alert.alert("Couldn't delete", 'Delete for me needs a one-time database update first (run the SQL from the chat).');
      loadInitial();
    }
  };
  // Delete for everyone: only your own messages.
  const deleteForEveryone = async (m: any) => {
    if (!session?.user?.id) return;
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    setPinItems((prev) => prev.filter((i) => i.id !== m.id));
    if (!realId(m)) return;
    const { data, error } = await supabase.from('messages').delete().eq('id', m.id).eq('sender_id', session.user.id).select('id');
    if (error || !data?.length) {
      console.warn('[DM] delete for everyone failed:', error?.message);
      Alert.alert("Couldn't delete", error?.message || 'The database did not allow it.');
      loadInitial();
    }
    if (!error && data?.length) channelRef.current?.send({ type: 'broadcast', event: 'message_deleted', payload: { id: m.id } });
  };
  const handleDelete = (m: any) => {
    if (m.sender_id === session?.user?.id) {
      Alert.alert('Delete message?', 'Choose how you want to delete this message.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete for me', onPress: () => deleteForMe(m) },
        { text: 'Delete for everyone', style: 'destructive', onPress: () => deleteForEveryone(m) },
      ]);
    } else {
      Alert.alert('Delete message?', 'This removes the message from your chat only. The other person still has it.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete for me', style: 'destructive', onPress: () => deleteForMe(m) },
      ]);
    }
  };
  const handleReact = async (m: any, emoji: string) => {
    if (!session?.user?.id) return;
    if (blockState) {
      Alert.alert("Can't react", blockState === 'mine' ? 'You blocked this person. Unblock to react.' : "You can't react in this conversation.");
      return;
    }
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
    const { data, error } = await supabase.from('pinned_messages').delete().eq('conversation_id', id).eq('message_id', m.id).select('message_id');
    if (error || !data?.length) {
      const still = await fetchPins('dm', String(id));
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
    const row: any = { conversation_id: id, message_id: m.id, pinned_by: session.user.id };
    let { error } = await supabase.from('pinned_messages').insert({ ...row, expires_at: new Date(Date.now() + ms).toISOString() });
    // The expires_at column may not exist yet: pin without an end time.
    if (error && /expires_at/i.test(error.message || '')) ({ error } = await supabase.from('pinned_messages').insert(row));
    if (error) Alert.alert("Couldn't pin", error.message);
    channelRef.current?.send({ type: 'broadcast', event: 'pins_changed', payload: { by: session.user.id } });
    loadPins();
  };


  const [reportMessage, setReportMessage] = useState<any>(null);
  const handleReportMessage = (m: any) => setReportMessage(m);
  const submitMessageReport = async (reason: string, details: string) => {
    if (!session?.user?.id || !reportMessage) return;
    const { error } = await supabase
      .from('reports')
      .insert({ reporter_id: session.user.id, reported_message_id: reportMessage.id, reported_user_id: reportMessage.sender_id || null, reason, details: details || null });
    if (error) throw error;
  };

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
    <Wrapper style={Platform.OS === 'ios' ? { flex: 1, backgroundColor: colors.bg } : [{ flex: 1, backgroundColor: colors.bg }, kbStyle]} {...wrapperProps}>
      <BlurTargetContext.Provider value={blurRef}>
      <BlurTarget ref={blurRef} style={{ flex: 1 }}>
      {/* Wallpaper sits behind everything and never takes touches. */}
      {wp.kind === 'preset' && (
        <LinearGradient colors={WALLPAPER_PRESETS.find((x) => x.id === wp.id)?.colors || ['#000', '#000']} style={StyleSheet.absoluteFill} pointerEvents="none" />
      )}
      {wp.kind === 'upload' && (
        <>
          <Image source={{ uri: wp.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" pointerEvents="none" />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${chatTheme.dim ?? 0.25})` }]} pointerEvents="none" />
        </>
      )}
      <View style={[styles.topBar, { borderBottomColor: colors.border, backgroundColor: colors.bg, paddingTop: insets.top + 6 }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.topBarCenter, { flex: 1, minWidth: 0 }]} onPress={() => otherId && router.push({ pathname: '/chat-info/[id]', params: { id: String(id), otherId: String(otherId) } } as any)}>
          <View>
            <RingAvatar userId={otherId as string} uri={otherProfile?.avatar_url || (otherAvatar as string)} size={34} noTap />
            {isOtherOnline && <View style={[styles.onlineDot, { borderColor: colors.card }]} />}
          </View>
          <View style={{ flexShrink: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={[styles.topBarTitle, { color: colors.text, flexShrink: 1 }]} numberOfLines={1} ellipsizeMode="tail">{otherProfile?.display_name || name || 'Chat'}</Text>
              <VerifiedBadge verified={otherProfile?.verified} isAuthentic={otherProfile?.is_authentic} plan={otherProfile?.verified_plan} size={12} />
              {streak ? <StreakFlame days={streak.streak} atRisk={streak.at_risk && !streak.me_today} /> : null}
            </View>
            <Text style={[styles.statusText, { color: isOtherTyping ? colors.primary : colors.subtext }]}>
              {isOtherTyping ? 'typing...' : isOtherOnline ? 'Active now' : lastSeenVisible && otherProfile?.last_seen_at ? `last seen ${lastSeenText(otherProfile.last_seen_at)}` : ''}
            </Text>
          </View>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, flexShrink: 0 }}>
          {otherId ? (
            <TouchableOpacity onPress={startVoiceCall} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="call-outline" size={22} color={colors.text} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={() => setTopMenuOpen(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="ellipsis-vertical" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>
      <TopMenu
        visible={topMenuOpen}
        onClose={() => setTopMenuOpen(false)}
        options={[
          ...(otherId ? [{ label: 'Chat info', icon: 'information-circle-outline' as const, onPress: () => router.push({ pathname: '/chat-info/[id]', params: { id: String(id), otherId: String(otherId) } } as any) }] : []),
          { label: 'Chat theme', icon: 'color-palette-outline', onPress: () => setThemeOpen(true) },
          { label: 'Clear history', icon: 'trash-outline', destructive: true, onPress: () => askClearHistory() },
        ]}
      />

      {pinItems.length > 0 && <PinnedBar items={pinItems} onJump={scrollToId} />}

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
        // Without this, the keyboard being up meant the first touch on a
        // message bubble was consumed just dismissing the keyboard instead
        // of reaching the swipe-to-reply gesture — so dragging a message
        // while the text box was focused silently did nothing.
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={
          <>
            {loadingMore ? <ActivityIndicator style={{ marginVertical: 10 }} color={colors.primary} /> : null}
            {/* The person's card stays at the very top of the chat and scrolls
                up with the messages (the one-tap starters are only for an
                empty chat). */}
            {!hasMore && !loading && messages.length > 0 && otherId ? (
              <NewChatIntro
                embedded
                me={session?.user?.id}
                otherId={String(otherId)}
                name={otherProfile?.display_name || (name as string) || 'Chat'}
                avatar={otherProfile?.avatar_url || (otherAvatar as string)}
                followers={otherProfile?.followers_count}
                username={otherProfile?.username}
                onSend={() => {}}
              />
            ) : null}
          </>
        }
        contentContainerStyle={{ paddingVertical: 8 }}
        renderItem={({ item, index }) => {
          const older = messages[index + 1];
          const newer = messages[index - 1];
          const groupedWithAbove = !!older && older.sender_id === item.sender_id && (new Date(item.created_at).getTime() - new Date(older.created_at).getTime()) <= 120000;
          const groupedWithBelow = !!newer && newer.sender_id === item.sender_id && (new Date(newer.created_at).getTime() - new Date(item.created_at).getTime()) <= 120000;
          if (item.gift_sent_id) {
            return <GiftCard message={item} isMine={item.sender_id === session?.user?.id} />;
          }
          if (item.call_id) {
            return <CallCard message={item} isMine={item.sender_id === session?.user?.id} onCallBack={startVoiceCall} />;
          }
          return (
            <MessageBubble
              message={item}
              viewOnceOpened={voOpened.has(String(item.id))}
              onOpenViewOnce={(m) => { setVoMsg(m); voMark(m.id); }}
              onForward={(m) => setForwardMsg(m)}
              onPressReply={() => jumpToReply(item)}
              onStickerPress={(m) => stickerMenu(m.sticker_url)}
              highlighted={highlightId === item.id}
              myBubbleColor={myBubbleColor}
              myBubbleGradient={bubbleLook.gradient}
              isMine={item.sender_id === session?.user?.id}
              currentUserId={session?.user?.id}
              isPinned={pinnedIds.has(item.id)}
              isRead={item.sender_id === session?.user?.id ? !!item.read_at && receiptsVisible : undefined}
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
              replyThumb={(() => { const o = item.reply_to_id ? messages.find((x) => x.id === item.reply_to_id) : null; return o && o.image_url && !o.view_once && !o.is_sticker && !o.is_voice && !o.video_url ? o.image_url : undefined; })()}
              replySticker={item.reply_to === STICKER_LABEL && item.reply_to_id ? messages.find((x) => x.id === item.reply_to_id)?.sticker_url : undefined}
            />
          );
        }}
      />
        {!loading && messages.length === 0 && (
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            <NewChatIntro
              me={session?.user?.id}
              otherId={otherId ? String(otherId) : null}
              name={otherProfile?.display_name || (name as string) || 'Chat'}
              avatar={otherProfile?.avatar_url || (otherAvatar as string)}
              followers={otherProfile?.followers_count}
              username={otherProfile?.username}
              onSend={(t) => send(t)}
            />
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
          {blockState ? (
            <View style={[styles.inputBar, { borderTopColor: colors.border, backgroundColor: colors.card, justifyContent: 'center', flexDirection: 'column', paddingVertical: 16 }]}>
              <Text style={{ color: colors.subtext, fontSize: 14, textAlign: 'center' }}>
                {blockState === 'mine' ? `You blocked ${otherProfile?.display_name || name || 'this person'}.` : "You can't reply to this conversation."}
              </Text>
              {blockState === 'mine' && (
                <TouchableOpacity onPress={unblockOther} style={{ marginTop: 10, paddingHorizontal: 20, paddingVertical: 9, borderRadius: 12, backgroundColor: colors.inputBg }}>
                  <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 15 }}>Unblock</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
          <>
          <ActionTray
            open={plusOpen}
            onClose={() => setPlusOpen(false)}
            actions={[
              { key: 'camera', icon: 'camera-outline', label: 'Camera', onPress: takePhoto },
              { key: 'media', icon: 'image-outline', label: 'Photo', onPress: pickImage },
              { key: 'file', icon: 'document-attach-outline', label: 'File', onPress: pickFile },
              { key: 'sticker', icon: 'happy-outline', label: 'Stickers', onPress: () => { if (!showStickerTray) Keyboard.dismiss(); setShowStickerTray(true); } },
              ...(otherId && giftAccess?.dm_on ? [{ key: 'gift', icon: 'gift-outline', label: 'Gift', onPress: () => { Keyboard.dismiss(); setGiftOpen(true); } }] : []),
            ]}
          />
          <GiftSheet visible={giftOpen} onClose={() => setGiftOpen(false)} toUserId={otherId ? String(otherId) : null} toName={otherProfile?.display_name || (name as string) || null} context="chat" conversationId={String(id)} />
          <View style={[styles.inputBar, { borderTopColor: colors.border, backgroundColor: colors.card, paddingBottom: 10 + (Platform.OS === 'ios' && !kbOpen ? insets.bottom : 0) }]}>
            <PlusButton open={plusOpen} onPress={() => setPlusOpen((v) => !v)} />
            <PasteTextInput
              ref={inputRef}
              onPasteImage={(u) => setImageUri(u)}
              style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text }]}
              placeholder="Message..."
              placeholderTextColor={colors.faint}
              showSoftInputOnFocus={!showStickerTray}
              multiline
              submitBehavior="newline"
              returnKeyType="default"
              value={text}
              onChangeText={(t) => {
                setText(t);
                sendTyping();
              }}
              multiline
            />
            {text.trim() || imageUri || videoUri ? (
              <TouchableOpacity onPress={() => send()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
      <ImageEditor visible={editorOpen} uri={imageUri} onCancel={() => setEditorOpen(false)} onDone={(u) => { setImageUri(u); setEditorOpen(false); }} />
      <ChatThemeSheet visible={themeOpen} onClose={() => setThemeOpen(false)} conversationId={String(id)} theme={chatTheme} onChange={changeTheme} verified={meVerified} onReset={async () => { await clearChatTheme(String(id)); setChatTheme(await loadChatTheme(String(id))); }} />
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
  topBarCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topBarAvatar: { width: 34, height: 34, borderRadius: 17 },
  onlineDot: { position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: '#22C55E', borderWidth: 2 },
  topBarTitle: { fontSize: 16, fontWeight: '700' },
  statusText: { fontSize: 11, marginTop: 1, minHeight: 14 },
  pinnedBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.lg, paddingVertical: 8, borderBottomWidth: 1 },
  pinnedBannerText: { flex: 1, fontSize: 13 },
  empty: { textAlign: 'center', marginTop: 30 },
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
