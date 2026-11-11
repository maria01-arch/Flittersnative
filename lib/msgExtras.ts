import { supabase } from './supabase';

// Saves an edited message and stamps `edited_at` (so chats can show "edited").
// If the edited_at column isn't there yet, the text is still saved. Returns
// the timestamp that was stored, or null.
export async function saveEdit(table: 'messages' | 'group_messages', id: string, senderId: string, content: string): Promise<string | null> {
  const at = new Date().toISOString();
  const first = await supabase.from(table).update({ content, edited_at: at }).eq('id', id).eq('sender_id', senderId);
  if (!first.error) return at;
  if (/edited_at/i.test(first.error.message || '')) {
    await supabase.from(table).update({ content }).eq('id', id).eq('sender_id', senderId);
  }
  return null;
}
