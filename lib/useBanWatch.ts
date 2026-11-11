import { useCallback, useEffect, useRef } from 'react';
import { supabase } from './supabase';
import { useAuth } from './AuthContext';
import { useAppForeground } from './useAppForeground';
import { fetchMyBanStatus, setPendingBan } from './banInfo';
import { unregisterPushToken } from './usePushNotifications';
import { removeStoredAccount } from './accounts';

// Signs a banned person out of this phone right away. Checks when the app
// opens, every 5 minutes while it is open, and when it comes back from the
// background. The login screen then shows the ban page.
export function useBanWatch() {
  const { session } = useAuth();
  const uid = session?.user?.id;
  const email = session?.user?.email || '';
  const busy = useRef(false);

  const check = useCallback(async () => {
    if (!uid || busy.current) return;
    busy.current = true;
    try {
      const info = await fetchMyBanStatus();
      if (!info?.banned) return;
      setPendingBan(email, info);
      await unregisterPushToken(uid).catch(() => {});
      await removeStoredAccount(uid).catch(() => {});
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // try again on the next check
    } finally {
      busy.current = false;
    }
  }, [uid, email]);

  useEffect(() => {
    if (!uid) return;
    check();
    const t = setInterval(check, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [uid, check]);

  useAppForeground(check);
}
