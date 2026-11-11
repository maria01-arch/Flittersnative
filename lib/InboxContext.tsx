import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from './AuthContext';
import { useAppForeground } from './useAppForeground';

// The newest message the inbox heard about (so the chat list can update
// its row instantly instead of re-downloading everything).
export type InboxEvent = { kind: 'dm' | 'group'; id: string; msg: any } | null;

type InboxContextType = {
  version: number;
  lastEvent: InboxEvent;
  refreshMembership: () => Promise<void>;
  // Every message event is handed to each listener (none get lost when
  // several arrive in the same moment).
  // Tell this phone's own chat list about a message I just sent.
  pushEvent: (e: NonNullable<InboxEvent>) => void;
  subscribeEvents: (fn: (e: NonNullable<InboxEvent>) => void) => () => void;
};

const Ctx = createContext<InboxContextType>({ version: 0, lastEvent: null, refreshMembership: async () => {}, subscribeEvents: () => () => {}, pushEvent: () => {} });

export function InboxProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [version, setVersion] = useState(0);
  const [lastEvent, setLastEvent] = useState<InboxEvent>(null);
  const convIds = useRef<Set<string>>(new Set());
  const groupIds = useRef<Set<string>>(new Set());
  const channelRef = useRef<any>(null);
  const retryRef = useRef(0);
  const listeners = useRef<Set<(e: NonNullable<InboxEvent>) => void>>(new Set());
  const emit = (e: NonNullable<InboxEvent>) => {
    setLastEvent(e);
    listeners.current.forEach((fn) => {
      try { fn(e); } catch {}
    });
  };
  const subscribeEvents = useCallback((fn: (e: NonNullable<InboxEvent>) => void) => {
    listeners.current.add(fn);
    return () => { listeners.current.delete(fn); };
  }, []);
  const connectRef = useRef<() => void>(() => {});

  const refreshMembership = async () => {
    if (!session?.user?.id) return;
    const [{ data: parts }, { data: groups }] = await Promise.all([
      supabase.from('conversation_participants').select('conversation_id').eq('user_id', session.user.id),
      supabase.from('group_members').select('group_id').eq('user_id', session.user.id),
    ]);
    convIds.current = new Set((parts || []).map((p: any) => p.conversation_id));
    groupIds.current = new Set((groups || []).map((g: any) => g.group_id));
  };

  useEffect(() => {
    if (!session?.user?.id) return;
    let active = true;

    let connecting = false;
    const connect = async () => {
      if (!active || connecting) return;
      connecting = true;
      if (channelRef.current) {
        await supabase.removeChannel(channelRef.current);
      }
      if (!active) return;
      const channel = supabase
        .channel(`inbox_${session.user.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload: any) => {
          if (convIds.current.has(payload.new.conversation_id) && active) {
            emit({ kind: 'dm', id: payload.new.conversation_id, msg: payload.new });
            setVersion((v) => v + 1);
          }
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages' }, (payload: any) => {
          if (groupIds.current.has(payload.new.group_id) && active) {
            emit({ kind: 'group', id: payload.new.group_id, msg: payload.new });
            setVersion((v) => v + 1);
          }
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_participants', filter: `user_id=eq.${session.user.id}` }, () => {
          refreshMembership().then(() => active && setVersion((v) => v + 1));
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_members', filter: `user_id=eq.${session.user.id}` }, () => {
          refreshMembership().then(() => active && setVersion((v) => v + 1));
        })
        .on('broadcast', { event: 'ping' }, (p: any) => {
          const d = p?.payload;
          if (active && (d?.kind === 'dm' || d?.kind === 'group') && d?.msg?.id && d?.id) emit({ kind: d.kind, id: d.id, msg: d.msg });
          if (active) setVersion((v) => v + 1);
        })
        .subscribe((status: string) => {
          console.log('[INBOX] channel status:', status);
          connecting = false;
          if (status === 'SUBSCRIBED') {
            retryRef.current = 0;
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            const delay = Math.min(1000 * 2 ** retryRef.current, 15000);
            retryRef.current += 1;
            setTimeout(connect, delay);
          }
        });
      channelRef.current = channel;
    };

    connectRef.current = connect;
    refreshMembership().then(connect);

    return () => {
      active = false;
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [session?.user?.id]);

  useAppForeground(() => {
    console.log('[INBOX] app foregrounded — refreshing');
    refreshMembership().then(() => setVersion((v) => v + 1));
  });

  return <Ctx.Provider value={{ version, lastEvent, refreshMembership, subscribeEvents, pushEvent: emit }}>{children}</Ctx.Provider>;
}

export function useInbox() {
  return useContext(Ctx);
}
