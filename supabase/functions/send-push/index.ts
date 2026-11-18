import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Android notification channel. Keep 'default' until the new Flitters build
// (with the custom sound) is installed on phones, then change to 'flitters'.
const PUSH_CHANNEL = 'default';

const NOTIFICATION_TEXT: Record<string, (name: string) => string> = {
  like: (name) => `${name} liked your post`,
  repost: (name) => `${name} reposted your post`,
  comment: (name) => `${name} commented on your post`,
  follow: (name) => `${name} followed you`,
  mention: (name) => `${name} mentioned you in a post`,
  coown: (name) => `${name} added you as a co-owner of a post`,
};

function messagePreview(record: any): string {
  if (record.is_voice) return '🎤 Voice message';
  if (record.image_url) return '📷 Photo';
  if (record.video_url) return '🎬 Video';
  if (record.sticker_url) return '🏷️ Sticker';
  return record.content || 'Sent a message';
}

function shortPreview(record: any): string {
  const t = messagePreview(record).replace(/\s+/g, ' ');
  return t.length > 40 ? t.slice(0, 40) + '…' : t;
}

// PUSH_MODE=actions makes chat / new-post pushes "silent": the phone's app wakes
// up and builds the notification itself, with its Reply / Like / Repost
// buttons, even when the app is closed (see lib/pushTask.ts in the app). It
// needs the app build that contains that task. Leave PUSH_MODE unset (or
// "classic") for the old behaviour: a normal push the system shows itself,
// buttons only while the app is open.
const PUSH_MODE = (Deno.env.get('PUSH_MODE') || 'classic').toLowerCase();

function buildMessage(to: string, title: string, body: string, data: Record<string, unknown>, categoryId?: string) {
  if (PUSH_MODE === 'actions' && categoryId) {
    // No title/body here on purpose: that is what makes it a silent data push.
    return { to, priority: 'high', data: { ...data, __flit: { title, body, categoryId, channelId: PUSH_CHANNEL } } };
  }
  return { to, title, body, data, sound: 'default', channelId: PUSH_CHANNEL, ...(categoryId ? { categoryId } : {}) };
}

// One request per phone, so a single bad token can't make Expo reject the rest.
async function sendPush(tokens: string[], title: string, body: string, data: Record<string, unknown>, categoryId?: string) {
  await Promise.all(
    tokens.map(async (to) => {
      try {
        const res = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify([buildMessage(to, title, body, data, categoryId)]),
        });
        const text = await res.text();
        if (!res.ok) {
          console.error('[send-push] Expo rejected request:', res.status, text);
          return;
        }
        const ticket = JSON.parse(text)?.data?.[0];
        if (ticket?.status === 'error') {
          console.error('[send-push] delivery error:', ticket.details?.error, ticket.message);
          if (ticket.details?.error === 'DeviceNotRegistered') {
            await supabase.from('push_tokens').delete().eq('token', to);
          }
        } else {
          console.log('[send-push] handed to Expo ok', PUSH_MODE);
        }
      } catch (err) {
        console.error('[send-push] send failed:', err);
      }
    })
  );
}

async function tokensFor(userId: string): Promise<string[]> {
  const { data } = await supabase.from('push_tokens').select('token').eq('user_id', userId);
  return [...new Set((data || []).map((r: any) => r.token as string))];
}

// Sends to ONE account. If that phone also holds other accounts, the title is
// prefixed with the account's @username, and the payload carries toUserId so
// tapping the notification can switch to that account.
async function pushToUser(userId: string, title: string, body: string, data: Record<string, unknown>, categoryId?: string) {
  const tokens = await tokensFor(userId);
  if (tokens.length === 0) {
    console.log('[send-push] no push tokens for', userId);
    return;
  }
  let finalTitle = title;
  const { data: shared } = await supabase.from('push_tokens').select('user_id').in('token', tokens).neq('user_id', userId).limit(1);
  if (shared && shared.length > 0) {
    const { data: me } = await supabase.from('profiles').select('username').eq('id', userId).maybeSingle();
    if (me?.username) finalTitle = `@${me.username} · ${title}`;
  }
  await sendPush(tokens, finalTitle, body, { ...data, toUserId: userId }, categoryId);
}

// Calls: sent as-is (high priority, the "calls" channel with the ringtone, gone after 45 seconds
// if undelivered). `data` is what the app reads when the notification is tapped or dismissed.
async function pushCallRaw(userId: string, message: Record<string, unknown>) {
  const tokens = await tokensFor(userId);
  await Promise.all(
    tokens.map(async (to) => {
      try {
        const res = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify([{ to, priority: 'high', ...message, data: { ...(message.data as object), toUserId: userId } }]),
        });
        const text = await res.text();
        if (!res.ok) { console.error('[send-push] call push rejected:', res.status, text); return; }
        const ticket = JSON.parse(text)?.data?.[0];
        if (ticket?.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') await supabase.from('push_tokens').delete().eq('token', to);
      } catch (err) {
        console.error('[send-push] call push failed:', err);
      }
    })
  );
}

// Only your own database webhooks may call this function. Each webhook sends the header
// "x-webhook-secret" with the secret you saved as PUSH_WEBHOOK_SECRET. Without this check
// anyone who finds the function address could send fake notifications to your users.
const WEBHOOK_SECRET = Deno.env.get('PUSH_WEBHOOK_SECRET') || '';
if (!WEBHOOK_SECRET) console.warn('[send-push] PUSH_WEBHOOK_SECRET is not set: anyone can call this function!');

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (WEBHOOK_SECRET && !sameText(req.headers.get('x-webhook-secret') || '', WEBHOOK_SECRET)) {
    return new Response('unauthorized', { status: 401 });
  }
  let claimedKey: string | null = null;
  try {
    const payload = await req.json();
    const table = payload.table as string;
    const record = payload.record as any;

    console.log('[send-push] event', table, record?.id, record?.type || '');
    // A reaction row may not have its own id: one push per person per message.
    const rowKey = table === 'calls' && record?.id
      ? `${table}:${record.id}:${record.status}`
      : record?.id
      ? `${table}:${record.id}`
      : table === 'message_reactions'
        ? `${table}:${record?.message_id}:${record?.user_id}`
        : table === 'group_message_reactions'
          ? `${table}:${record?.group_message_id}:${record?.user_id}`
          : null;
    if (rowKey) {
      claimedKey = rowKey;
      const { error: dupErr } = await supabase.from('push_sent').insert({ key: claimedKey });
      if (dupErr && (dupErr as any).code === '23505') return new Response('duplicate');
    }

    if (table === 'notifications') {
      if (record.type === 'comment_reaction') return new Response('ok');
      // The same alert can be written twice (two notification rows for one
      // action). One push per (who, what, to whom, which post) every 2 minutes.
      if (record.type !== 'login_alert') {
        const bucket = Math.floor(Date.now() / 120000);
        const contentKey = `n:${record.type}:${record.actor_id}:${record.user_id}:${record.post_id || ''}:${bucket}`;
        const { error: sameErr } = await supabase.from('push_sent').insert({ key: contentKey });
        if (sameErr && (sameErr as any).code === '23505') return new Response('duplicate content');
      }
      if (record.type === 'login_alert') {
        const platform = record.meta_platform === 'ios' ? 'an iPhone' : record.meta_platform === 'android' ? 'an Android device' : 'a device';
        const location = record.meta_location ? ` near ${record.meta_location}` : '';
        await pushToUser(record.user_id, 'New sign-in', `Your account was just signed into on ${platform}${location}.`, { type: 'login_alert' });
        return new Response('ok');
      }
      const { data: actor } = await supabase.from('profiles').select('display_name').eq('id', record.actor_id).single();
      const textFn = NOTIFICATION_TEXT[record.type];
      if (!textFn || !actor) return new Response('ignored');
      await pushToUser(record.user_id, 'Flitters', textFn(actor.display_name || 'Someone'), {
        type: record.type,
        postId: record.post_id,
        actorId: record.actor_id,
      });
    } else if (table === 'messages') {
      if (record.call_id) return new Response('call card');   // the call has its own push
      const { data: participants } = await supabase
        .from('conversation_participants')
        .select('*')
        .eq('conversation_id', record.conversation_id)
        .neq('user_id', record.sender_id);
      const recipientId = participants?.[0]?.user_id;
      if (!recipientId) return new Response('no recipient');
      if (participants?.[0]?.archived) return new Response('archived');
      const { data: sender } = await supabase.from('profiles').select('display_name,avatar_url').eq('id', record.sender_id).single();
      await pushToUser(recipientId, sender?.display_name || 'New message', messagePreview(record), {
        type: 'message',
        conversationId: record.conversation_id,
        otherId: record.sender_id,
        otherName: sender?.display_name,
        otherAvatar: sender?.avatar_url,
      }, 'chat_reply');
    } else if (table === 'group_messages') {
      if (record.system_event) return new Response('system message');   // "X added Y" etc: no push
      const [{ data: members }, { data: group }, { data: sender }] = await Promise.all([
        supabase.from('group_members').select('*').eq('group_id', record.group_id).neq('user_id', record.sender_id),
        supabase.from('groups').select('name').eq('id', record.group_id).single(),
        supabase.from('profiles').select('display_name').eq('id', record.sender_id).single(),
      ]);
      const recipientIds = (members || []).filter((m: any) => !m.archived).map((m: any) => m.user_id);
      const senderName = sender?.display_name || 'Someone';
      const preview = messagePreview(record);

      // "@all" mentions everybody; "@username" mentions that one person.
      const text: string = record.content || '';
      const handles = new Set<string>();
      let mentionAll = false;
      for (const m of text.matchAll(/(?<![\w])@([A-Za-z0-9_]{2,30})/g)) {
        const h = m[1].toLowerCase();
        if (h === 'all') mentionAll = true;
        else handles.add(h);
      }
      const mentioned = new Set<string>();
      if (handles.size > 0) {
        const { data: profs } = await supabase.from('profiles').select('id,username').in('username', [...handles]);
        (profs || []).forEach((p: any) => mentioned.add(p.id));
      }

      // Who wrote the message this one replies to? They get "<name> replied to you".
      let repliedToId: string | null = null;
      if (record.reply_to_id) {
        const { data: orig } = await supabase.from('group_messages').select('sender_id').eq('id', record.reply_to_id).maybeSingle();
        if (orig?.sender_id && orig.sender_id !== record.sender_id) repliedToId = orig.sender_id as string;
      }

      await Promise.all(
        recipientIds.map((id: string) => {
          const data = { type: 'group_message', groupId: record.group_id, groupName: group?.name };
          if (repliedToId && id === repliedToId) return pushToUser(id, group?.name || 'Group', `${senderName} replied to you: ${preview}`, { ...data, mention: true }, 'chat_reply');
          if (mentionAll) return pushToUser(id, group?.name || 'Group', `${senderName} mentioned all: ${preview}`, { ...data, mention: true }, 'chat_reply');
          if (mentioned.has(id)) return pushToUser(id, group?.name || 'Group', `${senderName} mentioned you: ${preview}`, { ...data, mention: true }, 'chat_reply');
          return pushToUser(id, group?.name || 'Group', `${senderName}: ${preview}`, data, 'chat_reply');
        })
      );
    } else if (table === 'message_reactions') {
      // Someone reacted to a DM message: tell the message's sender.
      const { data: msg } = await supabase.from('messages').select('*').eq('id', record.message_id).maybeSingle();
      if (!msg || msg.sender_id === record.user_id) return new Response('ignored');
      const { data: mine } = await supabase.from('conversation_participants').select('archived').eq('conversation_id', msg.conversation_id).eq('user_id', msg.sender_id).maybeSingle();
      if (mine?.archived) return new Response('archived');
      const { data: reactor } = await supabase.from('profiles').select('display_name,avatar_url').eq('id', record.user_id).single();
      await pushToUser(msg.sender_id, reactor?.display_name || 'Someone', `Reacted ${record.emoji} to your message: ${shortPreview(msg)}`, {
        type: 'message',
        conversationId: msg.conversation_id,
        otherId: record.user_id,
        otherName: reactor?.display_name,
        otherAvatar: reactor?.avatar_url,
      });
    } else if (table === 'group_message_reactions') {
      // Someone reacted to a group message: tell the message's sender.
      const { data: msg } = await supabase.from('group_messages').select('*').eq('id', record.group_message_id).maybeSingle();
      if (!msg || msg.sender_id === record.user_id) return new Response('ignored');
      const [{ data: member }, { data: group }, { data: reactor }] = await Promise.all([
        supabase.from('group_members').select('archived').eq('group_id', msg.group_id).eq('user_id', msg.sender_id).maybeSingle(),
        supabase.from('groups').select('name').eq('id', msg.group_id).single(),
        supabase.from('profiles').select('display_name').eq('id', record.user_id).single(),
      ]);
      if (member?.archived) return new Response('archived');
      await pushToUser(msg.sender_id, group?.name || 'Group', `${reactor?.display_name || 'Someone'} reacted ${record.emoji} to your message: ${shortPreview(msg)}`, {
        type: 'group_message',
        groupId: msg.group_id,
        groupName: group?.name,
      });
    } else if (table === 'calls') {
      const { data: caller } = await supabase.from('profiles').select('display_name,avatar_url').eq('id', record.caller_id).maybeSingle();
      const name = caller?.display_name || 'Someone';
      const base = { callId: record.id, callerId: record.caller_id, callerName: name, callerAvatar: caller?.avatar_url, conversationId: record.conversation_id };
      if (payload.type === 'INSERT' && record.status === 'ringing') {
        await pushCallRaw(record.callee_id, {
          title: name, body: 'Incoming voice call', channelId: 'calls', sound: 'default', ttl: 45,
          data: { type: 'incoming_call', ...base },
        });
      } else if (record.status === 'missed') {
        await pushCallRaw(record.callee_id, {
          title: name, body: 'Missed voice call', channelId: 'default', sound: 'default', ttl: 3600,
          data: { type: 'missed_call', ...base, otherId: record.caller_id, otherName: name, otherAvatar: caller?.avatar_url },
        });
        // Also take the "incoming call" alert away.
        await pushCallRaw(record.callee_id, { data: { type: 'call_ended', callId: record.id, __flit: { dismissCallId: record.id } }, ttl: 60, _contentAvailable: true });
      } else if (record.status === 'cancelled' || record.status === 'accepted') {
        await pushCallRaw(record.callee_id, { data: { type: 'call_ended', callId: record.id, __flit: { dismissCallId: record.id } }, ttl: 60, _contentAvailable: true });
      }
    } else if (table === 'posts') {
      // New post: tell everyone who turned on the bell for this author.
      // Only the first post of a thread notifies.
      if (record.thread_id && (record.thread_order || 0) > 0) return new Response('thread');
      const authorId = record.user_id as string;
      const { data: subs } = await supabase.from('profile_post_alerts').select('user_id').eq('target_id', authorId);
      let ids = [...new Set((subs || []).map((r: any) => r.user_id as string))].filter((u) => u !== authorId);
      if (ids.length === 0) return new Response('no subscribers');
      const [{ data: author }, { data: authorFull }] = await Promise.all([
        supabase.from('profiles').select('display_name').eq('id', authorId).single(),
        supabase.from('profiles').select('*').eq('id', authorId).single(),
      ]);
      if (authorFull?.is_private) {
        // Private profile: only accepted followers hear about it.
        const { data: fol } = await supabase.from('follows').select('*').eq('following_id', authorId).in('follower_id', ids);
        const ok = new Set((fol || []).filter((f: any) => !f.status || f.status === 'accepted').map((f: any) => f.follower_id));
        ids = ids.filter((u) => ok.has(u));
      }
      const name = author?.display_name || 'Someone';
      const snippet = (record.content || '').replace(/\s+/g, ' ').trim();
      const body = snippet ? `${name} posted: ${snippet.length > 60 ? snippet.slice(0, 60) + '…' : snippet}` : `${name} posted something new`;
      await Promise.all(ids.map((u) => pushToUser(u, 'Flitters', body, { type: 'new_post', postId: record.id, actorId: authorId }, 'post_actions')));
    }

    return new Response('ok');
  } catch (err) {
    console.error('[send-push] error:', err);
    if (claimedKey) await supabase.from('push_sent').delete().eq('key', claimedKey);
    return new Response('error', { status: 500 });
  }
});
