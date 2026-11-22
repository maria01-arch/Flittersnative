import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from './supabase';

let sharedChannel: any = null;
let sharedChannelUserId: string | null = null;
let currentOnlineIds = new Set<string>();
const listeners = new Set<(ids: Set<string>) => void>();
let retry = 0;
let retryTimer: any = null;
let appSub: any = null;
// "Show my active status" is off: this phone doesn't announce itself, and (like most apps) doesn't show others as active either.
let hidden = false;
let prefLoadedFor: string | null = null;

// Someone who drops off and comes back within a few seconds (weak network, phone
// switching wifi/data) used to flash offline -> online. Now a person only shows as
// offline after being gone for GRACE_MS in a row.
const GRACE_MS = 25000;
const lastSeenAt = new Map<string, number>();
let graceTimer: any = null;

function computeIds(channel: any) {
  if (hidden) return new Set<string>();
  const state = channel.presenceState();
  const now = Date.now();
  const live = new Set<string>();
  Object.values(state).forEach((arr: any) => {
    arr.forEach((p: any) => {
      if (p.user_id) {
        live.add(p.user_id);
        lastSeenAt.set(p.user_id, now);
      }
    });
  });
  const ids = new Set<string>(live);
  let pendingGrace = false;
  lastSeenAt.forEach((t, id) => {
    if (live.has(id)) return;
    if (now - t < GRACE_MS) {
      ids.add(id);
      pendingGrace = true;
    } else lastSeenAt.delete(id);
  });
  clearTimeout(graceTimer);
  if (pendingGrace) graceTimer = setTimeout(() => sharedChannel && publish(sharedChannel), 5000);
  return ids;
}

function publish(channel: any) {
  const next = computeIds(channel);
  // no change -> no re-render anywhere
  if (next.size === currentOnlineIds.size && [...next].every((i) => currentOnlineIds.has(i))) return;
  currentOnlineIds = next;
  listeners.forEach((cb) => cb(currentOnlineIds));
}

// (Re)builds the shared channel. On a weak connection the channel can drop
// without telling anyone; before, nothing brought it back, so that phone
// stopped showing as active (and stopped seeing others) until the app was
// restarted. Now it retries with a short back-off and re-announces itself
// whenever the app comes back to the screen.
function build(userId: string) {
  if (sharedChannel) {
    try { supabase.removeChannel(sharedChannel); } catch {}
    sharedChannel = null;
  }
  sharedChannelUserId = userId;
  const channel = supabase.channel('online_users', { config: { presence: { key: userId } } });
  channel.on('presence', { event: 'sync' }, () => publish(channel));
  channel.subscribe(async (status: string) => {
    if (sharedChannel !== channel) return;
    if (status === 'SUBSCRIBED') {
      retry = 0;
      if (prefLoadedFor !== userId) {
        try {
          const { data } = await supabase.from('profiles').select('show_active_status').eq('id', userId).maybeSingle();
          hidden = (data as any)?.show_active_status === false;
          prefLoadedFor = userId;
        } catch {}
      }
      if (!hidden) { try { await channel.track({ user_id: userId, online_at: new Date().toISOString() }); } catch {} }
      publish(channel);
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      clearTimeout(retryTimer);
      const delay = Math.min(1000 * 2 ** retry, 15000);
      retry += 1;
      retryTimer = setTimeout(() => {
        if (sharedChannelUserId === userId && AppState.currentState === 'active') build(userId);
      }, delay);
    }
  });
  sharedChannel = channel;
  if (!appSub) {
    appSub = AppState.addEventListener('change', (s) => {
      if (s !== 'active' || !sharedChannelUserId) return;
      const ch = sharedChannel;
      if (hidden && ch && ch.state === 'joined') return;
      if (ch && ch.state === 'joined') {
        ch.track({ user_id: sharedChannelUserId, online_at: new Date().toISOString() }).catch(() => build(sharedChannelUserId!));
      } else {
        build(sharedChannelUserId);
      }
    });
  }
  return channel;
}

function getSharedChannel(userId: string) {
  if (sharedChannel && sharedChannelUserId === userId) return sharedChannel;
  return build(userId);
}

export function useOnlinePresence(currentUserId?: string) {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(currentOnlineIds);

  useEffect(() => {
    if (!currentUserId) return;
    getSharedChannel(currentUserId);
    // Seed immediately with whatever the shared channel already knows —
    // otherwise a screen that mounts after the channel is already
    // connected has to wait for the next presence change to appear.
    setOnlineIds(new Set(currentOnlineIds));
    listeners.add(setOnlineIds);
    return () => {
      listeners.delete(setOnlineIds);
    };
  }, [currentUserId]);

  return onlineIds;
}

// Called from Settings > Privacy. Saves the choice and applies it right away.
export async function setActiveStatusVisible(userId: string, visible: boolean): Promise<{ error?: string }> {
  const { error } = await supabase.from('profiles').update({ show_active_status: visible }).eq('id', userId);
  if (error) return { error: error.message };
  hidden = !visible;
  prefLoadedFor = userId;
  const ch = sharedChannel;
  if (ch) {
    try {
      if (visible) await ch.track({ user_id: userId, online_at: new Date().toISOString() });
      else await ch.untrack();
    } catch {}
    publish(ch);
  }
  return {};
}
