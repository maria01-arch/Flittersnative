import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { supabase } from './supabase';
import { useAuth } from './AuthContext';
import { isViewingConversation, isViewingGroup } from './activeChatTracker';

// Expo Go dropped Android remote-notification support in SDK 53. The
// problem isn't just *calling* expo-notifications functions there — the
// native module throws as soon as the module itself is imported, at file
// load time, before a single line of our own code runs. That's why the
// previous fix (guarding calls like setNotificationHandler with an
// isExpoGo check) didn't actually work: the top-level
// `import * as Notifications from 'expo-notifications'` statement runs
// regardless of any check written further down the file.
//
// The real fix is to never let that static import exist at all. Instead,
// getNotifications() below lazily requires the module, and every call site
// checks isExpoGo and returns *before* ever calling getNotifications() —
// so in Expo Go, `require('expo-notifications')` is simply never reached.
//
// Constants.appOwnership alone isn't reliable either — it reports null in
// newer Expo Go builds instead of 'expo' — so this also checks
// executionEnvironment, which is the currently-recommended way to detect
// Expo Go specifically (as opposed to a real standalone/dev-client build).
const isExpoGo = Constants.appOwnership === 'expo' || (Constants.executionEnvironment as string) === 'storeClient';

let _notifications: typeof import('expo-notifications') | null = null;
function getNotifications() {
  if (!_notifications) {
    _notifications = require('expo-notifications');
  }
  return _notifications!;
}

if (!isExpoGo) {
  try {
    const Notifications = getNotifications();
    // How a notification should look while the app is in the foreground —
    // without this, foreground notifications are silent/hidden by default.
    Notifications.setNotificationHandler({
      handleNotification: async (notification: any) => {
        const data = notification.request.content.data as any;
        // Don't pop a foreground banner for a message in the exact
        // conversation/group you're already looking at — it was showing
        // every time regardless, which is just noise when you can already
        // see the message arrive in the thread itself.
        const alreadyViewing =
          (data?.type === 'message' && isViewingConversation(data?.conversationId)) ||
          (data?.type === 'group_message' && isViewingGroup(data?.groupId));
        return {
          shouldShowAlert: !alreadyViewing,
          shouldPlaySound: !alreadyViewing,
          shouldSetBadge: false,
        };
      },
    });
  } catch (err) {
    console.warn('[Push] setNotificationHandler failed:', err);
  }
}

// The Settings screen's Notifications row used to just say "coming soon" —
// this is the actual on/off switch backing it. Default is on (matches
// current behavior for everyone who never opens that screen).
const PUSH_PREF_KEY = 'push_notifications_enabled';

export async function isPushEnabled(): Promise<boolean> {
  const v = await AsyncStorage.getItem(PUSH_PREF_KEY);
  return v !== 'false';
}

export async function getNotificationPermission(): Promise<string> {
  if (isExpoGo) return 'undetermined';
  const { status } = await getNotifications().getPermissionsAsync();
  return status;
}

// Turning it on (re-)registers a token, same path as app boot. Turning it
// off removes this device's token so the send-push function stops finding
// it — the OS permission itself is left alone; that's controlled from the
// phone's own Settings, not from inside the app.
export async function setPushEnabled(userId: string | undefined, enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(PUSH_PREF_KEY, enabled ? 'true' : 'false');
  if (!userId) return;
  if (enabled) {
    await registerToken(userId);
  } else {
    const { error } = await supabase.from('push_tokens').delete().eq('user_id', userId).eq('platform', Platform.OS);
    if (error) console.error('[Push] failed to remove token:', error.message, error);
  }
}

async function registerToken(userId: string) {
  if (isExpoGo) {
    console.warn('[Push] skipping registration — remote push is unavailable in Expo Go since SDK 53. Build with EAS to test push.');
    return;
  }
  const Notifications = getNotifications();

  if (Platform.OS === 'android') {
    // Required on Android 8+ or notifications are silently dropped —
    // this is the channel Android actually delivers through, separate
    // from anything set on the sending side.
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    console.warn('[Push] permission not granted — notifications will not work on this device');
    return;
  }

  // Expo Go can't generate a real push token (no FCM credentials attached
  // to it) — this only produces a usable token in a real EAS build.
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    console.warn('[Push] no EAS projectId found in app.json — skipping token registration');
    return;
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { error } = await supabase
      .from('push_tokens')
      .upsert({ user_id: userId, token, platform: Platform.OS }, { onConflict: 'token' });
    if (error) console.error('[Push] failed to save token:', error.message, error);
  } catch (err) {
    console.error('[Push] getExpoPushTokenAsync failed:', err);
  }
}

// Routes to the right screen when a notification is tapped — the payload
// shape here must match whatever the sending Edge Function puts in `data`
// (see supabase/functions/send-push/index.ts).
function handleNotificationTap(data: any) {
  if (!data) return;
  console.log('[Push] handling tap, data:', JSON.stringify(data));
  if (data.type === 'message' && data.conversationId) {
    router.push({
      pathname: '/conversation/[id]',
      params: { id: data.conversationId, name: data.otherName || 'Chat', otherId: data.otherId, otherAvatar: data.otherAvatar || '' },
    });
  } else if (data.type === 'group_message' && data.groupId) {
    router.push({ pathname: '/groups/[id]', params: { id: data.groupId, name: data.groupName || 'Group' } });
  } else if (['like', 'repost', 'comment'].includes(data.type) && data.postId) {
    router.push(`/post/${data.postId}`);
  } else if (data.type === 'follow' && data.actorId) {
    router.push(`/user/${data.actorId}`);
  } else if (data.type === 'login_alert') {
    router.push('/settings');
  } else {
    router.push('/(tabs)/notifications');
  }
}

export function usePushNotifications() {
  const { session, initializing } = useAuth();
  const registeredFor = useRef<string | null>(null);
  const pendingTapData = useRef<any>(null);
  const [lastResponseChecked, setLastResponseChecked] = useState(false);

  useEffect(() => {
    if (!session?.user?.id || registeredFor.current === session.user.id) return;
    registeredFor.current = session.user.id;
    isPushEnabled().then((enabled) => {
      if (enabled) registerToken(session.user.id);
    });
  }, [session?.user?.id]);

  useEffect(() => {
    if (isExpoGo) {
      // Nothing to listen for — push can't arrive in Expo Go in the first
      // place — but this still has to resolve so the deferred cold-start
      // effect below doesn't wait on it forever.
      setLastResponseChecked(true);
      return;
    }
    const Notifications = getNotifications();
    // Cold-start: app was opened *by* tapping a notification. Capture the
    // data immediately so it isn't missed, but don't navigate yet — see
    // the effect below for why.
    Notifications.getLastNotificationResponseAsync().then((response: any) => {
      if (response) pendingTapData.current = response.notification.request.content.data;
      setLastResponseChecked(true);
    });

    // Warm: app was already running/backgrounded when the notification was
    // tapped — the navigator already exists in this case, so this one can
    // navigate immediately, no deferring needed.
    const subscription = Notifications.addNotificationResponseReceivedListener((response: any) => {
      handleNotificationTap(response.notification.request.content.data);
    });

    return () => subscription.remove();
  }, []);

  // The cold-start tap was landing on a blank screen because it navigated
  // too early: while `initializing` is true, RootLayoutNav renders just a
  // loading spinner — not the <Stack> — so a router.push() called during
  // that window has no navigator to act on and is silently dropped. This
  // waits until auth has actually resolved, then gives the Stack a moment
  // to mount before firing the deferred navigation.
  useEffect(() => {
    if (initializing || !lastResponseChecked || !pendingTapData.current) return;
    const data = pendingTapData.current;
    pendingTapData.current = null;
    const timeout = setTimeout(() => handleNotificationTap(data), 400);
    return () => clearTimeout(timeout);
  }, [initializing, lastResponseChecked]);
}
