import { supabase } from './supabase';

export type Permission = 'everyone' | 'following' | 'nobody';

// "following" means: only people the OWNER follows may act on their
// content/DMs — e.g. if Alice sets who_can_comment to "following", only
// people Alice follows can comment on Alice's posts. That's the direction
// that actually matches "who can do X to me" being something the owner
// controls, rather than depending on who follows the owner.
export async function ownerFollows(ownerId: string, otherId: string): Promise<boolean> {
  if (ownerId === otherId) return true;
  const { data } = await supabase.from('follows').select('id').eq('follower_id', ownerId).eq('following_id', otherId).maybeSingle();
  return !!data;
}

export async function canPerform(permission: Permission | null | undefined, ownerId: string, actorId: string | undefined | null): Promise<boolean> {
  if (!actorId) return false;
  if (ownerId === actorId) return true; // you can always act on your own content
  const perm = permission || 'everyone';
  if (perm === 'everyone') return true;
  if (perm === 'nobody') return false;
  return ownerFollows(ownerId, actorId);
}

const PERMISSION_LABEL: Record<Permission, string> = {
  everyone: 'everyone',
  following: 'people they follow',
  nobody: 'no one',
};

export function permissionDeniedMessage(action: string, permission: Permission | null | undefined): string {
  const perm = permission || 'everyone';
  return `This person has limited ${action} to ${PERMISSION_LABEL[perm]}.`;
}
