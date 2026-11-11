// "Open this exact reel": the feed's preview cards leave the reel's id here, and the
// Reels tab picks it up (right away if it is already open, or when it first opens).
// Used instead of screen parameters, which tabs do not always pass on.
let pending: string | null = null;
const listeners = new Set<() => void>();

export function requestOpenReel(id: string) {
  pending = String(id);
  listeners.forEach((l) => l());
}
export function takePendingReel(): string | null {
  const p = pending;
  pending = null;
  return p;
}
export function onReelOpenRequest(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
