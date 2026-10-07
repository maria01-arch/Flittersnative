import { supabase } from './supabase';

// Kept as its own table, entirely separate from `follows` — a request only
// ever becomes a real `follows` row once accepted, so nothing about what a
// row in `follows` means changes anywhere else in the app (or the webapp,
// which shares this database and already has its own queries against
// `follows` that assume every row is a real, active follow).
export async function sendFollowRequest(requesterId: string, targetId: string) {
  return supabase.from('follow_requests').insert({ requester_id: requesterId, target_id: targetId });
}

export async function cancelFollowRequest(requesterId: string, targetId: string) {
  return supabase.from('follow_requests').delete().eq('requester_id', requesterId).eq('target_id', targetId);
}

export async function hasPendingRequest(requesterId: string, targetId: string): Promise<boolean> {
  const { data } = await supabase.from('follow_requests').select('id').eq('requester_id', requesterId).eq('target_id', targetId).maybeSingle();
  return !!data;
}

export async function acceptFollowRequest(requesterId: string, targetId: string) {
  // Becomes a real follow the moment it's accepted — same insert the
  // ordinary (non-private) follow button already does.
  await supabase.from('follows').insert({ follower_id: requesterId, following_id: targetId });
  await supabase.from('follow_requests').delete().eq('requester_id', requesterId).eq('target_id', targetId);
  await supabase.from('notifications').insert({ user_id: requesterId, actor_id: targetId, type: 'follow' });
}

export async function declineFollowRequest(requesterId: string, targetId: string) {
  await supabase.from('follow_requests').delete().eq('requester_id', requesterId).eq('target_id', targetId);
}
