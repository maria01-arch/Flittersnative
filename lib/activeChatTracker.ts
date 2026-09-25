// A plain module-level value, not React state — the notification handler
// (lib/usePushNotifications.ts) needs to read this synchronously from
// outside the component tree, and doesn't need to re-render when it
// changes. Each chat screen sets this on focus and clears it on blur.
let activeConversationId: string | null = null;
let activeGroupId: string | null = null;

export function setActiveConversation(id: string | null) {
  activeConversationId = id;
}

export function setActiveGroup(id: string | null) {
  activeGroupId = id;
}

export function isViewingConversation(id: string | null | undefined) {
  return !!id && id === activeConversationId;
}

export function isViewingGroup(id: string | null | undefined) {
  return !!id && id === activeGroupId;
}
