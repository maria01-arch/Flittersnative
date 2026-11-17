import { supabase } from './supabase';

// Chat streaks (07_chat_streaks.sql). Both people message in a chat on the
// same day (UTC), day after day. Miss a whole day and it starts over.
export const REWARD_DAYS = 30;
export type Streak = { conversation_id: string; other_id: string; streak: number; best: number; at_risk: boolean; me_today: boolean; them_today: boolean };

export async function fetchStreaks(conversationId?: string): Promise<Streak[]> {
  const { data, error } = await supabase.rpc('my_streaks', { p_conv: conversationId ?? null });
  if (error || !data) return [];
  return data as Streak[];
}

export async function hasLiveCoverReward(userId?: string | null): Promise<boolean> {
  if (!userId) return false;
  const { data } = await supabase.from('streak_rewards').select('reward').eq('user_id', userId).eq('reward', 'live_cover').maybeSingle();
  return !!data;
}

// "Send a message today to keep it" / "waiting for Sam" for the chat header.
export function streakHint(s: Streak, otherName: string): string {
  if (s.streak <= 0) return '';
  if (s.me_today && s.them_today) return 'Kept for today';
  if (s.me_today) return `Waiting for ${otherName} to reply today`;
  if (s.them_today) return 'Reply today to keep it going';
  return s.at_risk ? 'Message each other today to keep it' : '';
}
