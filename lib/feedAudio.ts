import { useSyncExternalStore } from 'react';

// Feed videos start muted (so scrolling is quiet). Tapping the speaker on
// any one video unmutes ALL feed videos until you mute again — same as
// Instagram — so you don't have to re-tap on every video you scroll to.
let muted = true;
const listeners = new Set<() => void>();

export function setFeedMuted(next: boolean) {
  muted = next;
  listeners.forEach((l) => l());
}

export function useFeedMuted(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => muted,
    () => true
  );
}
