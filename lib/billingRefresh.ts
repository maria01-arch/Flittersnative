import { SITE_URL } from '@/lib/siteConfig';
import { useEffect } from 'react';
import { supabase } from './supabase';
import { useAuth } from './AuthContext';
import { useAppForeground } from './useAppForeground';

// Asks the server to re-check this person's Google Play subscriptions (the
// server adds or removes the paid badge), then reloads their badge fields so
// the screens update. Cheap on purpose: at most once every few minutes per
// account, unless a purchase / restore just happened (force).
const API = SITE_URL + '/api/billing/refresh';
const MIN_GAP = 4 * 60 * 1000;
const lastRun: Record<string, number> = {};
const inFlight: Record<string, boolean> = {};

export type BadgePatch = { verified?: boolean; is_authentic?: boolean; verified_plan?: string | null; verified_until?: string | null };
type Listener = (userId: string, patch: BadgePatch) => void;
const listeners = new Set<Listener>();

// Screens showing your own badge listen here and merge the new values.
export function onOwnBadgeChanged(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

async function reloadOwnBadge(userId: string): Promise<BadgePatch | null> {
  // '*' so a missing column can never break this read.
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error || !data) return null;
  return { verified: data.verified, is_authentic: data.is_authentic, verified_plan: data.verified_plan ?? null, verified_until: data.verified_until ?? null };
}

// Returns true when the server answered OK (and the badge fields were reloaded).
export async function refreshBilling(opts?: { force?: boolean }): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const uid = data.session?.user?.id;
  if (!token || !uid) return false;
  if (inFlight[uid]) return false;
  if (!opts?.force && Date.now() - (lastRun[uid] || 0) < MIN_GAP) return false;
  inFlight[uid] = true;
  lastRun[uid] = Date.now(); // set before the call, so a failing server is not hammered
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: '{}',
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.warn('[billing] refresh refused:', res.status);
      return false;
    }
  } catch (err) {
    console.warn('[billing] refresh failed:', err);
    return false;
  } finally {
    clearTimeout(timer);
    inFlight[uid] = false;
  }
  const patch = await reloadOwnBadge(uid);
  if (patch) listeners.forEach((cb) => cb(uid, patch));
  return true;
}

// Runs the refresh when the app opens (or the account changes) and each time
// it comes back to the foreground.
export function useBillingRefresh() {
  const { session } = useAuth();
  const uid = session?.user?.id;
  useEffect(() => {
    if (uid) refreshBilling();
  }, [uid]);
  useAppForeground(() => {
    if (uid) refreshBilling();
  });
}
