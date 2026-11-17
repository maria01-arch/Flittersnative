import { supabase } from '../supabase';

// The servers a call needs to find its way between two phones. The call-ice function adds a relay
// (TURN) when you have set one up; the free STUN servers below are the fallback.
const FALLBACK = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

export async function fetchIceServers(): Promise<any[]> {
  try {
    const { data, error } = await supabase.functions.invoke('call-ice', { body: {} });
    if (!error && data && Array.isArray(data.iceServers) && data.iceServers.length) return data.iceServers;
  } catch {}
  return FALLBACK;
}
