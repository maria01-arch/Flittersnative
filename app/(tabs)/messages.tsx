import { SITE_URL } from '@/lib/siteConfig';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, FlatList, StyleSheet, ActivityIndicator, Modal, Pressable, Alert, TextInput } from 'react-native';
import TouchableOpacity from '@/components/PressScale';
import Text from '@/components/AppText';
import { Swipeable } from 'react-native-gesture-handler';
import { isAfterCleared } from '@/lib/clearHistory';
import { router, useFocusEffect } from 'expo-router';
import { fetchStreaks } from '@/lib/streaks';
import StreakFlame from '@/components/StreakFlame';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import { useOnlinePresence } from '@/lib/usePresence';
import { useOnline } from '@/lib/useOnline';
import { warmChatThemes } from '@/lib/chatTheme';
import { useInbox } from '@/lib/InboxContext';
import { useUnread } from '@/lib/UnreadContext';
import { useAppForeground } from '@/lib/useAppForeground';
import { spacing } from '@/lib/theme';
import Avatar from '@/components/Avatar';
import RingAvatar from '@/components/RingAvatar';
import NotesRow from '@/components/NotesRow';
import ActionSheet, { ActionSheetOption } from '@/components/ActionSheet';
import { parseGroupTag } from '@/lib/groupInvite';
import ReportModal from '@/components/ReportModal';
import { ListSkeleton } from '@/components/Skeleton';
import { useChatListTyping } from '@/lib/useChatListTyping';
import { parseMomentReply, momentPreview } from '@/lib/momentReply';

function previewText(msg: any, me?: string): string | null {
  if (!msg) return null;
  if (parseMomentReply(msg.reply_to)) return momentPreview(!!me && msg.sender_id === me, msg.content);
  if (msg.is_voice) return '🎤 Voice message';
  if (msg.is_sticker) return '🖼️ Sticker';
  if (msg.video_url) return msg.content ? `🎥 ${msg.content}` : '🎥 Video';
  if (msg.image_url) return msg.content ? `📷 ${msg.content}` : '📷 Photo';
  return msg.content || null;
}

export default function ChatsScreen() {
  const { session } = useAuth();
  const { colors } = useTheme();
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinText, setJoinText] = useState('');
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const online = useOnline();
  const [menuOpen, setMenuOpen] = useState(false);
  const onlineIds = useOnlinePresence(session?.user?.id);
  const { version, subscribeEvents } = useInbox();
  const { refreshMessages } = useUnread();
  const swipeRefs = useRef<Record<string, Swipeable | null>>({});
  const myUsernameRef = useRef<string | null>(null);

  // ---------- loading the list (fast, and never two loads at once) ----------
  const MSG_COLS = 'conversation_id,sender_id,reply_to,content,is_voice,is_sticker,video_url,image_url,created_at';
  const G_COLS = 'group_id,sender_id,reply_to,content,is_voice,is_sticker,video_url,image_url,created_at';
  const focusedRef = useRef(false);
  const dirtyRef = useRef(false);
  const runningRef = useRef(false);
  const pendingRef = useRef<null | { fresh: boolean }>(null);
  const chatsRef = useRef<any[]>([]);
  chatsRef.current = chats;
  // Remembered between loads, so a refresh only asks for what is new.
  const lastDm = useRef<Record<string, any>>({});
  const lastGroup = useRef<Record<string, any>>({});
  const nameCache = useRef<Record<string, string>>({});
  const rxCache = useRef<{ at: number; dm: any[]; g: any[]; names: Record<string, string> }>({ at: 0, dm: [], g: [], names: {} });
  const seenEvents = useRef<Set<string>>(new Set());
  const reconcileTimer = useRef<any>(null);

  const doLoad = useCallback(
    async (withReactions: boolean) => {
      const myId = session?.user?.id;
      if (!myId) return;

      const [{ data: myParts, error: partsErr }, { data: myGroups, error: groupsErr }] = await Promise.all([
        supabase.from('conversation_participants').select('*').eq('user_id', myId),
        supabase.from('group_members').select('*').eq('user_id', myId),
      ]);
      // A weak connection answers with an error, not an empty list. Treating that as
      // "no chats" wiped the list (and the saved copy), so stop here and keep what is shown.
      if (partsErr || groupsErr) throw new Error('chat list unavailable: ' + (partsErr?.message || groupsErr?.message));
      const convIds = (myParts || []).map((p: any) => p.conversation_id);
      const groupIds = (myGroups || []).map((g: any) => g.group_id);

      // ---- direct messages ----
      const buildDm = async () => {
        if (!convIds.length) return [] as any[];
        const archivedConv = new Set((myParts || []).filter((p: any) => p.archived).map((p: any) => p.conversation_id));
        const clearedDm: Record<string, string> = {};
        (myParts || []).forEach((p: any) => { if (p.cleared_at) clearedDm[p.conversation_id] = p.cleared_at; });
        const [unreadRes, partsRes, msgsRes] = await Promise.all([
          supabase.from('messages').select('conversation_id').in('conversation_id', convIds).neq('sender_id', myId).is('read_at', null).limit(1000),
          supabase.from('conversation_participants').select('conversation_id,user_id').in('conversation_id', convIds).neq('user_id', myId),
          supabase.from('messages').select(MSG_COLS).in('conversation_id', convIds).order('created_at', { ascending: false }).limit(200),
        ]);
        if ((partsRes as any).error || (msgsRes as any).error) throw new Error('chat list unavailable');
        const unreadByConv: Record<string, number> = {};
        ((unreadRes as any).data || []).forEach((m: any) => (unreadByConv[m.conversation_id] = (unreadByConv[m.conversation_id] || 0) + 1));
        const otherParts = (partsRes as any).data || [];
        const seen = new Set<string>();
        ((msgsRes as any).data || []).forEach((m: any) => {
          if (!seen.has(m.conversation_id)) {
            seen.add(m.conversation_id);
            lastDm.current[m.conversation_id] = m;
          }
        });
        // Chats quiet for a long time are not in the newest-200 batch: fetch
        // their last message once, then remember it.
        const missing = convIds.filter((cid: string) => !lastDm.current[cid]).slice(0, 40);
        const otherIds = [...new Set(otherParts.map((p: any) => p.user_id))] as string[];
        const [profRes, rows] = await Promise.all([
          otherIds.length ? supabase.from('profiles').select('id,display_name,avatar_url').in('id', otherIds) : Promise.resolve({ data: [] as any[] }),
          Promise.all(missing.map((cid: string) => supabase.from('messages').select(MSG_COLS).eq('conversation_id', cid).order('created_at', { ascending: false }).limit(1))),
        ]);
        rows.forEach((r: any) => {
          const m = r.data?.[0];
          if (m) lastDm.current[m.conversation_id] = m;
        });
        if ((profRes as any).error) throw new Error('chat list unavailable');
        const profMap: Record<string, any> = {};
        ((profRes as any).data || []).forEach((p: any) => (profMap[p.id] = p));
        return otherParts.map((p: any) => ({
          kind: 'dm',
          id: p.conversation_id,
          title: profMap[p.user_id]?.display_name || 'Unknown',
          avatar: profMap[p.user_id]?.avatar_url,
          otherId: p.user_id,
          lastText: isAfterCleared(lastDm.current[p.conversation_id]?.created_at, clearedDm[p.conversation_id]) ? previewText(lastDm.current[p.conversation_id], myId) : '',
          lastAt: lastDm.current[p.conversation_id]?.created_at,
          archived: archivedConv.has(p.conversation_id),
          unread: unreadByConv[p.conversation_id] || 0,
        }));
      };

      // ---- groups ----
      const buildGroups = async () => {
        if (!groupIds.length) return [] as any[];
        const archivedGroups = new Set((myGroups || []).filter((g: any) => g.archived).map((g: any) => g.group_id));
        const clearedGroups: Record<string, string> = {};
        (myGroups || []).forEach((g: any) => { if (g.cleared_at) clearedGroups[g.group_id] = g.cleared_at; });
        const groupReadAt: Record<string, string> = {};
        (myGroups || []).forEach((g: any) => {
          if (g.last_read_at) groupReadAt[g.group_id] = g.last_read_at;
        });
        const tracked = Object.keys(groupReadAt);
        const oldest = tracked.length ? tracked.reduce((min, gid) => (groupReadAt[gid] < min ? groupReadAt[gid] : min), groupReadAt[tracked[0]]) : '';
        const [ugRes, groupsRes, gmsgsRes] = await Promise.all([
          tracked.length
            ? supabase.from('group_messages').select('group_id,created_at').in('group_id', tracked).neq('sender_id', myId).gt('created_at', oldest).limit(500)
            : Promise.resolve({ data: [] as any[] }),
          supabase.from('groups').select('id,name,avatar_url,cover_color').in('id', groupIds),
          supabase.from('group_messages').select(G_COLS).in('group_id', groupIds).order('created_at', { ascending: false }).limit(200),
        ]);
        if ((groupsRes as any).error || (gmsgsRes as any).error) throw new Error('chat list unavailable');
        const unreadByGroup: Record<string, number> = {};
        ((ugRes as any).data || []).forEach((m: any) => {
          if (m.created_at > groupReadAt[m.group_id]) unreadByGroup[m.group_id] = (unreadByGroup[m.group_id] || 0) + 1;
        });
        const seen = new Set<string>();
        ((gmsgsRes as any).data || []).forEach((m: any) => {
          if (!seen.has(m.group_id)) {
            seen.add(m.group_id);
            lastGroup.current[m.group_id] = m;
          }
        });

        // Groups where someone tagged ME (@my-username) or everyone (@all) in a message I haven't read.
        const findMentions = async () => {
          const found = new Set<string>();
          const unreadIds = Object.keys(unreadByGroup);
          if (!unreadIds.length) return found;
          if (!myUsernameRef.current) {
            const { data: me } = await supabase.from('profiles').select('username').eq('id', myId).maybeSingle();
            myUsernameRef.current = (me?.username || '').replace(/[^A-Za-z0-9_]/g, '');
          }
          const uname = myUsernameRef.current;
          const oldestUnread = unreadIds.reduce((min, gid) => (groupReadAt[gid] < min ? groupReadAt[gid] : min), groupReadAt[unreadIds[0]]);
          const { data: mm } = await supabase
            .from('group_messages')
            .select('group_id,created_at,content')
            .in('group_id', unreadIds)
            .neq('sender_id', myId)
            .gt('created_at', oldestUnread)
            .or(uname ? `content.ilike.%@all%,content.ilike.%@${uname}%` : 'content.ilike.%@all%')
            .limit(200);
          const rx = new RegExp(`(^|\\s)@(all${uname ? '|' + uname : ''})(?![A-Za-z0-9_])`, 'i');
          (mm || []).forEach((m: any) => {
            if (m.created_at > groupReadAt[m.group_id] && rx.test(m.content || '')) found.add(m.group_id);
          });
          // Someone replied to one of MY messages in the group: also shows the red @.
          try {
            const { data: rr } = await supabase
              .from('group_messages')
              .select('group_id,created_at,reply_to_id')
              .in('group_id', unreadIds)
              .neq('sender_id', myId)
              .gt('created_at', oldestUnread)
              .not('reply_to_id', 'is', null)
              .limit(200);
            const ids = [...new Set((rr || []).map((r: any) => r.reply_to_id))];
            if (ids.length) {
              const { data: mine } = await supabase.from('group_messages').select('id').in('id', ids).eq('sender_id', myId);
              const mineIds = new Set((mine || []).map((x: any) => x.id));
              (rr || []).forEach((r: any) => {
                if (r.created_at > groupReadAt[r.group_id] && mineIds.has(r.reply_to_id)) found.add(r.group_id);
              });
            }
          } catch {}
          return found;
        };
        // Last message of quiet groups + the first names of whoever spoke last.
        const findLast = async () => {
          const missing = groupIds.filter((gid: string) => !lastGroup.current[gid]).slice(0, 40);
          if (missing.length) {
            const rows = await Promise.all(missing.map((gid: string) => supabase.from('group_messages').select(G_COLS).eq('group_id', gid).order('created_at', { ascending: false }).limit(1)));
            rows.forEach((r: any) => {
              const m = r.data?.[0];
              if (m) lastGroup.current[m.group_id] = m;
            });
          }
          const need = [...new Set(Object.values(lastGroup.current).map((m: any) => m.sender_id).filter((u: any) => u && !nameCache.current[u]))] as string[];
          if (need.length) {
            const { data: senders } = await supabase.from('profiles').select('id,display_name').in('id', need);
            (senders || []).forEach((p: any) => (nameCache.current[p.id] = p.display_name || ''));
          }
        };
        const [mentionedGroups] = await Promise.all([findMentions(), findLast()]);

        const groupPreview = (m: any) => (m ? `${m.sender_id === myId ? 'You' : (nameCache.current[m.sender_id] || 'Someone').split(' ')[0]}: ${previewText(m, myId)}` : previewText(m, myId));
        return ((groupsRes as any).data || []).map((g: any) => ({
          kind: 'group',
          id: g.id,
          title: g.name,
          avatar: g.avatar_url,
          coverColor: g.cover_color,
          lastText: isAfterCleared(lastGroup.current[g.id]?.created_at, clearedGroups[g.id]) ? groupPreview(lastGroup.current[g.id]) : '',
          lastAt: lastGroup.current[g.id]?.created_at,
          archived: archivedGroups.has(g.id),
          unread: unreadByGroup[g.id] || 0,
          mentioned: mentionedGroups.has(g.id),
        }));
      };

      const [dmChats, groupChats] = await Promise.all([buildDm(), buildGroups()]);

      // Reactions count as the last activity: "Ada reacted ❤️ to "see you"" or
      // "You reacted 😂 to ...". Needs a created_at column on the two reaction
      // tables; if it is missing these queries return nothing and the list
      // behaves as before. They are re-downloaded at most once a minute (or
      // when you come back to this tab), not on every incoming message.
      try {
        if (withReactions || Date.now() - rxCache.current.at > 60000) {
          const [dmRx, gRx] = await Promise.all([
            convIds.length
              ? supabase
                  .from('message_reactions')
                  .select('emoji,user_id,created_at,messages!inner(conversation_id,content,image_url,video_url,is_sticker,is_voice)')
                  .in('messages.conversation_id', convIds)
                  .order('created_at', { ascending: false })
                  .limit(60)
              : Promise.resolve({ data: [] as any[] }),
            groupIds.length
              ? supabase
                  .from('group_message_reactions')
                  .select('emoji,user_id,created_at,group_messages!inner(group_id,content,image_url,video_url,is_sticker,is_voice)')
                  .in('group_messages.group_id', groupIds)
                  .order('created_at', { ascending: false })
                  .limit(60)
              : Promise.resolve({ data: [] as any[] }),
          ]);
          const dm = (dmRx as any).data || [];
          const g = (gRx as any).data || [];
          const names: Record<string, string> = {};
          const rxUsers = [...new Set([...dm, ...g].map((r: any) => r.user_id).filter((u: string) => u && u !== myId))] as string[];
          if (rxUsers.length) {
            const { data: ps } = await supabase.from('profiles').select('id,display_name').in('id', rxUsers);
            (ps || []).forEach((p: any) => (names[p.id] = (p.display_name || 'Someone').split(' ')[0]));
          }
          rxCache.current = { at: Date.now(), dm, g, names };
        }
        const { dm, g, names: rxNames } = rxCache.current;
        const snippet = (m: any) => {
          const t = previewText(m);
          const clean = String(t || '').replace(/\s+/g, ' ');
          return clean.length > 28 ? clean.slice(0, 28) + '…' : clean;
        };
        const seen = new Set<string>();
        const apply = (chat: any, r: any, msg: any) => {
          if (!chat || seen.has(`${chat.kind}_${chat.id}`) || !r.created_at) return;
          seen.add(`${chat.kind}_${chat.id}`);
          if (chat.lastAt && new Date(r.created_at).getTime() <= new Date(chat.lastAt).getTime()) return;
          const who = r.user_id === myId ? 'You' : rxNames[r.user_id] || 'Someone';
          chat.lastText = `${who} reacted ${r.emoji} to "${snippet(msg)}"`;
          chat.lastAt = r.created_at;
        };
        const dmById: Record<string, any> = {};
        dmChats.forEach((c: any) => (dmById[c.id] = c));
        dm.forEach((r: any) => apply(dmById[r.messages?.conversation_id], r, r.messages));
        seen.clear();
        const gById: Record<string, any> = {};
        groupChats.forEach((c: any) => (gById[c.id] = c));
        g.forEach((r: any) => apply(gById[r.group_messages?.group_id], r, r.group_messages));
      } catch (err) {
        console.warn('[Chats] reaction activity skipped:', err);
      }

      const all = [...dmChats, ...groupChats].sort((a: any, b: any) => new Date(b.lastAt || 0).getTime() - new Date(a.lastAt || 0).getTime());
      setChats(all);
      setLoadFailed(false);
      setLoading(false);
      AsyncStorage.setItem(`chats_cache_${myId}`, JSON.stringify(all.slice(0, 60))).catch(() => {});
    },
    [session]
  );

  // One load at a time. If something asks for a load while one is running,
  // exactly one more runs right after — so an older answer can never land
  // on top of a newer one, and bursts don't pile up.
  const load = useCallback(
    async (withReactions: boolean = true) => {
      if (runningRef.current) {
        pendingRef.current = { fresh: !!(pendingRef.current?.fresh || withReactions) };
        return;
      }
      runningRef.current = true;
      try {
        await doLoad(withReactions);
      } catch (err) {
        console.warn('[Chats] load failed:', err);
        // Only say "couldn't load" when there is nothing to show; otherwise keep the list as it is.
        if (!chatsRef.current.length) setLoadFailed(true);
        setLoading(false);
      } finally {
        runningRef.current = false;
        const p = pendingRef.current;
        pendingRef.current = null;
        if (p) load(p.fresh);
      }
    },
    [doLoad]
  );

  // Load the saved chat themes into memory so a chat opens in its own colours at once.
  useEffect(() => {
    warmChatThemes();
  }, []);

  // The connection came back: try the list again by itself.
  useEffect(() => {
    if (online && loadFailed) load(true);
  }, [online, loadFailed]);

  // Show the last known list the instant the tab opens (before the network answers).
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    AsyncStorage.getItem(`chats_cache_${uid}`)
      .then((raw) => {
        if (!raw || chatsRef.current.length) return;
        try {
          const saved = JSON.parse(raw);
          if (Array.isArray(saved) && saved.length) {
            setChats(saved);
            setLoading(false);
          }
        } catch {}
      })
      .catch(() => {});
  }, [session?.user?.id]);

  // Streak flames next to chats (refreshed each time this tab comes into view).
  const [streaks, setStreaks] = useState<Record<string, { streak: number; at_risk: boolean }>>({});
  useFocusEffect(
    useCallback(() => {
      fetchStreaks().then((rows) => {
        const m: Record<string, { streak: number; at_risk: boolean }> = {};
        rows.forEach((r) => { if (r.streak >= 2) m[r.conversation_id] = { streak: r.streak, at_risk: r.at_risk && !r.me_today }; });
        setStreaks(m);
      });
    }, [])
  );

  // Coming back from reading a chat: recount, so the dot clears.
  useFocusEffect(
    useCallback(() => {
      refreshMessages();
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      dirtyRef.current = false;
      load(true);
      // Live updates arrive through the inbox realtime channel and patch the
      // list instantly (below). This timer is only a safety net in case that
      // connection drops.
      const interval = setInterval(() => load(false), 40000);
      return () => {
        focusedRef.current = false;
        clearInterval(interval);
      };
    }, [load])
  );

  // A message arrived: update that chat's row straight away (text, time,
  // unread count, move to the top) — no waiting for the database round trips.
  const handleEventRef = useRef<(lastEvent: any) => void>(() => {});
  handleEventRef.current = (lastEvent: any) => {
    if (!lastEvent || !lastEvent.msg) return;
    // "I'm reading this chat": clear its unread mark right now.
    if (lastEvent.msg.__read) {
      setChats((prev) => (prev.some((c) => c.kind === lastEvent.kind && c.id === lastEvent.id && (c.unread || c.mentioned)) ? prev.map((c) => (c.kind === lastEvent.kind && c.id === lastEvent.id ? { ...c, unread: 0, mentioned: false } : c)) : prev));
      return;
    }
    const myId = session?.user?.id;
    const m = lastEvent.msg;
    const key = `${lastEvent.kind}:${m.id}`;
    if (seenEvents.current.has(key)) return;
    seenEvents.current.add(key);
    if (seenEvents.current.size > 300) seenEvents.current = new Set([key]);
    const exists = chatsRef.current.some((c) => c.kind === lastEvent.kind && c.id === lastEvent.id);
    if (!exists) {
      // A chat this list has never seen: do a real load.
      if (focusedRef.current) load(false);
      else dirtyRef.current = true;
      return;
    }
    if (lastEvent.kind === 'dm') lastDm.current[lastEvent.id] = m;
    else lastGroup.current[lastEvent.id] = m;
    const mine = m.sender_id === myId;
    const prefix = lastEvent.kind === 'group' ? (mine ? 'You: ' : nameCache.current[m.sender_id] ? `${nameCache.current[m.sender_id].split(' ')[0]}: ` : '') : '';
    const text = previewText(m, myId);
    setChats((prev) => {
      const next = prev.map((c) =>
        c.kind === lastEvent.kind && c.id === lastEvent.id
          ? { ...c, lastText: text ? prefix + text : c.lastText, lastAt: m.created_at || c.lastAt, unread: mine ? 0 : focusedRef.current ? (c.unread || 0) + 1 : c.unread }
          : c
      );
      return next.sort((a: any, b: any) => new Date(b.lastAt || 0).getTime() - new Date(a.lastAt || 0).getTime());
    });
  };
  useEffect(() => subscribeEvents((e) => handleEventRef.current(e)), [subscribeEvents]);

  // After the instant patch, one quiet real reload settles the exact numbers.
  useEffect(() => {
    if (version === 0) return;
    if (!focusedRef.current) {
      dirtyRef.current = true;
      return;
    }
    clearTimeout(reconcileTimer.current);
    reconcileTimer.current = setTimeout(() => load(false), 2500);
    return () => clearTimeout(reconcileTimer.current);
  }, [version]);

  useAppForeground(() => {
    if (focusedRef.current) load(true);
    else dirtyRef.current = true;
  });

  // "typing…" shown in place of the last message, for DMs and groups.
  const typingText = useChatListTyping(session?.user?.id, chats.filter((c) => c.kind === 'group').map((c) => c.id));

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
    const { data: removed, error } =
      item.kind === 'dm'
        ? await supabase.from('conversation_participants').delete().eq('conversation_id', item.id).eq('user_id', session.user.id).select('user_id')
        : await supabase.from('group_members').delete().eq('group_id', item.id).eq('user_id', session.user.id).select('user_id');
    if (error || !removed?.length) {
      console.warn('[Chats] delete failed:', error?.message, removed);
      Alert.alert("Couldn't delete", error?.message || "The database didn't allow it. See the SQL fix in the chat.");
      return;
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

  // ---- Archive: hides the chat from the main list AND stops its push
  // notifications (the push function skips archived chats) and its unread dot.
  const [showArchived, setShowArchived] = useState(false);
  const [dotsOpen, setDotsOpen] = useState(false);
  const archivedCount = chats.filter((c) => c.archived).length;
  const visibleChats = chats.filter((c) => !!c.archived === showArchived);

  const setArchived = async (item: any, archived: boolean) => {
    if (!session?.user?.id) return;
    setChats((prev) => prev.map((c) => (c.id === item.id && c.kind === item.kind ? { ...c, archived } : c)));
    const { error } =
      item.kind === 'dm'
        ? await supabase.from('conversation_participants').update({ archived }).eq('conversation_id', item.id).eq('user_id', session.user.id)
        : await supabase.from('group_members').update({ archived }).eq('group_id', item.id).eq('user_id', session.user.id);
    if (error) {
      console.warn('[Chats] archive failed:', error.message);
      setChats((prev) => prev.map((c) => (c.id === item.id && c.kind === item.kind ? { ...c, archived: !archived } : c)));
      Alert.alert("Couldn't update", 'Please try again.');
    }
    refreshMessages();
  };

  // ---- Mark everything read: every unread DM, and every group's read marker.
  const markAllRead = async () => {
    const me = session?.user?.id;
    if (!me) return;
    const now = new Date().toISOString();
    const dmIds = chats.filter((c) => c.kind === 'dm').map((c) => c.id);
    if (dmIds.length) await supabase.from('messages').update({ read_at: now }).in('conversation_id', dmIds).neq('sender_id', me).is('read_at', null);
    await supabase.from('group_members').update({ last_read_at: now }).eq('user_id', me);
    refreshMessages();
  };

  const setSwipeRef = useCallback((key: string, ref: Swipeable | null) => {
    swipeRefs.current[key] = ref;
  }, []);
  const openChatRef = useRef<(item: any) => void>(() => {});
  const openMenuRef = useRef<(item: any) => void>(() => {});
  openChatRef.current = (item: any) => openChat(item);
  openMenuRef.current = (item: any) => openChatMenu(item);
  const openChatMenu = (item: any) => {
    swipeRefs.current[`${item.kind}_${item.id}`]?.close();
    // The row springs back at once (that animation runs natively), and the
    // menu pops up on the very next frame.
    requestAnimationFrame(() => setChatMenuItem(item));
  };

  const chatMenuOptions: ActionSheetOption[] = chatMenuItem
    ? [
        { label: chatMenuItem.archived ? 'Unarchive' : 'Archive', icon: 'archive-outline' as const, onPress: () => setArchived(chatMenuItem, !chatMenuItem.archived) },
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity style={[styles.newBtn, { backgroundColor: colors.primary }]} onPress={() => setMenuOpen(true)}>
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.newBtn, { backgroundColor: colors.card }]} onPress={() => setDotsOpen(true)}>
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>
      {showArchived && (
        <Text style={{ color: colors.subtext, fontSize: 13, paddingHorizontal: 16, paddingVertical: 8 }}>Archived chats — they don't send notifications. Long-press or swipe a chat to unarchive it.</Text>
      )}
      <FlatList
        data={visibleChats}
        keyExtractor={(item) => `${item.kind}_${item.id}`}
        contentContainerStyle={{ paddingBottom: 110 }}
        renderItem={({ item }) => {
          const key = `${item.kind}_${item.id}`;
          return (
            <ChatRow
              item={item}
              online={item.kind === 'dm' && onlineIds.has(item.otherId)}
              typing={typingText[key] || ''}
              streak={item.kind === 'dm' ? streaks[item.id] : undefined}
              colors={colors}
              onOpen={openChatRef}
              onMenu={openMenuRef}
              setSwipeRef={setSwipeRef}
            />
          );
        }}
        ListHeaderComponent={<NotesRow />}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={7}
        ListEmptyComponent={
          loadFailed ? (
            <View style={{ alignItems: 'center', paddingHorizontal: 30 }}>
              <Text style={[styles.empty, { color: colors.subtext, marginBottom: 12 }]}>Couldn't load your chats. Check your connection.</Text>
              <TouchableOpacity onPress={() => { setLoadFailed(false); setLoading(true); load(true); }} style={{ paddingHorizontal: 22, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.primary }}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={[styles.empty, { color: colors.subtext }]}>No chats yet. Tap + to start one.</Text>
          )
        }
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
                setJoinText('');
                setJoinOpen(true);
              }}
            >
              <Ionicons name="link-outline" size={20} color={colors.text} />
              <Text style={[styles.sheetText, { color: colors.text }]}>Join a group</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetRow}
              onPress={() => {
                setMenuOpen(false);
                router.push('/flitters-ai');
              }}
            >
              <Ionicons name="sparkles-outline" size={20} color={colors.text} />
              <Text style={[styles.sheetText, { color: colors.text }]}>Flitters AI</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={joinOpen} transparent animationType="fade" onRequestClose={() => setJoinOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setJoinOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.card }]} onPress={() => {}}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 4 }}>Join a group</Text>
            <Text style={{ color: colors.subtext, fontSize: 13, marginBottom: 12 }}>Paste an invite link or type the group's @tag.</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: colors.border, color: colors.text, backgroundColor: colors.inputBg, borderRadius: 12, padding: 12, fontSize: 15 }}
              value={joinText}
              onChangeText={setJoinText}
              placeholder={`${SITE_URL}/join/… or @tag`}
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
            <TouchableOpacity
              style={{ backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 14, opacity: joinText.trim() ? 1 : 0.4 }}
              disabled={!joinText.trim()}
              onPress={() => {
                const tag = parseGroupTag(joinText);
                setJoinOpen(false);
                if (tag) router.push({ pathname: '/join/[tag]', params: { tag } });
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '800' }}>Find group</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <ActionSheet
        visible={dotsOpen}
        onClose={() => setDotsOpen(false)}
        options={[
          { label: 'Mark all as read', icon: 'checkmark-done-outline', onPress: markAllRead },
          { label: showArchived ? 'Back to chats' : `Archived chats${archivedCount ? ` (${archivedCount})` : ''}`, icon: 'archive-outline', onPress: () => setShowArchived((v) => !v) },
          { label: 'Chat privacy settings', icon: 'lock-closed-outline', onPress: () => router.push({ pathname: '/settings', params: { section: 'privacy' } }) },
        ]}
      />
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
  atBadge: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  atBadgeText: { color: '#fff', fontSize: 12, fontWeight: '900', marginTop: -1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingVertical: 16, paddingBottom: 34 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 20 },
  sheetText: { fontSize: 16, fontWeight: '600' },
});


// One chat row. Memoised so a message arriving, someone typing or a presence
// change redraws only the rows that changed — not the whole list while you
// are dragging one to the side.
const ChatRow = memo(function ChatRow({ item, online, typing, streak, colors, onOpen, onMenu, setSwipeRef }: any) {
  const key = `${item.kind}_${item.id}`;
  return (
    <Swipeable
      ref={(ref) => setSwipeRef(key, ref)}
      renderLeftActions={() => (
        <TouchableOpacity style={styles.swipeAction} onPress={() => onMenu.current(item)}>
          <Ionicons name="trash" size={22} color="#fff" />
        </TouchableOpacity>
      )}
      overshootLeft={false}
      leftThreshold={70}
      friction={1.6}
      onSwipeableWillOpen={() => onMenu.current(item)}
    >
      <TouchableOpacity style={[styles.row, { backgroundColor: colors.bg }]} onPress={() => onOpen.current(item)}>
        <View>
          {item.kind === 'group' && !item.avatar ? (
            <View style={[styles.avatar, styles.groupAvatarFallback, { backgroundColor: item.coverColor || colors.primary }]}>
              <Text style={styles.groupAvatarLetter}>{item.title?.[0]?.toUpperCase() || 'G'}</Text>
            </View>
          ) : (
            item.kind === 'dm' && item.otherId ? <RingAvatar userId={item.otherId} uri={item.avatar} size={50} noTap /> : <Avatar uri={item.avatar} size={50} />
          )}
          {online && <View style={[styles.onlineDot, { borderColor: colors.bg }]} />}
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.chatTitle, { color: colors.text }, item.unread > 0 && { fontWeight: '900' }]}>{item.title}</Text>
            {item.kind === 'group' && <Ionicons name="people" size={13} color={colors.faint} />}
            {streak ? <StreakFlame days={streak.streak} atRisk={streak.at_risk} /> : null}
          </View>
          {typing ? (
            <Text style={[styles.lastMessage, { color: colors.primary, fontWeight: '700' }]} numberOfLines={1}>{typing}</Text>
          ) : (
            <Text style={[styles.lastMessage, { color: colors.subtext }, item.unread > 0 && { color: colors.text, fontWeight: '800' }]} numberOfLines={1}>{item.lastText || 'No messages yet'}</Text>
          )}
        </View>
        {item.mentioned && item.unread > 0 && (
          <View style={styles.atBadge}>
            <Text style={styles.atBadgeText}>@</Text>
          </View>
        )}
        {item.unread > 0 && <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: '#EF4444', marginLeft: 8 }} />}
      </TouchableOpacity>
    </Swipeable>
  );
});
