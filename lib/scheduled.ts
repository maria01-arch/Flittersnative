import { supabase } from './supabase';

// Scheduled posts (Batch 6 SQL: 06_scheduled_posts.sql). Posts go live from the
// server on time, even if the phone is off.
export type SchedItem = { content: string; image_url: string | null; video_url: string | null; thumbnail_url: string | null };
export type Scheduled = {
  id: string; items: SchedItem[]; scheduled_for: string;
  status: 'pending' | 'published' | 'failed' | 'cancelled'; error: string | null; post_id: string | null; published_at: string | null;
};

const MESSAGES: Record<string, string> = {
  not_professional: 'Turn on Professional mode in Settings to schedule posts.',
  time_too_soon: 'Pick a time at least a few minutes from now.',
  time_too_far: 'You can schedule up to 90 days ahead.',
  too_long: 'A post is longer than 300 characters.',
  empty_post: 'A post in your thread is empty.',
  too_many_scheduled: 'You already have 25 scheduled posts. Cancel one or wait for one to go out.',
  not_pending: 'That post already went out or was cancelled.',
  not_signed_in: 'Please sign in again.',
};
export function friendlySchedError(message?: string): string {
  const m = message || '';
  for (const k of Object.keys(MESSAGES)) if (m.includes(k)) return MESSAGES[k];
  if (/function .* does not exist|schema cache/i.test(m)) return 'Scheduling is not switched on yet.';
  return "Couldn't do that. Check your connection and try again.";
}

export async function schedulePost(items: SchedItem[], coownerIds: string[], when: Date): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('schedule_post', { p_items: items, p_coowners: coownerIds, p_when: when.toISOString() });
  return error ? { ok: false, error: friendlySchedError(error.message) } : { ok: true };
}

export async function fetchScheduled(): Promise<{ data: Scheduled[] | null; error: string | null }> {
  const { data, error } = await supabase.rpc('my_scheduled');
  if (error) return { data: null, error: friendlySchedError(error.message) };
  return { data: (data as Scheduled[]) || [], error: null };
}

export async function cancelScheduled(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('cancel_scheduled', { p_id: id });
  return error ? { ok: false, error: friendlySchedError(error.message) } : { ok: true };
}

export async function reschedulePost(id: string, when: Date): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('reschedule_post', { p_id: id, p_when: when.toISOString() });
  return error ? { ok: false, error: friendlySchedError(error.message) } : { ok: true };
}

export function whenText(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  const day = x.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = x.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}
