import { supabase } from './supabase';

// Remembers what a person searches for, so the home feed can lean towards
// those topics (SQL function bump_interest; old interests fade over weeks).
// Fire-and-forget: if the SQL isn't installed yet this silently does nothing.
const recent = new Map<string, number>();

export function recordInterest(term: string, weight = 1) {
  const t = (term || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (t.length < 2 || t.length > 40) return;
  // The same word twice within a minute counts once.
  const last = recent.get(t) || 0;
  if (Date.now() - last < 60000) return;
  recent.set(t, Date.now());
  supabase.rpc('bump_interest', { p_term: t, p_weight: weight }).then(
    () => {},
    () => {}
  );
}
