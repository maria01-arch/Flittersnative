import { supabase } from './supabase';

// What the Reply / Like / Repost buttons under a notification do. Kept in its
// own small file because it runs in two places: the normal app, and the
// background task that wakes up when the app is closed (lib/pushTask.ts).
// A button on a notification was pressed (Reply / Like / Repost). Returns
// true when it was handled here, false when the screen should open instead.
async function runAction(action: string, data: any, userText?: string): Promise<boolean> {
  try {
    if (!data) return false;
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user?.id;
    if (!uid) return false;
    // A button for another account on this phone: open the app instead, so
    // the switch happens first.
    if (data.toUserId && data.toUserId !== uid) return false;

    if (action === 'reply') {
      const text = (userText || '').trim();
      if (!text) return false;
      if (data.type === 'message' && data.conversationId) {
        const { error } = await supabase.from('messages').insert({ conversation_id: data.conversationId, sender_id: uid, content: text });
        return !error;
      }
      if (data.type === 'group_message' && data.groupId) {
        const { error } = await supabase.from('group_messages').insert({ group_id: data.groupId, sender_id: uid, content: text });
        return !error;
      }
      return false;
    }
    if ((action === 'like' || action === 'repost') && data.postId) {
      const { error } = await supabase.from(action === 'like' ? 'likes' : 'reposts').insert({ post_id: data.postId, user_id: uid });
      // 23505 = already liked/reposted: that is fine.
      return !error || (error as any).code === '23505';
    }
  } catch (err) {
    console.warn('[Push] notification button failed:', err);
  }
  return false;
}


// Both the normal listener and the closed-app task can be told about the same
// button press. They share one result per press so a reply is never sent twice.
const inflight = new Map<string, Promise<boolean>>();

export function performNotificationAction(response: any): Promise<boolean> {
  const data = response?.notification?.request?.content?.data;
  const action: string = response?.actionIdentifier || '';
  const key = `${response?.notification?.request?.identifier || ''}:${action}:${response?.userText || ''}`;
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = runAction(action, data, response?.userText);
  inflight.set(key, p);
  // Forget it after a while so the map cannot grow forever.
  setTimeout(() => inflight.delete(key), 60000);
  return p;
}
