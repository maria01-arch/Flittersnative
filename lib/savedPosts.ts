import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

// Posts saved to read offline. The text and author are kept in AsyncStorage,
// and the picture (and the author's avatar) is downloaded into the app's own
// folder, so it all opens with no connection. Videos are NOT downloaded
// (too big) — a saved video post keeps its text and still picture only.
export type SavedPost = { savedAt: number; post: any };

const KEY = (uid: string) => `saved_posts_v1:${uid}`;
const MAX_SAVED = 100;
const DIR = () => `${FileSystem.documentDirectory || ''}saved/`;

const lists = new Map<string, SavedPost[]>();
const loading = new Map<string, Promise<SavedPost[]>>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function subscribeSaved(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

async function load(uid: string): Promise<SavedPost[]> {
  const have = lists.get(uid);
  if (have) return have;
  let p = loading.get(uid);
  if (!p) {
    p = AsyncStorage.getItem(KEY(uid))
      .then((raw) => {
        const parsed = raw ? JSON.parse(raw) : [];
        const list: SavedPost[] = Array.isArray(parsed) ? parsed : [];
        lists.set(uid, list);
        return list;
      })
      .catch(() => {
        lists.set(uid, []);
        return [] as SavedPost[];
      })
      .then((l) => {
        loading.delete(uid);
        return l;
      });
    loading.set(uid, p);
  }
  return p;
}

async function persist(uid: string, list: SavedPost[]) {
  lists.set(uid, list);
  try {
    await AsyncStorage.setItem(KEY(uid), JSON.stringify(list));
  } catch {}
  notify();
}

export async function getSavedPosts(uid: string): Promise<SavedPost[]> {
  return [...(await load(uid))];
}

export async function isPostSaved(uid: string | undefined, postId: string): Promise<boolean> {
  if (!uid) return false;
  return (await load(uid)).some((s) => String(s.post.id) === String(postId));
}

async function download(url: string | null | undefined, name: string): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    await FileSystem.makeDirectoryAsync(DIR(), { intermediates: true }).catch(() => {});
    const to = `${DIR()}${name}`;
    const res = await FileSystem.downloadAsync(url, to);
    return res.status >= 200 && res.status < 300 ? res.uri : null;
  } catch {
    return null;
  }
}

async function removeFiles(post: any) {
  for (const f of [post?.localImage, post?.localAvatar, post?.localThumb]) {
    if (f) await FileSystem.deleteAsync(f, { idempotent: true }).catch(() => {});
  }
}

export async function savePost(uid: string, post: any): Promise<void> {
  const list = await load(uid);
  if (list.some((s) => String(s.post.id) === String(post.id))) return;
  const id = String(post.id);
  const safe = id.replace(/[^A-Za-z0-9_-]/g, '');
  const a = post.author || {};
  const [localImage, localAvatar, localThumb] = await Promise.all([
    download(post.image_url, `${safe}-img`),
    download(a.avatar_url, `${safe}-av`),
    post.video_url ? download(post.thumbnail_url, `${safe}-th`) : Promise.resolve(null),
  ]);
  const snapshot = {
    id: post.id,
    content: post.content || '',
    created_at: post.created_at,
    image_url: post.image_url || null,
    video_url: post.video_url || null,
    thumbnail_url: post.thumbnail_url || null,
    localImage,
    localAvatar,
    localThumb,
    author: { id: a.id, display_name: a.display_name, username: a.username, avatar_url: a.avatar_url, verified: a.verified, is_authentic: a.is_authentic, verified_plan: a.verified_plan },
    likes_count: post.likes_count || 0,
    comments_count: post.comments_count || 0,
    reposts_count: post.reposts_count || 0,
  };
  const next = [{ savedAt: Date.now(), post: snapshot }, ...(lists.get(uid) || list)];
  const dropped = next.splice(MAX_SAVED);
  for (const d of dropped) await removeFiles(d.post);
  await persist(uid, next);
}

export async function unsavePost(uid: string, postId: string): Promise<void> {
  const list = await load(uid);
  const found = list.find((s) => String(s.post.id) === String(postId));
  if (!found) return;
  await removeFiles(found.post);
  await persist(uid, list.filter((s) => s !== found));
}
