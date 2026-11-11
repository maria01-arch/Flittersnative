// Cuts a piece out of a video file (Android only, needs the installed app —
// it is not available in Expo Go). See android/.../FlittersTrimModule.kt.
export type TrimResult = { uri: string; startMs: number; durationMs: number };

let native: { trim: (uri: string, startMs: number, endMs: number, maxMs: number) => Promise<TrimResult> } | null = null;
try {
  const { requireNativeModule } = require('expo-modules-core');
  native = requireNativeModule('FlittersTrim');
} catch {
  native = null;
}

export function isTrimAvailable(): boolean {
  return !!native;
}

// Cuts from startSeconds to endSeconds (never more than maxSeconds long; 0 =
// no cap). Throws with a message when it can't.
export async function trimVideoFile(uri: string, startSeconds: number, endSeconds: number, maxSeconds = 0): Promise<TrimResult> {
  if (!native) throw new Error('Trimming needs the installed Flitters app, not Expo Go.');
  return native.trim(uri, Math.round(startSeconds * 1000), Math.round(endSeconds * 1000), Math.round(maxSeconds * 1000));
}
