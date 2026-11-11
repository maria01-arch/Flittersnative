import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from './AuthContext';
import { useInbox } from './InboxContext';
import { useAppForeground } from './useAppForeground';
import { AppState } from 'react-native';

// Powers the red dots on the Notifications and Messages tabs.
//  - Notifications: any row in `notifications` with read = false.
//  - Messages: a DM from someone else with no read_at yet, or a group message
//    from someone else newer than your last_read_at for that group.
// Counts are small "how many?" queries (no rows downloaded). They refresh
// when a notification arrives (realtime), when a new message arrives (the
// same signal the inbox already uses), when the app comes back to the
// foreground, and whenever a screen that clears them regains focus.
type UnreadCtx = { notifUnread: number; msgUnread: number; refreshNotifs: () => void; refreshMessages: () => void };
const Ctx = createContext<UnreadCtx>({ notifUnread: 0, msgUnread: 0, refreshNotifs: () => {}, refreshMessages: () => {} });

export function UnreadProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const { version } = useInbox();
  const me = session?.user?.id;
  const [notifUnread, setNotifUnread] = useState(0);
  const [msgUnread, setMsgUnread] = useState(0);
  const msgTimer = useRef<any>(null);

  const refreshNotifs = useCallback(async () => {
    if (!me) return setNotifUnread(0);
    const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', me).eq('read', false);
    setNotifUnread(count || 0);
  }, [me]);

  const computeMessages = useCallback(async () => {
    if (!me) return setMsgUnread(0);
    const [{ data: parts }, { data: groups }] = await Promise.all([
      supabase.from('conversation_participants').select('*').eq('user_id', me),
      supabase.from('group_members').select('*').eq('user_id', me),
    ]);
    // Archived chats and groups never count towards the dot.
    const convIds = (parts || []).filter((p: any) => !p.archived).map((p: any) => p.conversation_id);
    let total = 0;
    if (convIds.length) {
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .in('conversation_id', convIds)
        .neq('sender_id', me)
        .is('read_at', null);
      total += count || 0;
    }
    // Groups with no last_read_at yet are skipped, so a brand-new membership
    // doesn't leave a dot that can't be cleared until the chat is opened.
    const tracked = (groups || []).filter((g: any) => g.last_read_at && !g.archived);
    if (tracked.length) {
      const oldest = tracked.reduce((min: string, g: any) => (g.last_read_at < min ? g.last_read_at : min), tracked[0].last_read_at);
      const { data: recent } = await supabase
        .from('group_messages')
        .select('group_id,created_at')
        .in('group_id', tracked.map((g: any) => g.group_id))
        .neq('sender_id', me)
        .gt('created_at', oldest)
        .limit(200);
      const lastRead: Record<string, string> = {};
      tracked.forEach((g: any) => (lastRead[g.group_id] = g.last_read_at));
      total += (recent || []).filter((m: any) => m.created_at > lastRead[m.group_id]).length;
    }
    setMsgUnread(total);
  }, [me]);

  // Debounced, so a burst of incoming messages causes one recount.
  const refreshMessages = useCallback(() => {
    clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => computeMessages(), 350);
  }, [computeMessages]);

  useEffect(() => {
    refreshNotifs();
    computeMessages();
    if (!me) return;
    const channel = supabase
      .channel(`unread_notifs_${me}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${me}` }, () => refreshNotifs())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [me]);

  useEffect(() => {
    if (version > 0) refreshMessages();
  }, [version]);

  // "Last seen": stamp the profile while the app is open (every minute) and
  // the moment it goes to the background.
  useEffect(() => {
    if (!me) return;
    const stamp = () => supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', me).then(() => {});
    stamp();
    const timer = setInterval(() => AppState.currentState === 'active' && stamp(), 60000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') stamp();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [me]);

  useAppForeground(() => {
    refreshNotifs();
    refreshMessages();
  });

  return <Ctx.Provider value={{ notifUnread, msgUnread, refreshNotifs, refreshMessages }}>{children}</Ctx.Provider>;
}

export const useUnread = () => useContext(Ctx);
