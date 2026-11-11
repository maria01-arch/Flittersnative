import { supabase } from './supabase';

export type ForwardTarget = { kind: 'dm' | 'group'; id: string; otherId?: string };
export type ForwardPayload = {
  content?: string;
  image_url?: string | null;
  video_url?: string | null;
  sticker_url?: string | null;
  voice_url?: string | null;
  voice_duration?: number | null;
  // A sticker pack sent as a card (content is the text shown in the chat list).
  pack_id?: string | null;
  // true = show the "Forwarded" label (a shared link is not a forward).
  forwarded?: boolean;
};

// What gets copied when a message is forwarded (never the reply quote).
export function payloadFromMessage(m: any): ForwardPayload {
  return {
    content: m.content || '',
    image_url: m.image_url || null,
    video_url: m.video_url || null,
    sticker_url: m.sticker_url || null,
    voice_url: m.voice_url || null,
    voice_duration: m.voice_duration ?? null,
    forwarded: true,
  };
}

function rowFields(p: ForwardPayload) {
  const row: Record<string, any> = { content: p.content || '' };
  if (p.forwarded) row.is_forwarded = true;
  if (p.image_url) row.image_url = p.image_url;
  if (p.video_url) row.video_url = p.video_url;
  if (p.sticker_url) {
    row.is_sticker = true;
    row.sticker_url = p.sticker_url;
  }
  if (p.pack_id) row.shared_pack_id = p.pack_id;
  if (p.voice_url) {
    row.is_voice = true;
    row.voice_url = p.voice_url;
    if (p.voice_duration != null) row.voice_duration = p.voice_duration;
  }
  return row;
}

// Sends the same message into each chosen DM / group, as the signed-in person.
export async function forwardTo(targets: ForwardTarget[], me: string, payload: ForwardPayload): Promise<{ sent: number; failed: number }> {
  const fields = rowFields(payload);
  let sent = 0;
  let failed = 0;
  for (const t of targets) {
    const insertRow = (f: Record<string, any>) =>
      t.kind === 'dm'
        ? supabase.from('messages').insert({ conversation_id: t.id, sender_id: me, ...f })
        : supabase.from('group_messages').insert({ group_id: t.id, sender_id: me, ...f });
    let { error } = await insertRow(fields);
    // The is_forwarded column may not exist yet: send it as a normal message.
    if (error && /is_forwarded/i.test(error.message || '')) {
      const { is_forwarded, ...plain } = fields;
      ({ error } = await insertRow(plain));
    }
    if (error) {
      console.warn('[forward] failed:', error.message);
      failed++;
    } else {
      sent++;
      // Same nudge the chat screen sends so their chat list updates at once.
      if (t.kind === 'dm' && t.otherId) supabase.channel(`inbox_${t.otherId}`).send({ type: 'broadcast', event: 'ping', payload: {} });
    }
  }
  return { sent, failed };
}
