import Constants from 'expo-constants';
import { isViewingConversation, isViewingGroup } from './activeChatTracker';
import { performNotificationAction } from './notificationButtons';

// Makes the Reply / Like / Repost buttons work when the app is CLOSED.
//
// Why this exists: when a normal push arrives while the app is closed, Android
// draws the notification by itself and knows nothing about our buttons. So the
// server (supabase/functions/send-push, PUSH_MODE=actions) sends a silent
// "data" push instead, and this task wakes the app in the background, builds
// the notification itself WITH its buttons, and later handles a button press.
//
// It must be loaded very early (index.js does that) because Android starts the
// app in the background just to run it.
const isExpoGo = Constants.appOwnership === 'expo' || (Constants.executionEnvironment as string) === 'storeClient';
const TASK = 'FLITTERS-PUSH-TASK';

function parseJson(v: any): any {
  if (typeof v === 'string') {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  return v && typeof v === 'object' ? v : null;
}

// The silent push carries our own "__flit" block. Depending on how Expo and
// the phone wrap the message it can sit a few levels down (for example
// payload.data.dataString -> "body" -> our data), so search each level.
function findFlit(node: any, depth = 0): any {
  if (depth > 4 || node == null) return null;
  const obj = parseJson(node);
  if (!obj || typeof obj !== 'object') return null;
  if (obj.__flit) return obj;
  for (const key of ['dataString', 'body', 'data', 'payload']) {
    if (obj[key] != null) {
      const found = findFlit(obj[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

async function present(N: any, payload: any) {
  const { __flit, ...rest } = payload;
  // "That call is over": take its ringing notification away.
  if (__flit.dismissCallId) {
    try {
      const shown: any[] = await N.getPresentedNotificationsAsync();
      await Promise.all(
        shown
          .filter((n) => n?.request?.content?.data?.callId === __flit.dismissCallId)
          .map((n) => N.dismissNotificationAsync(n.request.identifier).catch(() => {}))
      );
    } catch {}
    return;
  }
  const d: any = rest;
  // Don't pop up a banner for the chat you are looking at right now.
  if (d.type === 'message' && isViewingConversation(d.conversationId)) return;
  if (d.type === 'group_message' && isViewingGroup(d.groupId)) return;
  await N.scheduleNotificationAsync({
    identifier: `fl_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
    content: {
      title: __flit.title || 'Flitters',
      body: __flit.body || '',
      data: d,
      categoryIdentifier: __flit.categoryId || undefined,
    },
    trigger: { channelId: __flit.channelId || 'default' },
  });
}

async function onTask({ data }: any) {
  try {
    const N: any = require('expo-notifications');
    if (data && 'actionIdentifier' in data) {
      // A button was pressed while the app was in the background / closed.
      const action = data.actionIdentifier;
      if (!['reply', 'like', 'repost'].includes(action)) return;
      const ok = await performNotificationAction(data);
      const nid = data?.notification?.request?.identifier;
      if (nid) await N.dismissNotificationAsync(nid).catch(() => {});
      if (!ok) {
        // Say so instead of failing silently. Tapping it opens the chat/post.
        const d = data?.notification?.request?.content?.data || {};
        await N.scheduleNotificationAsync({
          content: { title: 'Flitters', body: "Couldn't send that. Tap to open.", data: d },
          trigger: { channelId: 'default' },
        });
      }
      return;
    }
    const flit = findFlit(data);
    if (flit) await present(N, flit);
  } catch (err) {
    console.warn('[PushTask] failed:', err);
  }
}

if (!isExpoGo) {
  try {
    const TaskManager = require('expo-task-manager');
    const N: any = require('expo-notifications');
    if (!TaskManager.isTaskDefined(TASK)) TaskManager.defineTask(TASK, onTask);
    N.registerTaskAsync(TASK).catch((err: any) => console.warn('[PushTask] register failed:', err));
  } catch (err) {
    // expo-task-manager not installed in this build: buttons keep working
    // only while the app is open, as before.
    console.warn('[PushTask] not active:', err);
  }
}
