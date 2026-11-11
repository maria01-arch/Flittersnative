import { useEffect, useState } from 'react';
import { acquireTyping } from './typingHub';

// For the chat list: who is typing right now, per chat. Returns text such as
// "typing…" (DM) or "Ada is typing…" (group), keyed like the list rows
// ("dm_<id>" / "group_<id>"). A person counts as typing for 4 seconds after
// their last signal. Only the first 30 groups are watched (keeps connections low).
type Users = Record<string, { name: string; t: number }>;

export function useChatListTyping(myId: string | undefined, groupIds: string[]): Record<string, string> {
  const [typing, setTyping] = useState<Record<string, Users>>({});
  // Sorted, so the chat list reordering (a new message moves a group to the
  // top) does not close and re-open every typing channel.
  const groupKey = [...groupIds].sort().slice(0, 30).join(',');

  useEffect(() => {
    if (!myId) return;
    const releases: (() => void)[] = [];
    const bump = (chatKey: string, p: any) => {
      if (!p?.user_id || p.user_id === myId) return;
      setTyping((prev) => ({ ...prev, [chatKey]: { ...(prev[chatKey] || {}), [p.user_id]: { name: String(p.name || 'Someone'), t: Date.now() } } }));
    };
    releases.push(acquireTyping(`typing_to:${myId}`, (p) => p?.conversation_id && bump(`dm_${p.conversation_id}`, p)));
    groupKey
      .split(',')
      .filter(Boolean)
      .forEach((gid) => releases.push(acquireTyping(`typing:gc:${gid}`, (p) => bump(`group_${gid}`, p))));
    return () => releases.forEach((r) => r());
  }, [myId, groupKey]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setTyping((prev) => {
        let changed = false;
        const next: Record<string, Users> = {};
        Object.entries(prev).forEach(([k, users]) => {
          const alive: Users = {};
          Object.entries(users).forEach(([u, v]) => {
            if (now - v.t < 4000) alive[u] = v;
            else changed = true;
          });
          if (Object.keys(alive).length) next[k] = alive;
        });
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const out: Record<string, string> = {};
  Object.entries(typing).forEach(([k, users]) => {
    const names = Object.values(users).map((u) => u.name.split(' ')[0]);
    if (!names.length) return;
    out[k] = k.startsWith('dm_') ? 'typing…' : names.length === 1 ? `${names[0]} is typing…` : `${names.slice(0, 2).join(', ')} are typing…`;
  });
  return out;
}
