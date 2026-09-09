import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

let sharedChannel: any = null;
let sharedChannelUserId: string | null = null;
let currentOnlineIds = new Set<string>();
const listeners = new Set<(ids: Set<string>) => void>();

function computeIds(channel: any) {
  const state = channel.presenceState();
  const ids = new Set<string>();
  Object.values(state).forEach((arr: any) => {
    arr.forEach((p: any) => {
      if (p.user_id) ids.add(p.user_id);
    });
  });
  return ids;
}

function getSharedChannel(userId: string) {
  if (sharedChannel && sharedChannelUserId === userId) return sharedChannel;
  if (sharedChannel) {
    supabase.removeChannel(sharedChannel);
    sharedChannel = null;
  }
  sharedChannelUserId = userId;
  const channel = supabase.channel('online_users');
  channel.on('presence', { event: 'sync' }, () => {
    currentOnlineIds = computeIds(channel);
    listeners.forEach((cb) => cb(currentOnlineIds));
  });
  channel.subscribe(async (status: string) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({ user_id: userId, online_at: new Date().toISOString() });
      currentOnlineIds = computeIds(channel);
      listeners.forEach((cb) => cb(currentOnlineIds));
    }
  });
  sharedChannel = channel;
  return channel;
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
