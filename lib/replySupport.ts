import { supabase } from './supabase';

// Replies remember which exact message they answer in a `reply_to_id` column.
// This asks the database once whether that column exists, so the app only sends
// the field when it can — a missing column can never stop a reply being sent.
const cache: Record<string, Promise<boolean>> = {};
export function supportsReplyId(table: 'messages' | 'group_messages'): Promise<boolean> {
  if (!cache[table]) {
    cache[table] = Promise.resolve(supabase.from(table).select('reply_to_id').limit(1)).then(({ error }) => !error);
  }
  return cache[table];
}
