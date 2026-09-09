import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { useAuth } from './AuthContext';
import { useAppForeground } from './useAppForeground';

type InboxContextType = {
  version: number;
  refreshMembership: () => Promise<void>;
};

const Ctx = createContext<InboxContextType>({ version: 0, refreshMembership: async () => {} });

export function InboxProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [version, setVersion] = useState(0);
  const convIds = useRef<Set<string>>(new Set());
  const groupIds = useRef<Set<string>>(new Set());
  const channelRef = useRef<any>(null);
  const retryRef = useRef(0);
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
          if (convIds.current.has(payload.new.conversation_id) && active) setVersion((v) => v + 1);
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages' }, (payload: any) => {
          if (groupIds.current.has(payload.new.group_id) && active) setVersion((v) => v + 1);
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_participants', filter: `user_id=eq.${session.user.id}` }, () => {
          refreshMembership().then(() => active && setVersion((v) => v + 1));
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_members', filter: `user_id=eq.${session.user.id}` }, () => {
          refreshMembership().then(() => active && setVersion((v) => v + 1));
        })
        .on('broadcast', { event: 'ping' }, () => {
          console.log('[INBOX] ping received!');
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

  return <Ctx.Provider value={{ version, refreshMembership }}>{children}</Ctx.Provider>;
}

export function useInbox() {
  return useContext(Ctx);
}
