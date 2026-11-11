import { supabase } from './supabase';

// A banned person cannot sign in, so there is no session to read anything
// with. These two database functions check the email + password themselves
// and answer only for the right person (see ban.sql).
export type BanInfo = {
  banned: boolean;
  permanent?: boolean;
  bannedUntil?: string | null;
  reason?: string | null;
  appealStatus?: 'pending' | 'approved' | 'rejected' | null;
  appealNote?: string | null;
};

function parseBan(d: any): BanInfo | null {
  if (!d || d.ok !== true) return null;
  return {
    banned: !!d.banned,
    permanent: !!d.permanent,
    bannedUntil: d.banned_until || null,
    reason: d.reason || null,
    appealStatus: d.appeal_status || null,
    appealNote: d.appeal_note || null,
  };
}

// null = could not find out (functions not installed yet, or no connection).
export async function fetchBanInfo(email: string, password: string): Promise<BanInfo | null> {
  try {
    const { data, error } = await supabase.rpc('ban_info', { p_email: email.trim(), p_password: password });
    return error ? null : parseBan(data);
  } catch {
    return null;
  }
}

// For someone who is signed in right now: am I banned?
export async function fetchMyBanStatus(): Promise<BanInfo | null> {
  try {
    const { data, error } = await supabase.rpc('my_ban_status');
    return error ? null : parseBan(data);
  } catch {
    return null;
  }
}

// When a signed-in person gets banned, the app signs them out and keeps the
// ban details here so the login screen can show the ban page right away.
let pending: { email: string; info: BanInfo } | null = null;
export const setPendingBan = (email: string, info: BanInfo) => {
  pending = { email, info };
};
export const hasPendingBan = () => !!pending;
export const takePendingBan = () => {
  const p = pending;
  pending = null;
  return p;
};

export async function sendAppeal(email: string, password: string, message: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('submit_appeal', { p_email: email.trim(), p_password: password, p_message: message });
    if (error) return { ok: false, error: 'network' };
    const d: any = data;
    return d?.ok ? { ok: true } : { ok: false, error: d?.error || 'failed' };
  } catch {
    return { ok: false, error: 'network' };
  }
}

// "5 days left", "less than a day left"
export function timeLeftText(untilIso?: string | null): string {
  if (!untilIso) return '';
  const ms = new Date(untilIso).getTime() - Date.now();
  if (ms <= 0) return 'ending now';
  const days = Math.ceil(ms / 86400000);
  if (ms < 86400000) return 'less than a day left';
  return `${days} ${days === 1 ? 'day' : 'days'} left`;
}
