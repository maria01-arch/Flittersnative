import { supabase } from './supabase';

// Likes, comments and saves on ads (Batch 4). Backed by 05_ad_engagement.sql.
export type AdEng = { likes: number; comments: number; liked: boolean; saved: boolean };
export type AdComment = {
  id: string; ad_id: string; user_id: string; content: string; created_at: string;
  author: { id: string; display_name: string | null; username: string | null; avatar_url: string | null; verified?: boolean; is_authentic?: boolean; verified_plan?: string | null } | null;
};

const dupe = (m?: string) => /duplicate/i.test(m || '');

export async function fetchAdEngagement(ids: string[]): Promise<Record<string, AdEng>> {
  const out: Record<string, AdEng> = {};
  if (!ids.length) return out;
  const { data, error } = await supabase.rpc('ad_engagement', { p_ids: ids.slice(0, 50) });
  if (error || !data) return out;
  for (const r of data as any[]) out[r.ad_id] = { likes: Number(r.likes) || 0, comments: Number(r.comments) || 0, liked: !!r.liked, saved: !!r.saved };
  return out;
}

export async function setAdLike(adId: string, uid: string, on: boolean): Promise<boolean> {
  const r = on
    ? await supabase.from('ad_likes').insert({ ad_id: adId, user_id: uid })
    : await supabase.from('ad_likes').delete().eq('ad_id', adId).eq('user_id', uid);
  return !r.error || dupe(r.error.message);
}

export async function setAdSave(adId: string, uid: string, on: boolean): Promise<boolean> {
  const r = on
    ? await supabase.from('ad_saves').insert({ ad_id: adId, user_id: uid })
    : await supabase.from('ad_saves').delete().eq('ad_id', adId).eq('user_id', uid);
  return !r.error || dupe(r.error.message);
}

export async function fetchAdComments(adId: string): Promise<{ data: AdComment[]; error: string | null }> {
  const { data, error } = await supabase
    .from('ad_comments')
    .select('id,ad_id,user_id,content,created_at,author:profiles(id,display_name,username,avatar_url,verified,is_authentic,verified_plan)')
    .eq('ad_id', adId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return { data: [], error: error.message };
  return { data: (data as any[]) as AdComment[], error: null };
}

export async function addAdComment(adId: string, uid: string, content: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('ad_comments').insert({ ad_id: adId, user_id: uid, content: content.trim() });
  if (!error) return { ok: true };
  if (/too_many_requests/.test(error.message)) return { ok: false, error: 'You are commenting too fast. Try again in a minute.' };
  return { ok: false, error: "Couldn't post your comment. Try again." };
}

export async function deleteAdComment(id: string, uid: string): Promise<boolean> {
  const { error } = await supabase.from('ad_comments').delete().eq('id', id).eq('user_id', uid);
  return !error;
}

export type SavedAd = { created_at: string; ad: { id: string; advertiser_name: string | null; content: string | null; image_url: string | null; link_url: string | null; cta_text: string | null; advertiser_avatar_url: string | null; active: boolean } | null };
export async function fetchSavedAds(uid: string): Promise<SavedAd[]> {
  const { data, error } = await supabase
    .from('ad_saves')
    .select('created_at,ad:ads(id,advertiser_name,content,image_url,link_url,cta_text,advertiser_avatar_url,active)')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error || !data) return [];
  return (data as any[]).filter((r) => r.ad && r.ad.active) as SavedAd[];
}

// Lets the comments screen tell the ad card in the feed that the count changed.
type Listener = (adId: string, delta: number) => void;
const listeners = new Set<Listener>();
export const subscribeAdComments = (fn: Listener) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const bumpAdComments = (adId: string, delta: number) => listeners.forEach((l) => l(adId, delta));
