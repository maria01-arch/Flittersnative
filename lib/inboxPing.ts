import { supabase } from './supabase';

// Sends a one-off "ping" to someone's inbox channel (it makes their chat list
// refresh at once). Before, every send created a new channel object that was
// never removed, so a long chat session slowly piled up hundreds of them. This
// removes the channel again as soon as the message has gone.
export function sendInbox(userId: string, message: any): void {
  try {
    const ch = supabase.channel(`inbox_${userId}`);
    const done = () => { try { supabase.removeChannel(ch); } catch {} };
    Promise.resolve(ch.send(message)).then(done, done);
  } catch {}
}
