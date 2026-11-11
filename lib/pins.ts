import { supabase } from './supabase';

// A chat (DM or group) can have up to 3 pinned messages.
export const MAX_PINS = 3;

// What a reply or a pin shows for a message that has no text.
export const STICKER_LABEL = '🏷️ Sticker';

// How long a pin stays (the person chooses when pinning).
export const PIN_DURATIONS = [
  { label: '24 hours', ms: 24 * 3600 * 1000 },
  { label: '7 days', ms: 7 * 24 * 3600 * 1000 },
  { label: '1 month', ms: 30 * 24 * 3600 * 1000 },
];

export type PinnedItem = { id: string; label: string };

export function messageLabel(m: any): string {
  if (m?.content && String(m.content).trim()) return m.content;
  if (m?.image_url) return '📷 Photo';
  if (m?.video_url) return '🎥 Video';
  if (m?.voice_url) return '🎤 Voice message';
  if (m?.sticker_url) return STICKER_LABEL;
  return 'Message';
}

// Reads the pins of one chat plus the small bit of each pinned message that the
// bar needs (so a pin still shows even when that message is far up the chat and
// not loaded). At most 3 tiny rows. Newest pin first. Reads '*' so a missing
// date column can never break it.
export async function fetchPins(kind: 'dm' | 'group', chatId: string): Promise<PinnedItem[]> {
  const col = kind === 'dm' ? 'conversation_id' : 'group_id';
  const { data: pins, error } = await supabase.from('pinned_messages').select('*').eq(col, chatId);
  if (error || !pins?.length) return [];
  // Pins past their end time are gone (rows made before expiry existed have none).
  const now = Date.now();
  const live = pins.filter((r: any) => !r.expires_at || new Date(r.expires_at).getTime() > now);
  const rows = [...live].sort((a: any, b: any) =>
    String(b.created_at || b.pinned_at || '').localeCompare(String(a.created_at || a.pinned_at || ''))
  );
  const ids = rows.map((r: any) => r.message_id).filter(Boolean);
  if (!ids.length) return [];
  const table = kind === 'dm' ? 'messages' : 'group_messages';
  const { data: msgs } = await supabase.from(table).select('id,content,image_url,video_url,voice_url,sticker_url').in('id', ids);
  const byId: Record<string, any> = {};
  (msgs || []).forEach((m: any) => (byId[m.id] = m));
  return ids.filter((id: string) => byId[id]).map((id: string) => ({ id, label: messageLabel(byId[id]) }));
}
