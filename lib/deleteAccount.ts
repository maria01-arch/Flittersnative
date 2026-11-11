import { SITE_URL } from '@/lib/siteConfig';
import { supabase } from './supabase';
import { getStoredAccounts, removeStoredAccount, switchToAccount } from './accounts';

// Same server the app already uses for uploads and the AI chat. The route
// verifies the Bearer token, deletes the person's data and then the auth
// user itself (that last step needs the service-role key, which can never
// live inside a client app — so it has to happen on the server).
const DELETE_URL = SITE_URL + '/api/delete-account';

export type DeleteResult = { error?: string; switchedToOther?: boolean };

export async function deleteMyAccount(): Promise<DeleteResult> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return { error: 'You are not signed in.' };

  let res: Response;
  try {
    res = await fetch(DELETE_URL, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } });
  } catch (err) {
    console.warn('[DeleteAccount] network error:', err);
    return { error: "Couldn't reach the server. Check your connection and try again." };
  }

  if (!res.ok) {
    // The server's own message can mention internal config, so it's only
    // logged here — the person just sees a plain, safe message.
    let detail = '';
    try {
      detail = (await res.json())?.error || '';
    } catch {}
    console.warn('[DeleteAccount] server refused:', res.status, detail);
    return { error: `We couldn't delete your account right now (error ${res.status}). Please try again in a moment.` };
  }

  // Server side is done. Clean up this device: forget the account in the
  // switcher, then either hand off to another saved account or sign out.
  await removeStoredAccount(session.user.id);
  const remaining = await getStoredAccounts();
  if (remaining.length > 0) {
    const { error } = await switchToAccount(remaining[0].userId, { skipPersist: true });
    if (!error) return { switchedToOther: true };
  }
  // scope 'local' because the account no longer exists on the server —
  // there's no remote session left to revoke.
  await supabase.auth.signOut({ scope: 'local' });
  return {};
}
