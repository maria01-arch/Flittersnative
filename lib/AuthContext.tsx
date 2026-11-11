import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Platform } from 'react-native';
import { Session, isAuthRetryableFetchError } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { getApproxPlace, getDeviceName, placeLabel } from './approxLocation';
import { isAccountSwitchInProgress, upsertStoredAccount } from './accounts';

// A simple, honest log of sign-ins — not a remote-session manager. We
// don't have a backend beyond Supabase's own client SDK, so there's no
// safe way from inside the app to list or revoke *other* devices' actual
// auth sessions (that needs the service-role key, which never belongs in
// a client app). What we can do, and what this is, is record every real
// sign-in so a person can see "where you've logged in" as a history —
// useful for spotting something they don't recognize, even though acting
// on it means changing their password (which does invalidate other
// sessions), not a per-row "sign this device out" button.
//
// The place is only APPROXIMATE (city/country from the internet connection)
// and never asks for location permission. The device name comes from the
// phone itself. If either is unavailable the login is still recorded.
async function recordLogin(userId: string) {
  try {
    const location = await getApproxPlace();
    const deviceName = getDeviceName();

    // Was this account ever seen before from roughly this platform+city?
    // If there's no history at all, this is the very first login right
    // after signup — nothing to compare against, and alerting on your own
    // brand-new account would just be noise, so that case is skipped.
    const { data: priorRows } = await supabase
      .from('login_history')
      .select('platform,city')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(25);
    const isFirstEver = !priorRows || priorRows.length === 0;
    const seenBefore = (priorRows || []).some((r: any) => r.platform === Platform.OS && (!location?.city || r.city === location.city));

    const row: any = {
      user_id: userId,
      platform: Platform.OS,
      city: location?.city ?? null,
      region: location?.region ?? null,
      country: location?.country ?? null,
      device_name: deviceName,
    };
    let { error: insErr } = await supabase.from('login_history').insert(row);
    // The new columns may not exist yet (SQL not run): save the old shape.
    if (insErr) {
      delete row.country;
      delete row.device_name;
      await supabase.from('login_history').insert(row);
    }

    if (!isFirstEver && !seenBefore) {
      // A row in `notifications` with type 'login_alert' is picked up by
      // the existing send-push Database Webhook the same way a like or
      // follow is — see supabase/functions/send-push/index.ts, which has
      // a dedicated branch for this type since (unlike a like or follow)
      // there's no other person's name to put in the message.
      const locationLabel = location ? placeLabel(location) : null;
      await supabase.from('notifications').insert({
        user_id: userId,
        actor_id: userId,
        type: 'login_alert',
        meta_platform: Platform.OS,
        meta_location: locationLabel,
      });
    }
  } catch (err) {
    console.warn('[Auth] failed to record login history:', err);
  }
}

// Keeps the account switcher's stored copy of this account current. Tokens
// need updating on EVERY refresh (see lib/accounts.ts for why); the full
// profile snapshot only needs refreshing at genuine sign-in time — it's
// just for showing a name/avatar in the switcher list, not anything that
// needs to be second-old-fresh.
async function syncStoredAccountTokens(session: Session) {
  if (!session.user?.id) return;
  try {
    await upsertStoredAccount({ userId: session.user.id, accessToken: session.access_token, refreshToken: session.refresh_token });
  } catch (err) {
    console.warn('[Auth] failed to sync stored account tokens:', err);
  }
}

async function syncStoredAccountProfile(session: Session) {
  if (!session.user?.id) return;
  try {
    const { data: profile } = await supabase.from('profiles').select('display_name,username,avatar_url').eq('id', session.user.id).single();
    await upsertStoredAccount({
      userId: session.user.id,
      email: session.user.email || '',
      displayName: profile?.display_name || '',
      username: profile?.username || '',
      avatarUrl: profile?.avatar_url || null,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
    });
  } catch (err) {
    console.warn('[Auth] failed to sync stored account profile:', err);
  }
}

// Where the Supabase client keeps the saved login ('sb-<project>-auth-token').
const AUTH_STORAGE_KEY = 'sb-xxsfkjhfixognmnzixie-auth-token';

async function readStoredSession(): Promise<Session | null> {
  try {
    const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s?.refresh_token && s?.user ? (s as Session) : null;
  } catch {
    return null;
  }
}

const looksLikeNetwork = (e: any) => /network|fetch|timeout|timed out|abort|connection|dns|resolve/i.test(String(e?.message || ''));

type AuthContextType = {
  session: Session | null;
  initializing: boolean;
};

const AuthContext = createContext<AuthContextType>({ session: null, initializing: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // True while the saved login is being used even though its short-lived
    // token could not be renewed yet (weak or no connection).
    let recovering = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    // Keeps trying to renew the token (2s, 4s, 8s ... up to every 30s).
    const startRetry = (refreshToken: string) => {
      let delay = 2000;
      const attempt = async () => {
        if (cancelled || !recovering) return;
        try {
          const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
          if (cancelled) return;
          if (data?.session) return; // onAuthStateChange puts the fresh session in
          if (error && !isAuthRetryableFetchError(error) && !looksLikeNetwork(error)) {
            // The server really refused this login (revoked / changed password).
            recovering = false;
            setSession(null);
            return;
          }
        } catch {
          // network trouble: try again below
        }
        delay = Math.min(delay * 2, 30000);
        retryTimer = setTimeout(attempt, delay);
      };
      retryTimer = setTimeout(attempt, delay);
    };

    supabase.auth.getSession().then(async ({ data, error }) => {
      if (cancelled) return;
      if (!data.session && error && (isAuthRetryableFetchError(error) || looksLikeNetwork(error))) {
        // The saved login could not be renewed because the connection is bad.
        // That is NOT being logged out: stay signed in and keep retrying.
        const stored = await readStoredSession();
        if (stored && !cancelled) {
          recovering = true;
          setSession(stored);
          setInitializing(false);
          startRetry(stored.refresh_token);
          return;
        }
      }
      setSession(data.session);
      supabase.realtime.setAuth(data.session?.access_token ?? null);
      setInitializing(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (recovering) {
        // Ignore "no session" reports while waiting for the connection, except a real sign-out.
        if (!newSession && event !== 'SIGNED_OUT') return;
        recovering = false;
        if (retryTimer) clearTimeout(retryTimer);
      }
      setSession(newSession);
      // Keep the Realtime websocket's auth token in sync with the current
      // session — without this, Realtime silently stops working once the
      // original login token expires (roughly every hour), even though
      // the rest of the app keeps functioning normally.
      supabase.realtime.setAuth(newSession?.access_token ?? null);

      if (newSession && event === 'SIGNED_IN') syncStoredAccountProfile(newSession);
      else if (newSession && event === 'TOKEN_REFRESHED') syncStoredAccountTokens(newSession);

      // Only a real, fresh sign-in — not the token-refresh events that
      // fire silently in the background every hour, and not switching
      // back to an account already known on this device — should show up
      // in the login history or trigger a new-device alert about itself.
      if (event === 'SIGNED_IN' && newSession?.user?.id && !isAccountSwitchInProgress()) recordLogin(newSession.user.id);
    });

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      listener.subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ session, initializing }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
