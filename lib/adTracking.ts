import { supabase } from './supabase';

// Counts ad views and taps on the server (database function track_ad_event).
// Fire and forget: nothing here ever shows an error, waits, or retries.
const sent = new Set<string>(); // ads already counted as seen in this app session
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function trackAd(adId: string | null | undefined, event: 'impression' | 'click') {
  if (!adId) return;
  const id = String(adId);
  try {
    if (event === 'impression') {
      if (sent.has(id)) return;
      sent.add(id);
    }
    Promise.resolve(supabase.rpc('track_ad_event', { p_ad_id: id, p_event: event })).then(
      () => {},
      () => {}
    );
  } catch {
    // never let tracking break the screen
  }
}

// Give it the ads that are at least 60% on screen right now (the list's own
// viewability setting does the 60%). An ad that stays there for 1 second is
// counted once; one that scrolls away before that is not.
export function updateVisibleAds(visibleIds: string[]) {
  const now = new Set(visibleIds.map(String));
  timers.forEach((t, id) => {
    if (!now.has(id)) {
      clearTimeout(t);
      timers.delete(id);
    }
  });
  now.forEach((id) => {
    if (sent.has(id) || timers.has(id)) return;
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        trackAd(id, 'impression');
      }, 1000)
    );
  });
}

export function clearVisibleAds() {
  timers.forEach((t) => clearTimeout(t));
  timers.clear();
}
