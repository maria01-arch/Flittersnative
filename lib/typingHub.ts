import { supabase } from './supabase';

// "Someone is typing" signals that reach people OUTSIDE the chat screen (the
// chat list). It uses its own small broadcast channels (names starting with
// "typing"), completely separate from the chat screens' own realtime channels,
// so those are not touched. A channel is opened when the first screen needs it
// and closed when the last one lets go.
//   DM:    typing_to:<receiver id>   payload { conversation_id, user_id, name }
//   Group: typing:gc:<group id>      payload { user_id, name }
type Cb = (payload: any) => void;
type Entry = { ch: any; cbs: Set<Cb>; refs: number };
const hub = new Map<string, Entry>();

function open(topic: string): Entry {
  let e = hub.get(topic);
  if (e) return e;
  const cbs = new Set<Cb>();
  const ch = supabase.channel(topic);
  ch.on('broadcast', { event: 'typing' }, (m: any) => cbs.forEach((cb) => cb(m?.payload)));
  ch.subscribe();
  e = { ch, cbs, refs: 0 };
  hub.set(topic, e);
  return e;
}

// Opens (or shares) the channel. Pass `cb` to hear typing signals. Returns the
// function that lets go again — use it as an effect clean-up.
export function acquireTyping(topic: string, cb?: Cb): () => void {
  const e = open(topic);
  e.refs++;
  if (cb) e.cbs.add(cb);
  return () => {
    if (cb) e.cbs.delete(cb);
    e.refs--;
    if (e.refs <= 0 && hub.get(topic) === e) {
      hub.delete(topic);
      supabase.removeChannel(e.ch);
    }
  };
}

// Sends a typing signal (the channel must have been acquired first).
export function sendTyping(topic: string, payload: any) {
  const e = hub.get(topic);
  if (!e) return;
  try {
    e.ch.send({ type: 'broadcast', event: 'typing', payload });
  } catch {}
}
