import { supabase } from '@/lib/supabase';

// Creator tools (Batch 1). All numbers come from the database functions in
// 02_creators.sql; they only ever return the signed-in person's own data.

export type Metric = 'views' | 'likes' | 'comments' | 'reposts' | 'followers';
export type DayPoint = { day: string; views: number; likes: number; comments: number; reposts: number; followers: number };
export type Totals = { views: number; likes: number; comments: number; reposts: number; followers: number; posts: number };
export type Overview = { days: number; followers_total: number; totals: Totals; previous: Totals; series: DayPoint[] };
export type CreatorPost = {
  id: string; content: string | null; image_url: string | null; video_url: string | null; thumbnail_url: string | null;
  created_at: string; views: number; likes: number; comments: number; reposts: number; engagement_rate: number;
};
export type PostStats = {
  post_id: string; created_at: string; views: number; likes: number; comments: number; reposts: number; quotes: number;
  series: { day: string; views: number; likes: number; comments: number }[];
};
export type PostSort = 'engagement' | 'views' | 'likes' | 'comments' | 'reposts' | 'recent';

export type Result<T> = { data: T | null; error: string | null; notProfessional?: boolean };

function wrap<T>(res: { data: any; error: any }): Result<T> {
  if (res.error) {
    const msg = String(res.error.message || '');
    return { data: null, error: msg, notProfessional: msg.includes('not_professional') };
  }
  return { data: res.data as T, error: null };
}

export async function fetchOverview(days: number): Promise<Result<Overview>> {
  return wrap<Overview>(await supabase.rpc('creator_overview', { p_days: days }));
}

export async function fetchCreatorPosts(sort: PostSort, limit = 20, offset = 0): Promise<Result<CreatorPost[]>> {
  return wrap<CreatorPost[]>(await supabase.rpc('creator_posts', { p_sort: sort, p_limit: limit, p_offset: offset }));
}

export async function fetchPostStats(postId: string): Promise<Result<PostStats>> {
  return wrap<PostStats>(await supabase.rpc('creator_post_stats', { p_post: postId }));
}

export async function setProfessional(userId: string, on: boolean, category?: string | null) {
  const patch: any = { is_professional: on };
  if (category !== undefined) patch.professional_category = category;
  return supabase.from('profiles').update(patch).eq('id', userId);
}

export async function pinPost(userId: string, postId: string | null) {
  return supabase.from('profiles').update({ pinned_post_id: postId }).eq('id', userId);
}

// Change vs the previous period, as text for a small tag: "+12%", "-4%", "new" or "".
export function trend(now: number, before: number): { label: string; dir: 'up' | 'down' | 'flat' } {
  if (now === before) return { label: '', dir: 'flat' };
  if (before === 0) return { label: 'new', dir: 'up' };
  const pct = Math.round(((now - before) / before) * 100);
  return { label: `${pct > 0 ? '+' : ''}${pct}%`, dir: pct > 0 ? 'up' : 'down' };
}

export const CATEGORIES = ['Creator', 'Artist', 'Musician', 'Writer', 'Business', 'Photographer', 'Educator', 'Other'];
