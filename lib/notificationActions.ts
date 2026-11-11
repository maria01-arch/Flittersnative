import Constants from 'expo-constants';

// Small helpers around the notification tray. Kept apart from
// usePushNotifications.ts so the chat screens can use them without a
// circular import. Expo Go has no push support, so everything here quietly
// does nothing there.
const isExpoGo = Constants.appOwnership === 'expo' || (Constants.executionEnvironment as string) === 'storeClient';

// Removes the notifications of ONE chat from the phone's notification area.
// Called when you open that chat (or come back to the app while it is open),
// like WhatsApp does — you have seen the messages, so the alerts go away.
export async function dismissChatNotifications(kind: 'message' | 'group_message', id: string | null | undefined) {
  if (isExpoGo || !id) return;
  try {
    const N = require('expo-notifications');
    const shown: any[] = await N.getPresentedNotificationsAsync();
    await Promise.all(
      shown
        .filter((n) => {
          const d: any = n?.request?.content?.data;
          if (!d || d.type !== kind) return false;
          return kind === 'message' ? d.conversationId === id : d.groupId === id;
        })
        .map((n) => N.dismissNotificationAsync(n.request.identifier).catch(() => {}))
    );
  } catch {}
}
