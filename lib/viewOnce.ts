import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

// "View once" pictures and videos. Which ones I already opened is kept in the
// view_once_opens table; the chat asks for the ones on screen and remembers the answer.
export function useViewOnce(messages: any[], me?: string) {
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const ids = (messages || [])
    .filter((m) => m && m.view_once && m.sender_id !== me && !String(m.id).startsWith('temp'))
    .map((m) => String(m.id));
  const key = ids.join(',');

  useEffect(() => {
    if (!me || !ids.length) return;
    let live = true;
    supabase
      .from('view_once_opens')
      .select('message_id')
      .eq('user_id', me)
      .in('message_id', ids.slice(0, 200))
      .then(({ data }) => {
        if (!live || !data?.length) return;
        setOpened((prev) => {
          const n = new Set(prev);
          data.forEach((r: any) => n.add(String(r.message_id)));
          return n;
        });
      });
    return () => {
      live = false;
    };
  }, [key, me]);

  // Marks it opened (on the phone at once, and in the database).
  const markOpened = useCallback(
    async (id: string) => {
      setOpened((prev) => new Set(prev).add(String(id)));
      if (!me) return;
      const { error } = await supabase.from('view_once_opens').insert({ message_id: String(id), user_id: me });
      if (error && error.code !== '23505') console.warn('[viewOnce] could not save:', error.message);
    },
    [me]
  );

  return { opened, markOpened };
}
