import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { supabase } from './supabase';
import { useAuth } from './AuthContext';
import { isViewingConversation, isViewingGroup, dismissActiveChatNotifications } from './activeChatTracker';
import { useAppForeground } from './useAppForeground';
import { switchToAccount } from './accounts';
import { performNotificationAction } from './notificationButtons';
import { checkForRingingCall } from './calls/callManager';
// Registers the closed-app notification task (see lib/pushTask.ts).
import './pushTask';

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
        // A ringing call while the app is open is shown by the call screen itself.
        const inApp = data?.type === 'incoming_call';
        return {
          shouldShowAlert: !alreadyViewing && !inApp,
          shouldPlaySound: !alreadyViewing && !inApp,
          shouldSetBadge: false,
        };
      },
    });
    // Buttons under notifications: Reply (with a small text box) on chat
    // messages, Like and Repost on new-post alerts. The server picks the
    // set by sending "categoryId" (see supabase/functions/send-push).
    Notifications.setNotificationCategoryAsync('chat_reply', [
      {
        identifier: 'reply',
        buttonTitle: 'Reply',
        textInput: { submitButtonTitle: 'Send', placeholder: 'Write a reply...' },
        options: { opensAppToForeground: false },
      },
    ]).catch(() => {});
    Notifications.setNotificationCategoryAsync('post_actions', [
      { identifier: 'like', buttonTitle: 'Like', options: { opensAppToForeground: false } },
      { identifier: 'repost', buttonTitle: 'Repost', options: { opensAppToForeground: false } },
    ]).catch(() => {});
  } catch (err) {
    console.warn('[Push] setNotificationHandler failed:', err);
  }
}

// Who is signed in right now (kept up to date by usePushNotifications) —
// read here instead of asking Supabase, which could stall a tap while it
// refreshed an expired login over a slow connection.
let currentUserId: string | null = null;

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

// Removes THIS device's token for that account. Called on sign-out so a
// logged-out phone stops receiving the old account's notifications. Must run
// while the session is still valid (the delete is permission-checked).
export async function unregisterPushToken(userId: string): Promise<void> {
  if (isExpoGo) return;
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return;
    const { data: token } = await getNotifications().getExpoPushTokenAsync({ projectId });
    const { error } = await supabase.from('push_tokens').delete().eq('user_id', userId).eq('token', token);
    if (error) console.warn('[Push] failed to unregister token:', error.message);
  } catch (err) {
    console.warn('[Push] unregisterPushToken failed:', err);
  }
}

// Returns null when this phone is registered, otherwise a plain-language
// reason it isn't (shown in Settings, so there's no guessing).
async function registerToken(userId: string): Promise<string | null> {
  if (isExpoGo) {
    console.warn('[Push] skipping registration — remote push is unavailable in Expo Go since SDK 53. Build with EAS to test push.');
    return "Push notifications don't work in Expo Go. Use the installed app (an EAS build).";
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
    // The Flitters channel: same as above but with the app's own soft sound.
    // (A channel's sound can't be changed once it exists, so this is a new
    // channel; the push function sends to it by this name.)
    // Incoming calls: loud, with the call ringtone and a long vibration.
    try {
      await Notifications.setNotificationChannelAsync('calls', {
        name: 'Calls',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 700, 500, 700, 500, 700],
        sound: 'ringtone.wav',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    } catch (err) {
      console.warn('[Push] could not create the Calls channel:', err);
    }
    try {
      await Notifications.setNotificationChannelAsync('flitters', {
        name: 'Flitters',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 200, 150, 200],
        sound: 'flit.wav',
      });
    } catch (err) {
      console.warn('[Push] could not create the Flitters channel:', err);
    }
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    console.warn('[Push] permission not granted — notifications will not work on this device');
    return "Notifications aren't allowed for this app. Allow them in your phone's Settings, Apps, Flitters, Notifications.";
  }

  // Expo Go can't generate a real push token (no FCM credentials attached
  // to it) — this only produces a usable token in a real EAS build.
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    console.warn('[Push] no EAS projectId found in app.json — skipping token registration');
    return 'This build has no project id, so it cannot register for push.';
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { error } = await supabase
      .from('push_tokens')
      .upsert({ user_id: userId, token, platform: Platform.OS }, { onConflict: 'user_id,token' });
    if (error) {
      console.error('[Push] failed to save token:', error.message, error);
      return `Could not save this phone's token: ${error.message}`;
    }
    return null;
  } catch (err) {
    console.error('[Push] getExpoPushTokenAsync failed:', err);
    return `Could not get a push token: ${String((err as any)?.message || err)}`;
  }
}

// For Settings: registers this phone right now and says whether it worked.
export async function registerPushNow(userId: string): Promise<{ ok: boolean; text: string }> {
  await AsyncStorage.setItem(PUSH_PREF_KEY, 'true');
  const problem = await registerToken(userId);
  return problem ? { ok: false, text: problem } : { ok: true, text: 'This phone is registered for notifications.' };
}

// For Settings: is THIS phone currently in the push_tokens table?
export async function getPushStatus(userId?: string): Promise<{ ok: boolean; text: string }> {
  if (isExpoGo) return { ok: false, text: "Push notifications don't work in Expo Go. Use the installed app (an EAS build)." };
  if (!(await isPushEnabled())) return { ok: false, text: 'Switched off in this app.' };
  if ((await getNotificationPermission()) !== 'granted') return { ok: false, text: "Notifications aren't allowed for this app in your phone's settings." };
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!userId || !projectId) return { ok: false, text: 'Not signed in, or this build has no project id.' };
  try {
    const { data: token } = await getNotifications().getExpoPushTokenAsync({ projectId });
    const { data } = await supabase.from('push_tokens').select('token').eq('user_id', userId).eq('token', token).maybeSingle();
    return data ? { ok: true, text: 'This phone is registered for notifications.' } : { ok: false, text: 'This phone is NOT registered yet.' };
  } catch (err) {
    return { ok: false, text: `Could not check: ${String((err as any)?.message || err)}` };
  }
}

// Routes to the right screen when a notification is tapped — the payload
// shape here must match whatever the sending Edge Function puts in `data`
// (see supabase/functions/send-push/index.ts).
async function handleNotificationTap(data: any) {
  if (!data) return;
  // A notification for ANOTHER account on this phone: switch to that account
  // first, then open the screen it points to.
  if (data.toUserId && currentUserId && currentUserId !== data.toUserId) {
    const { error } = await switchToAccount(data.toUserId);
    if (error) {
      console.warn('[Push] could not switch account for notification:', error);
      router.push('/switch-account');
      return;
    }
  }
  console.log('[Push] handling tap, data:', JSON.stringify(data));
  if (data.type === 'incoming_call') {
    // Open the call screen if it is still ringing.
    const ringing = await checkForRingingCall();
    if (!ringing) router.push('/(tabs)/messages');
    return;
  }
  if (data.type === 'missed_call' && data.conversationId) {
    router.push({ pathname: '/conversation/[id]', params: { id: data.conversationId, name: data.otherName || 'Chat', otherId: data.otherId, otherAvatar: data.otherAvatar || '' } });
    return;
  }
  if (data.type === 'message' && data.conversationId) {
    router.push({
      pathname: '/conversation/[id]',
      params: { id: data.conversationId, name: data.otherName || 'Chat', otherId: data.otherId, otherAvatar: data.otherAvatar || '' },
    });
  } else if (data.type === 'group_message' && data.groupId) {
    router.push({ pathname: '/groups/[id]', params: { id: data.groupId, name: data.groupName || 'Group' } });
  } else if (['like', 'repost', 'comment', 'new_post'].includes(data.type) && data.postId) {
    router.push(`/post/${data.postId}`);
  } else if (data.type === 'follow' && data.actorId) {
    router.push(`/user/${data.actorId}`);
  } else if (data.type === 'login_alert') {
    router.push('/settings');
  } else {
    router.push('/(tabs)/notifications');
  }
}

async function handleResponse(response: any) {
  const data = response?.notification?.request?.content?.data;
  const action: string | undefined = response?.actionIdentifier;
  const N = getNotifications();
  if (action && action !== N.DEFAULT_ACTION_IDENTIFIER && ['reply', 'like', 'repost'].includes(action)) {
    // Shared with the closed-app task (lib/pushTask.ts): when both fire for the
    // same button press, the work is only done once.
    const ok = await performNotificationAction(response);
    const nid = response?.notification?.request?.identifier;
    if (ok) {
      // Done: take the notification away so it doesn't sit there "sending".
      if (nid) N.dismissNotificationAsync(nid).catch(() => {});
      return;
    }
    // Could not do it quietly: open the screen so nothing is lost.
  }
  handleNotificationTap(data);
}

export function usePushNotifications() {
  const { session, initializing } = useAuth();
  currentUserId = session?.user?.id ?? null;
  const registeredFor = useRef<string | null>(null);
  const pendingTap = useRef<any>(null);
  const [lastResponseChecked, setLastResponseChecked] = useState(false);

  // Every time the app comes back to the foreground, make sure this phone's
  // token is saved. It's a harmless upsert if it already is, and it repairs
  // the row if it was ever removed.
  useAppForeground(() => {
    if (isExpoGo || !session?.user?.id) return;
    dismissActiveChatNotifications();
    isPushEnabled().then((on) => on && registerToken(session.user.id));
  });

  useEffect(() => {
    if (!session?.user?.id) {
      // Signed out — forget who this device was registered for, so signing
      // back in as the same person (without restarting the app) registers
      // the token again instead of being skipped.
      registeredFor.current = null;
      return;
    }
    if (registeredFor.current === session.user.id) return;
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
      if (response) pendingTap.current = response;
      setLastResponseChecked(true);
    });

    // Warm: app was already running/backgrounded when the notification was
    // tapped — the navigator already exists in this case, so this one can
    // navigate immediately, no deferring needed.
    const subscription = Notifications.addNotificationResponseReceivedListener((response: any) => {
      handleResponse(response);
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
    if (initializing || !lastResponseChecked || !pendingTap.current) return;
    const response = pendingTap.current;
    pendingTap.current = null;
    const timeout = setTimeout(() => handleResponse(response), 120);
    return () => clearTimeout(timeout);
  }, [initializing, lastResponseChecked]);
}
