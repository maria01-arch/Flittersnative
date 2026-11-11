// A plain module-level value, not React state — the notification handler
// (lib/usePushNotifications.ts) needs to read this synchronously from
// outside the component tree, and doesn't need to re-render when it
// changes. Each chat screen sets this on focus and clears it on blur.
let activeConversationId: string | null = null;
let activeGroupId: string | null = null;

import { dismissChatNotifications } from './notificationActions';

export function setActiveConversation(id: string | null) {
  activeConversationId = id;
  // Opening a chat clears that chat's alerts from the notification tray.
  if (id) dismissChatNotifications('message', id);
}

export function setActiveGroup(id: string | null) {
  activeGroupId = id;
  if (id) dismissChatNotifications('group_message', id);
}

// Used when the app returns to the front while a chat is already open.
export function dismissActiveChatNotifications() {
  if (activeConversationId) dismissChatNotifications('message', activeConversationId);
  if (activeGroupId) dismissChatNotifications('group_message', activeGroupId);
}

export function isViewingConversation(id: string | null | undefined) {
  return !!id && id === activeConversationId;
}

export function isViewingGroup(id: string | null | undefined) {
  return !!id && id === activeGroupId;
}
