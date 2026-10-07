import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// Supabase's client is built around one active session at a time — there's
// no built-in "multiple logged-in accounts" concept. This layers that on
// top: every account you've ever added on this device gets its own stored
// access/refresh token pair, and "switching" is just calling
// supabase.auth.setSession() with a different pair. The same client
// instance, the same app, the same everything else — nothing downstream
// needs to know accounts even exist, since setSession() fires the same
// SIGNED_IN event a normal login does, and every screen already reacts to
// session.user.id changing.
//
// The one thing that needs real care: Supabase rotates refresh tokens —
// each time one gets used to refresh a session, the old one stops working
// and a new one is issued. So a stored account's tokens have to be kept
// current every time THAT account is the active one and its session
// refreshes, or its stored copy goes stale and switching back to it later
// fails. See AuthContext, which calls upsertStoredAccount on every
// SIGNED_IN and TOKEN_REFRESHED event, not just at explicit add/switch time.
const ACCOUNTS_KEY = 'flitters_accounts';

export type StoredAccount = {
  userId: string;
  email: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken: string;
};

// A brief, module-level (not persisted) flag so AuthContext can tell "this
// SIGNED_IN event is us resuming an already-known account on this device"
// apart from "this is a genuine fresh login" — the former shouldn't log a
// new login_history row or trigger a new-device alert about itself.
let switching = false;
export function isAccountSwitchInProgress() {
  return switching;
}

// True while the login/signup screens are open on purpose to ADD another
// account. The root layout normally sends any signed-in user away from
// those screens (there's no reason for a signed-in person to see them),
// which is exactly what made "Add another account" bounce straight back
// to the feed. Not persisted, and cleared by login/signup when they close.
let addingAccountMode = false;
export function isAddingAccountMode() {
  return addingAccountMode;
}
export function setAddingAccountMode(value: boolean) {
  addingAccountMode = value;
}

export async function getStoredAccounts(): Promise<StoredAccount[]> {
  try {
    const raw = await AsyncStorage.getItem(ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn('[Accounts] failed to read stored accounts:', err);
    return [];
  }
}

async function setStoredAccounts(accounts: StoredAccount[]) {
  await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

// Upsert by userId. Called two ways: with full profile details at genuine
// sign-in time (see AuthContext), and with just refreshed tokens on every
// subsequent token refresh — the latter never overwrites the cached
// profile fields with blanks, it only ever adds/updates what it's given.
export async function upsertStoredAccount(
  partial: Partial<StoredAccount> & { userId: string; accessToken: string; refreshToken: string }
) {
  const accounts = await getStoredAccounts();
  const idx = accounts.findIndex((a) => a.userId === partial.userId);
  if (idx >= 0) {
    accounts[idx] = { ...accounts[idx], ...partial };
  } else {
    accounts.push({ email: '', displayName: '', username: '', avatarUrl: null, ...partial } as StoredAccount);
  }
  await setStoredAccounts(accounts);
}

export async function removeStoredAccount(userId: string) {
  const accounts = await getStoredAccounts();
  await setStoredAccounts(accounts.filter((a) => a.userId !== userId));
}

// Saves whatever session is CURRENTLY active (if any) — used right before
// switching away from it, so its latest tokens aren't lost the moment
// setSession() replaces the client's active session with the next account.
export async function persistCurrentSession() {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session?.user?.id) return;
  const accounts = await getStoredAccounts();
  const existing = accounts.find((a) => a.userId === session.user.id);
  // An account restored from a previous app launch never went through a
  // fresh SIGNED_IN, so it may have no name/avatar cached yet — fetch them
  // now so the switcher shows a real name instead of just an email.
  let profile: any = null;
  if (!existing?.displayName) {
    const { data: p } = await supabase.from('profiles').select('display_name,username,avatar_url').eq('id', session.user.id).single();
    profile = p;
  }
  await upsertStoredAccount({
    userId: session.user.id,
    email: session.user.email || existing?.email || '',
    displayName: profile?.display_name || existing?.displayName || '',
    username: profile?.username || existing?.username || '',
    avatarUrl: profile?.avatar_url ?? existing?.avatarUrl ?? null,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
  });
}

export async function switchToAccount(userId: string): Promise<{ error?: string }> {
  const accounts = await getStoredAccounts();
  const target = accounts.find((a) => a.userId === userId);
  if (!target) return { error: 'That account is no longer saved on this device.' };

  switching = true;
  try {
    await persistCurrentSession();
    const { error } = await supabase.auth.setSession({ access_token: target.accessToken, refresh_token: target.refreshToken });
    if (error) {
      // The stored refresh token doesn't work anymore — expired, or
      // rotated away by a sign-in elsewhere. A broken entry sitting in
      // the switcher is worse than no entry, so this drops it rather
      // than leaving something that will fail the same way every time.
      await removeStoredAccount(userId);
      return { error: 'This account needs you to log in again.' };
    }
    return {};
  } finally {
    switching = false;
  }
}
