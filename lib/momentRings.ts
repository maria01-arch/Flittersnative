import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Remembers who has a live moment (so a glowing ring can be drawn round their picture).
// Many pictures on one screen ask at once; this groups them into ONE database call.
type Ring = { unseen: boolean; at: number } | null;
const cache = new Map<string, { ring: Ring; fetchedAt: number }>();
const pending = new Set<string>();
const listeners = new Set<() => void>();
let timer: any = null;
const STALE_MS = 60 * 1000;

function notify() {
  listeners.forEach((l) => l());
}

async function flush() {
  timer = null;
  const ids = Array.from(pending).slice(0, 100);
  ids.forEach((i) => pending.delete(i));
  if (pending.size) timer = setTimeout(flush, 80);
  if (!ids.length) return;
  try {
    const { data, error } = await supabase.rpc('moment_rings', { p_ids: ids });
    if (error) return; // SQL not run yet or offline: just no rings
    const now = Date.now();
    const got = new Map<string, any>();
    (data || []).forEach((r: any) => got.set(r.user_id, r));
    ids.forEach((id) => {
      const r = got.get(id);
      cache.set(id, { ring: r ? { unseen: !!r.unseen, at: now } : null, fetchedAt: now });
    });
    notify();
  } catch {}
}

export function ringFor(id?: string | null): Ring {
  return id ? cache.get(id)?.ring ?? null : null;
}

export function requestRing(id?: string | null) {
  if (!id) return;
  const c = cache.get(id);
  if (c && Date.now() - c.fetchedAt < STALE_MS) return;
  pending.add(id);
  if (!timer) timer = setTimeout(flush, 80);
}

// Call after posting, deleting or watching a moment so rings update right away.
export function refreshRings(id?: string) {
  if (id) cache.delete(id);
  else cache.clear();
  notify();
}

// The feed row already knows who has a moment and whether it is unseen: use that at once.
export function seedRing(id: string, unseen: boolean) {
  const now = Date.now();
  cache.set(id, { ring: { unseen, at: now }, fetchedAt: now });
  notify();
}

export function markSeenLocal(id: string, allSeen: boolean) {
  const c = cache.get(id);
  if (c?.ring) cache.set(id, { ...c, ring: { ...c.ring, unseen: !allSeen } });
  notify();
}

export function useRing(id?: string | null): Ring {
  const [, setV] = useState(0);
  useEffect(() => {
    const l = () => setV((v) => v + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  useEffect(() => {
    requestRing(id);
  });
  return ringFor(id);
}

// Lets screens (the feed row) know a moment was added or removed.
const feedListeners = new Set<() => void>();
export function onMomentsChanged(fn: () => void) {
  feedListeners.add(fn);
  return () => {
    feedListeners.delete(fn);
  };
}
export function momentsChanged() {
  refreshRings();
  feedListeners.forEach((f) => f());
}
