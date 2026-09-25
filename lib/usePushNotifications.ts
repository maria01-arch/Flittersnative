import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { supabase } from './supabase';
import { useAuth } from './AuthContext';

// How a notification should look while the app is in the foreground —
// without this, foreground notifications are silent/hidden by default.
import { isViewingConversation, isViewingGroup } from './activeChatTracker';

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as any;
    // Don't pop a foreground banner for a message in the exact
    // conversation/group you're already looking at — it was showing every
    // time regardless, which is just noise when you can already see the
    // message arrive in the thread itself.
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

async function registerToken(userId: string) {
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
    registerToken(session.user.id);
  }, [session?.user?.id]);

  useEffect(() => {
    // Cold-start: app was opened *by* tapping a notification. Capture the
    // data immediately so it isn't missed, but don't navigate yet — see
    // the effect below for why.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) pendingTapData.current = response.notification.request.content.data;
      setLastResponseChecked(true);
    });

    // Warm: app was already running/backgrounded when the notification was
    // tapped — the navigator already exists in this case, so this one can
    // navigate immediately, no deferring needed.
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
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
