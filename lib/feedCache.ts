import AsyncStorage from '@react-native-async-storage/async-storage';

// The last feed page, kept on the phone, so opening the app with a weak or no
// connection shows the posts you saw last instead of a blank screen.
const key = (uid: string, mode: string) => `feed_cache_v1:${uid}:${mode}`;

export async function saveFeedCache(uid: string | undefined, mode: string, items: any[]) {
  if (!uid) return;
  try {
    const clean = items.filter((p) => p && !p.pending && !p.__ad).slice(0, 25);
    if (!clean.length) return;
    await AsyncStorage.setItem(key(uid, mode), JSON.stringify({ at: Date.now(), items: clean }));
  } catch {}
}

export async function loadFeedCache(uid: string | undefined, mode: string): Promise<any[] | null> {
  if (!uid) return null;
  try {
    const raw = await AsyncStorage.getItem(key(uid, mode));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.items) && parsed.items.length ? parsed.items : null;
  } catch {
    return null;
  }
}
