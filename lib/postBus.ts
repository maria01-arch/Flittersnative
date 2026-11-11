// A tiny message line between the composer and the home feed, so a new post
// shows up in the feed the moment you tap Post (while it uploads), without
// asking the server for the feed again.
//   add     → the feed shows the post straight away, slightly faded, "Posting…"
//   confirm → the upload finished: the feed swaps in the real id and links
//   fail    → the upload failed: the feed removes it (the text is kept as a draft)
export type PostBusEvent =
  | { type: 'add'; item: any }
  | { type: 'confirm'; tempId: string; patch: any }
  | { type: 'fail'; tempId: string };

const listeners = new Set<(e: PostBusEvent) => void>();
// Posts still uploading, so a feed that mounts a moment later still shows them.
const pending = new Map<string, any>();

export function subscribePostBus(fn: (e: PostBusEvent) => void): () => void {
  listeners.add(fn);
  pending.forEach((item) => {
    try {
      fn({ type: 'add', item });
    } catch {}
  });
  return () => {
    listeners.delete(fn);
  };
}

export function emitPostBus(e: PostBusEvent) {
  if (e.type === 'add') pending.set(e.item.feedKey, e.item);
  else pending.delete(e.type === 'confirm' ? e.tempId : e.tempId);
  listeners.forEach((fn) => {
    try {
      fn(e);
    } catch {}
  });
}

// My own profile fields, kept so the optimistic post can show my name and
// picture without another request each time.
let myProfile: any = null;
export const getMyProfileCache = () => myProfile;
export const setMyProfileCache = (p: any) => {
  myProfile = p;
};

// If an upload fails, the text and pictures come back in the composer.
let failedDraft: any[] | null = null;
export const setFailedDraft = (segments: any[] | null) => {
  failedDraft = segments;
};
export const takeFailedDraft = () => {
  const d = failedDraft;
  failedDraft = null;
  return d;
};
