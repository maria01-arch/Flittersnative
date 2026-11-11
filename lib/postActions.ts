import { supabase } from './supabase';
import { canPerform, permissionDeniedMessage } from './permissions';

// Inserts a notification only if the exact same one (same person, same
// type, same post) doesn't already exist. This is what stops duplicate
// "liked your post" rows: a fast double-tap, liking → unliking → liking
// again, or a database trigger that also writes one — in every case the
// second attempt finds the first and does nothing.
export async function notifyOnce(n: { userId: string; actorId: string; type: 'like' | 'repost' | 'follow'; postId?: string | null }) {
  if (!n.userId || n.userId === n.actorId) return;
  let existing = supabase.from('notifications').select('id').eq('user_id', n.userId).eq('actor_id', n.actorId).eq('type', n.type);
  existing = n.postId ? existing.eq('post_id', n.postId) : existing.is('post_id', null);
  const { data } = await existing.limit(1);
  if (data && data.length > 0) return;
  const { error } = await supabase
    .from('notifications')
    .insert({ user_id: n.userId, actor_id: n.actorId, type: n.type, ...(n.postId ? { post_id: n.postId } : {}) });
  if (error) console.warn('[notifyOnce] insert failed:', error.message);
}

// Saves a quote repost — a repost carrying the person's own text (the
// `content` column on `reposts`, same as the webapp). Returns the new
// timeline entry so a screen can show it straight away without reloading.
export async function createQuoteRepost(post: any, text: string, userId: string): Promise<{ error?: string; entry?: any }> {
  const allowed = await canPerform(post.author?.who_can_repost, post.user_id, userId);
  if (!allowed) return { error: permissionDeniedMessage('who can repost their posts', post.author?.who_can_repost) };
  const { data, error } = await supabase
    .from('reposts')
    .insert({ post_id: post.id, user_id: userId, content: text })
    .select('id,created_at,content,user:profiles(id,display_name,username,avatar_url,verified,is_authentic,verified_plan)')
    .single();
  if (error || !data) return { error: error?.message || 'Could not repost right now.' };
  await notifyOnce({ userId: post.user_id, actorId: userId, type: 'repost', postId: post.id });
  const { isRepost, reposter, quoteContent, sortTime, feedKey, ...original } = post;
  return {
    entry: {
      ...original,
      feedKey: `repost-${data.id}`,
      isRepost: true,
      reposter: (data as any).user,
      quoteContent: data.content,
      sortTime: data.created_at,
      reposted_by_me: true,
      reposts_count: (original.reposts_count || 0) + 1,
    },
  };
}

// ---- Counts instead of lists ------------------------------------------
// Posts used to be fetched with `likes(user_id), reposts(user_id),
// comments(id)` — every like, repost and comment row of every post, just to
// count them and look for your own id. That grows with every like. Now the
// database does the counting (`likes(count)` returns one small number) and
// one tiny extra query per page asks "which of THESE posts did I like /
// repost?". Payload stays the same size however popular a post gets.
export const POST_COUNTS_SELECT = 'likes(count),reposts(count),comments(count)';

export type MyPostFlags = { liked: Set<string>; reposted: Set<string> };

const countOf = (rel: any): number => (Array.isArray(rel) ? Number(rel[0]?.count) || 0 : 0);

export async function fetchMyFlags(postIds: string[], me?: string | null): Promise<MyPostFlags> {
  const flags: MyPostFlags = { liked: new Set(), reposted: new Set() };
  const ids = Array.from(new Set(postIds.filter(Boolean)));
  if (!me || ids.length === 0) return flags;
  const [likes, reposts] = await Promise.all([
    supabase.from('likes').select('post_id').eq('user_id', me).in('post_id', ids),
    supabase.from('reposts').select('post_id').eq('user_id', me).in('post_id', ids),
  ]);
  (likes.data || []).forEach((l: any) => flags.liked.add(l.post_id));
  (reposts.data || []).forEach((r: any) => flags.reposted.add(r.post_id));
  return flags;
}

// The five fields every screen computes from a fetched post.
export function applyCounts(p: any, flags: MyPostFlags) {
  return {
    likes_count: countOf(p.likes),
    reposts_count: countOf(p.reposts),
    comments_count: countOf(p.comments),
    liked_by_me: flags.liked.has(p.id),
    reposted_by_me: flags.reposted.has(p.id),
  };
}

// ---- Co-owners ---------------------------------------------------------
// A post can have extra owners (table post_coowners). Up to 3 for regular
// accounts and 8 for verified ones — the database enforces the same limit.
export const coownerLimit = (verified: boolean) => (verified ? 8 : 3);

let coownersAvailable = true;
// Added to every post query so each post arrives with its co-owners.
export const coownersEmbed = () =>
  coownersAvailable ? ',coowners:post_coowners(user:profiles(id,display_name,username,avatar_url,verified,is_authentic,verified_plan))' : '';
// If the table hasn't been created yet the embed makes a query fail; this
// notices that, turns the embed off, and tells the caller to retry once.
export function noteCoownersError(err: any): boolean {
  if (err && coownersAvailable && /post_coowners/i.test(JSON.stringify(err))) {
    coownersAvailable = false;
    return true;
  }
  return false;
}

export async function isVerifiedUser(userId?: string | null): Promise<boolean> {
  if (!userId) return false;
  const { data } = await supabase.from('profiles').select('verified,is_authentic,verified_plan').eq('id', userId).maybeSingle();
  return !!(data?.verified || data?.is_authentic);
}

// "Alex & Sam" / "Alex & Sam +2" for a post header.
export function ownerNames(post: any): string {
  const base = post.author?.display_name || 'Unknown';
  const co = (post.coowners || []).map((c: any) => c.user?.display_name).filter(Boolean);
  if (!co.length) return base;
  return co.length === 1 ? `${base} & ${co[0]}` : `${base} & ${co[0]} +${co.length - 1}`;
}

// Notify people tagged with @username in the post text (skips the author and
// anyone who already got a co-owner notification).
export async function notifyMentions(texts: string[], postId: string, authorId: string, skipIds: string[] = []) {
  const names = new Set<string>();
  texts.forEach((t) => (t.match(/(?<![\w])@([A-Za-z0-9_]{2,30})/g) || []).forEach((m) => names.add(m.slice(1).toLowerCase())));
  if (!names.size) return;
  const { data } = await supabase.from('profiles').select('id,username').in('username', Array.from(names));
  const rows = (data || [])
    .filter((p: any) => p.id !== authorId && !skipIds.includes(p.id))
    .map((p: any) => ({ user_id: p.id, actor_id: authorId, type: 'mention', post_id: postId }));
  if (rows.length) {
    const { error } = await supabase.from('notifications').insert(rows);
    if (error) console.warn('[mentions] notification insert failed:', error.message);
  }
}
