import { SITE_URL } from '@/lib/siteConfig';
import { supabase } from './supabase';

// Same address the webapp's invite links use, so a link copied in either
// app works in the other (and in a browser).
export const groupInviteLink = (tag: string) => `${SITE_URL}/join/${tag}`;

// Accepts a full invite link, "@tag", or just "tag" and returns the tag.
export function parseGroupTag(input: string): string {
  const trimmed = input.trim();
  const fromLink = /\/join\/([^/?#\s]+)/i.exec(trimmed);
  const tag = (fromLink ? fromLink[1] : trimmed).replace(/^@/, '');
  return tag.trim();
}

export type JoinState = 'member' | 'pending' | 'open' | 'request';

// Where does this person stand with this group right now?
export async function getJoinState(group: any, userId: string): Promise<JoinState> {
  const { data: member } = await supabase.from('group_members').select('user_id').eq('group_id', group.id).eq('user_id', userId).maybeSingle();
  if (member) return 'member';
  if (group.join_mode === 'open') return 'open';
  const { data: req } = await supabase.from('group_join_requests').select('status').eq('group_id', group.id).eq('user_id', userId).maybeSingle();
  if (req?.status === 'pending') return 'pending';
  return 'request';
}

// Open group → join straight away. Approval group → file a pending request
// (or revive an old rejected one) for an admin to accept in group settings.
export async function joinOrRequest(group: any, userId: string): Promise<{ error?: string; state?: JoinState }> {
  if (group.join_mode === 'open') {
    const { error } = await supabase.from('group_members').insert({ group_id: group.id, user_id: userId, role: 'member' });
    if (error && !/duplicate/i.test(error.message)) return { error: error.message };
    return { state: 'member' };
  }
  const { data: existing } = await supabase.from('group_join_requests').select('id,status').eq('group_id', group.id).eq('user_id', userId).maybeSingle();
  if (existing) {
    if (existing.status === 'pending') return { state: 'pending' };
    const { error } = await supabase.from('group_join_requests').update({ status: 'pending' }).eq('id', existing.id);
    if (error) return { error: error.message };
    return { state: 'pending' };
  }
  const { error } = await supabase.from('group_join_requests').insert({ group_id: group.id, user_id: userId, status: 'pending' });
  if (error) return { error: error.message };
  return { state: 'pending' };
}

// Admin accepts a request: mark it accepted AND add the person as a member.
export async function acceptJoinRequest(req: any, groupId: string): Promise<{ error?: string }> {
  const { error: addErr } = await supabase.from('group_members').insert({ group_id: groupId, user_id: req.user_id, role: 'member' });
  if (addErr && !/duplicate/i.test(addErr.message)) return { error: addErr.message };
  await supabase.from('group_join_requests').update({ status: 'accepted' }).eq('id', req.id);
  return {};
}

export async function rejectJoinRequest(req: any): Promise<{ error?: string }> {
  const { error } = await supabase.from('group_join_requests').update({ status: 'rejected' }).eq('id', req.id);
  return error ? { error: error.message } : {};
}

// Admin adds someone directly, no request needed.
export async function addMemberDirect(groupId: string, userId: string): Promise<{ error?: string }> {
  // Some people only let people they follow add them to groups (Settings > Privacy).
  const { data: blocked } = await supabase.rpc('group_add_blocked', { p_users: [userId] });
  if (Array.isArray(blocked) && blocked.includes(userId)) return { error: "This person only lets people they follow add them to groups. Send them the group link instead." };
  const { error } = await supabase.from('group_members').insert({ group_id: groupId, user_id: userId, role: 'member' });
  if (error && !/duplicate/i.test(error.message)) return { error: error.message };
  await supabase.from('group_join_requests').update({ status: 'accepted' }).eq('group_id', groupId).eq('user_id', userId).eq('status', 'pending');
  return {};
}
