// Deploy with: supabase functions deploy send-push
// Then wire up Database Webhooks so this runs automatically on INSERT
// into `notifications`, `messages`, and `group_messages`.
//
// Uses the Expo push service directly (a plain HTTPS POST) — no Firebase
// Admin SDK needed here at all. Firebase is only involved earlier, as
// credentials Expo itself uses to actually deliver to Android devices.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const NOTIFICATION_TEXT: Record<string, (name: string) => string> = {
  like: (name) => `${name} liked your post`,
  repost: (name) => `${name} reposted your post`,
  comment: (name) => `${name} commented on your post`,
  follow: (name) => `${name} followed you`,
};

function messagePreview(record: any): string {
  if (record.is_voice) return '🎤 Voice message';
  if (record.image_url) return '📷 Photo';
  return record.content || 'Sent a message';
}

async function sendPush(tokens: string[], title: string, body: string, data: Record<string, unknown>) {
  if (tokens.length === 0) return;
  const messages = tokens.map((to) => ({ to, title, body, data, sound: 'default', channelId: 'default' }));
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
  if (!res.ok) {
    console.error('[send-push] Expo push API rejected request:', res.status, await res.text());
  }
}

async function tokensFor(userId: string): Promise<string[]> {
  const { data } = await supabase.from('push_tokens').select('token').eq('user_id', userId);
  return (data || []).map((r: any) => r.token);
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const table = payload.table as string;
    const record = payload.record as any;

    if (table === 'notifications') {
      if (record.type === 'comment_reaction') return new Response('ok');
      if (record.type === 'login_alert') {
        // Self-alert — there's no "someone else" here, so this doesn't
        // fit the actor-name-based NOTIFICATION_TEXT map below at all.
        const platform = record.meta_platform === 'ios' ? 'an iPhone' : record.meta_platform === 'android' ? 'an Android device' : 'a device';
        const location = record.meta_location ? ` near ${record.meta_location}` : '';
        const tokens = await tokensFor(record.user_id);
        await sendPush(tokens, 'New sign-in', `Your account was just signed into on ${platform}${location}.`, { type: 'login_alert' });
        return new Response('ok');
      }
      const { data: actor } = await supabase.from('profiles').select('display_name').eq('id', record.actor_id).single();
      const textFn = NOTIFICATION_TEXT[record.type];
      if (!textFn || !actor) return new Response('ignored');
      const tokens = await tokensFor(record.user_id);
      await sendPush(tokens, 'Flitters', textFn(actor.display_name || 'Someone'), {
        type: record.type,
        postId: record.post_id,
        actorId: record.actor_id,
      });
    } else if (table === 'messages') {
      const { data: participants } = await supabase
        .from('conversation_participants')
        .select('user_id')
        .eq('conversation_id', record.conversation_id)
        .neq('user_id', record.sender_id);
      const recipientId = participants?.[0]?.user_id;
      if (!recipientId) return new Response('no recipient');
      const { data: sender } = await supabase.from('profiles').select('display_name,avatar_url').eq('id', record.sender_id).single();
      const tokens = await tokensFor(recipientId);
      await sendPush(tokens, sender?.display_name || 'New message', messagePreview(record), {
        type: 'message',
        conversationId: record.conversation_id,
        otherId: record.sender_id,
        otherName: sender?.display_name,
        otherAvatar: sender?.avatar_url,
      });
    } else if (table === 'group_messages') {
      const [{ data: members }, { data: group }, { data: sender }] = await Promise.all([
        supabase.from('group_members').select('user_id').eq('group_id', record.group_id).neq('user_id', record.sender_id),
        supabase.from('groups').select('name').eq('id', record.group_id).single(),
        supabase.from('profiles').select('display_name').eq('id', record.sender_id).single(),
      ]);
      const recipientIds = (members || []).map((m: any) => m.user_id);
      const allTokens = (await Promise.all(recipientIds.map((id: string) => tokensFor(id)))).flat();
      await sendPush(allTokens, group?.name || 'Group', `${sender?.display_name || 'Someone'}: ${messagePreview(record)}`, {
        type: 'group_message',
        groupId: record.group_id,
        groupName: group?.name,
      });
    }

    return new Response('ok');
  } catch (err) {
    console.error('[send-push] error:', err);
    return new Response('error', { status: 500 });
  }
});
