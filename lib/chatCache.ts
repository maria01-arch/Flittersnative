// Remembers the newest messages of each chat while the app is open, so
// re-opening a chat shows them instantly while fresh ones load behind.
const store = new Map<string, any[]>();
const MAX_CHATS = 30;
const KEEP = 30;

export function getCachedMessages(key: string): any[] | null {
  return store.get(key) || null;
}

export function setCachedMessages(key: string, msgs: any[]) {
  const clean = msgs.filter((m) => m && !m._pending && !m._failed && !String(m.id).startsWith('temp')).slice(0, KEEP);
  if (!clean.length) return;
  store.delete(key);
  store.set(key, clean);
  if (store.size > MAX_CHATS) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
}

export function clearChatCache() {
  store.clear();
}
