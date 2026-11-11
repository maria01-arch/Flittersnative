import { supabase } from './supabase';

// "Clear history" hides every message up to a moment, only for ME — the other
// person (or the rest of the group) still has them. The moment is stored on my
// own row: conversation_participants.cleared_at / group_members.cleared_at.
// A missing column just means "nothing cleared" (the SQL was not run yet).
type Kind = 'dm' | 'group';

const table = (k: Kind) => (k === 'dm' ? 'conversation_participants' : 'group_members');
const idCol = (k: Kind) => (k === 'dm' ? 'conversation_id' : 'group_id');

export async function getClearedAt(kind: Kind, chatId: string, userId?: string | null): Promise<string | null> {
  if (!userId) return null;
  try {
    const { data, error } = await supabase.from(table(kind)).select('cleared_at').eq(idCol(kind), chatId).eq('user_id', userId).maybeSingle();
    if (error) return null;
    return (data as any)?.cleared_at || null;
  } catch {
    return null;
  }
}

// `upTo` is the created_at of the newest message I can see — a server time, so
// a wrong phone clock can never hide new messages by mistake.
export async function clearHistoryUpTo(kind: Kind, chatId: string, userId: string, upTo: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase
      .from(table(kind))
      .update({ cleared_at: upTo })
      .eq(idCol(kind), chatId)
      .eq('user_id', userId)
      .select(idCol(kind));
    if (error) return { ok: false, error: error.message };
    if (!data || !data.length) return { ok: false, error: 'Nothing was updated.' };
    // Everything up to now counts as read.
    const now = new Date().toISOString();
    if (kind === 'dm') {
      await supabase.from('messages').update({ read_at: now }).eq('conversation_id', chatId).neq('sender_id', userId).is('read_at', null);
    } else {
      await supabase.from('group_members').update({ last_read_at: now }).eq('group_id', chatId).eq('user_id', userId);
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

// true when a message is newer than the cleared moment (or nothing is cleared).
export function isAfterCleared(createdAt: string | undefined | null, cleared: string | null | undefined): boolean {
  if (!cleared) return true;
  const a = Date.parse(String(createdAt || ''));
  const b = Date.parse(cleared);
  if (isNaN(a) || isNaN(b)) return true;
  return a > b;
}
