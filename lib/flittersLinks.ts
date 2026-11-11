import { router } from 'expo-router';
import { SITE_URL, HOSTS_PATTERN } from './siteConfig';

// Links that point INSIDE Flitters (xchord.space). One place decides what a
// link is, so previews, taps and sharing all agree.
export const SITE = SITE_URL;

export type FlittersLink =
  | { kind: 'post'; id: string }
  | { kind: 'comment'; postId: string; commentId: string }
  | { kind: 'group'; tag: string }
  | { kind: 'user'; username?: string; id?: string };

export const postLink = (id: string) => `${SITE}/p/${id}`;
export const commentLink = (postId: string, commentId: string) => `${SITE}/p/${postId}?c=${commentId}`;
export const profileLink = (username: string) => `${SITE}/u/${username}`;

export function parseFlittersLink(url: string): FlittersLink | null {
  if (!url) return null;
  const m = new RegExp('^https?:\\/\\/(?:www\\.)?' + HOSTS_PATTERN + '(\\/[^?#\\s]*)?(\\?[^#\\s]*)?(#\\S*)?$', 'i').exec(url.trim());
  if (!m) return null;
  const path = (m[1] || '/').replace(/\/+$/, '');
  const query = m[2] || '';
  const hash = m[3] || '';
  const seg = path.split('/').filter(Boolean);
  if (seg.length < 2) return null;
  const [head, value] = [seg[0].toLowerCase(), decodeURIComponent(seg[1])];
  if (head === 'p' || head === 'post') {
    const c = /[?&]c=([^&#\s]+)/.exec(query) || /#comment-([^&\s]+)/.exec(hash);
    if (c) return { kind: 'comment', postId: value, commentId: decodeURIComponent(c[1]) };
    return { kind: 'post', id: value };
  }
  if (head === 'join') return { kind: 'group', tag: value.replace(/^@/, '') };
  if (head === 'u') return { kind: 'user', username: value.replace(/^@/, '') };
  if (head === 'user') return { kind: 'user', id: value };
  return null;
}


// Opens a Flitters link on the right screen. Returns false if it isn't one.
export function openFlittersLink(url: string): boolean {
  const l = parseFlittersLink(url);
  if (!l) return false;
  if (l.kind === 'post') router.push({ pathname: '/post/[id]', params: { id: l.id } });
  else if (l.kind === 'comment') router.push({ pathname: '/comment/[id]', params: { id: l.commentId, postId: l.postId } });
  else if (l.kind === 'group') router.push({ pathname: '/join/[tag]', params: { tag: l.tag } });
  else if (l.username) router.push({ pathname: '/u/[username]', params: { username: l.username } });
  else if (l.id) router.push(`/user/${l.id}`);
  return true;
}
