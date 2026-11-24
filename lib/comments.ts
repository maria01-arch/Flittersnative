import { supabase } from './supabase';

export async function loadCommentTree(postId: string, myUserId?: string) {
  // profiles!comments_user_id_fkey disambiguates the join — the `comments`
  // table has a second, indirect path to `profiles` through
  // `comment_reactions` (comment_id + user_id), so a bare `profiles(...)`
  // embed is ambiguous and PostgREST rejects the whole query with a
  // PGRST201 error. The webapp already works around this the same way.
  const { data, error } = await supabase
    .from('comments')
    .select('*,author:profiles!comments_user_id_fkey(id,display_name,username,avatar_url,verified,is_authentic,verified_plan),comment_likes(count),comment_reposts(count)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (error) console.error('[loadCommentTree] failed:', error.message, error);

  // Counts come back as single numbers; two small queries find which of
  // these comments I liked / reposted (rather than every like on every comment).
  const likedByMe = new Set<string>();
  const repostedByMe = new Set<string>();
  const ids = (data || []).map((c: any) => c.id);
  if (myUserId && ids.length) {
    const [l, r] = await Promise.all([
      supabase.from('comment_likes').select('comment_id').eq('user_id', myUserId).in('comment_id', ids),
      supabase.from('comment_reposts').select('comment_id').eq('user_id', myUserId).in('comment_id', ids),
    ]);
    (l.data || []).forEach((x: any) => likedByMe.add(x.comment_id));
    (r.data || []).forEach((x: any) => repostedByMe.add(x.comment_id));
  }
  const countOf = (rel: any) => (Array.isArray(rel) ? Number(rel[0]?.count) || 0 : 0);

  const list = (data || []).map((c: any) => ({
    ...c,
    likes_count: countOf(c.comment_likes),
    reposts_count: countOf(c.comment_reposts),
    liked_by_me: likedByMe.has(c.id),
    reposted_by_me: repostedByMe.has(c.id),
    replies_count: 0,
  }));

  const byId: Record<string, any> = {};
  list.forEach((c: any) => (byId[c.id] = c));
  list.forEach((c: any) => {
    if (c.reply_to_comment_id && byId[c.reply_to_comment_id]) {
      byId[c.reply_to_comment_id].replies_count += 1;
    }
  });

  // "Replying to @name" tags: who a reply was written for (people already in the list first, the rest looked up).
  const names: Record<string, any> = {};
  list.forEach((c: any) => { if (c.author?.id) names[c.author.id] = c.author; });
  const missing = Array.from(new Set(list.map((c: any) => c.reply_to_user_id).filter((u: string) => u && !names[u]))) as string[];
  if (missing.length) {
    const { data: ps } = await supabase.from('profiles').select('id,username,display_name').in('id', missing);
    (ps || []).forEach((p: any) => { names[p.id] = p; });
  }
  list.forEach((c: any) => { c.reply_to_user = c.reply_to_user_id ? names[c.reply_to_user_id] || null : null; });

  return { all: list, byId };
}

// Pick one picture for a comment / reply. Returns its local address, or null.
export async function pickCommentImage(): Promise<string | null> {
  const ImagePicker = await import('expo-image-picker');
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (result.canceled || !result.assets?.[0]) return null;
  return result.assets[0].uri;
}
