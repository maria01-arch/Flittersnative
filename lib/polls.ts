import { supabase } from './supabase';

export type Poll = { id: string; creator_id: string; question: string; options: string[]; multiple: boolean; closes_at: string | null; show_counts?: boolean };
export type PollCount = { votes: number; mine: boolean };

const cache = new Map<string, Poll>();

// Makes a poll and gives back its id (null when it could not be saved).
export async function createPoll(question: string, options: string[], multiple: boolean, showCounts = false): Promise<{ id: string | null; error?: string }> {
  const base: any = { question: question.trim(), options: options.map((o) => o.trim()), multiple };
  let { data, error } = await supabase.from('polls').insert(showCounts ? { ...base, show_counts: true } : base).select('*').single();
  // The show_counts column may not exist yet (SQL not run): make the poll without it.
  if (error && /show_counts/i.test(error.message || '')) ({ data, error } = await supabase.from('polls').insert(base).select('*').single());
  if (error || !data) return { id: null, error: error?.message };
  cache.set(data.id, data as Poll);
  return { id: data.id };
}

export async function fetchPoll(id: string): Promise<Poll | null> {
  const hit = cache.get(id);
  if (hit) return hit;
  const { data } = await supabase.from('polls').select('*').eq('id', id).maybeSingle();
  if (data) cache.set(id, data as Poll);
  return (data as Poll) || null;
}

// votes + "did I pick it" for every option of one poll.
export async function fetchCounts(id: string): Promise<Record<number, PollCount> | null> {
  const { data, error } = await supabase.rpc('poll_counts', { p_ids: [id] });
  if (error) return null;
  const out: Record<number, PollCount> = {};
  (data || []).forEach((r: any) => (out[r.option_idx] = { votes: Number(r.votes) || 0, mine: !!r.mine }));
  return out;
}

export async function votePoll(id: string, idx: number): Promise<boolean> {
  const { error } = await supabase.rpc('poll_vote', { p_poll: id, p_idx: idx });
  return !error;
}

export async function fetchVoters(id: string): Promise<any[]> {
  const { data } = await supabase.rpc('poll_voters', { p_poll: id });
  return data || [];
}

export const pollContent = (question: string) => '📊 ' + question.trim();
