import { supabase } from './supabase';

export async function loadCommentTree(postId: string, myUserId?: string) {
  // profiles!comments_user_id_fkey disambiguates the join — the `comments`
  // table has a second, indirect path to `profiles` through
  // `comment_reactions` (comment_id + user_id), so a bare `profiles(...)`
  // embed is ambiguous and PostgREST rejects the whole query with a
  // PGRST201 error. The webapp already works around this the same way.
  const { data, error } = await supabase
    .from('comments')
    .select('*,author:profiles!comments_user_id_fkey(*),comment_likes(user_id),comment_reposts(user_id)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (error) console.error('[loadCommentTree] failed:', error.message, error);

  const list = (data || []).map((c: any) => ({
    ...c,
    likes_count: c.comment_likes?.length || 0,
    reposts_count: c.comment_reposts?.length || 0,
    liked_by_me: c.comment_likes?.some((l: any) => l.user_id === myUserId) || false,
    reposted_by_me: c.comment_reposts?.some((r: any) => r.user_id === myUserId) || false,
    replies_count: 0,
  }));

  const byId: Record<string, any> = {};
  list.forEach((c: any) => (byId[c.id] = c));
  list.forEach((c: any) => {
    if (c.reply_to_comment_id && byId[c.reply_to_comment_id]) {
      byId[c.reply_to_comment_id].replies_count += 1;
    }
  });

  return { all: list, byId };
}
