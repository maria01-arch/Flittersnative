import * as VideoThumbnails from 'expo-video-thumbnails';
import { supabase } from '@/lib/supabase';
import { sendInbox } from '@/lib/inboxPing';
import { uploadImage } from '@/lib/upload';
import { canPerform, permissionDeniedMessage } from '@/lib/permissions';

// The reply line of a moment reply is a hidden marker + the ids, so each screen can word it for
// whoever is reading ("You replied to a moment" / "Replied to your moment") and open the moment.
const MARK = '\u2063moment:';
export function momentMark(ownerId: string, momentId: string) {
  return `${MARK}${ownerId}:${momentId}`;
}
export function parseMomentReply(replyTo?: string | null): { ownerId: string; momentId: string } | null {
  if (!replyTo || !replyTo.startsWith(MARK)) return null;
  const [ownerId, momentId] = replyTo.slice(MARK.length).split(':');
  return ownerId && momentId ? { ownerId, momentId } : null;
}
// What a moment-reply message says in the chat list.
export function momentPreview(mine: boolean, text?: string | null) {
  return `${mine ? 'You replied to a moment' : 'Replied to your moment'}${text ? ': ' + text : ''}`;
}

// Replying to someone's moment: the moment goes into your DM with them as a picture card
// (no bubble) with your words under it, and a small "Replied to your moment" line on top.
export async function sendMomentReply(opts: {
  me: string;
  ownerId: string;
  ownerWhoCanMessage?: any;
  moment: { id: string; media_url: string; media_type: 'image' | 'video' };
  text: string;
}): Promise<{ ok: boolean; message?: string }> {
  const { me, ownerId, moment } = opts;
  const text = opts.text.trim();
  if (!text) return { ok: false, message: 'Write something first.' };

  // Find the DM with this person, or start one (same rule as the Message button).
  let convId: string | null = null;
  const { data: mine } = await supabase.from('conversation_participants').select('conversation_id').eq('user_id', me);
  if (mine?.length) {
    const { data: shared } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', ownerId)
      .in('conversation_id', mine.map((c: any) => c.conversation_id));
    if (shared?.length) convId = shared[0].conversation_id;
  }
  if (!convId) {
    const allowed = await canPerform(opts.ownerWhoCanMessage, ownerId, me);
    if (!allowed) return { ok: false, message: permissionDeniedMessage('who can message them', opts.ownerWhoCanMessage) };
    const { data: conv } = await supabase.from('conversations').insert({}).select().single();
    if (!conv) return { ok: false, message: "Couldn't start the chat. Try again." };
    await supabase.from('conversation_participants').insert([
      { conversation_id: conv.id, user_id: me },
      { conversation_id: conv.id, user_id: ownerId },
    ]);
    convId = conv.id;
  }

  // A video moment travels as its first picture, so the card stays light.
  let imageUrl: string | null = moment.media_type === 'image' ? moment.media_url : null;
  if (!imageUrl) {
    try {
      const t = await VideoThumbnails.getThumbnailAsync(moment.media_url, { time: 800 });
      imageUrl = await uploadImage(t.uri, `posts/${me}`);
    } catch {}
  }
  if (!imageUrl) return { ok: false, message: "Couldn't attach the moment. Try again." };

  const { error } = await supabase.from('messages').insert({
    conversation_id: convId,
    sender_id: me,
    content: text,
    image_url: imageUrl,
    reply_to: momentMark(ownerId, moment.id),
  });
  if (error) return { ok: false, message: "Couldn't send. Try again." };
  sendInbox(ownerId, { type: 'broadcast', event: 'ping', payload: {} });
  return { ok: true };
}
