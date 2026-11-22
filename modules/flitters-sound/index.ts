// Plays short app sounds on the phone's notification volume (Android only; needs the
// installed app, not Expo Go). See android/.../FlittersSoundModule.kt.
let native: { load: (key: string, path: string) => boolean; play: (key: string, volume: number) => boolean } | null = null;
try {
  const { requireNativeModule } = require('expo-modules-core');
  native = requireNativeModule('FlittersSound');
} catch {
  native = null;
}

export const isNotificationSoundAvailable = () => !!native;
export function loadNotificationSound(key: string, path: string): boolean {
  try { return !!native?.load(key, path); } catch { return false; }
}
export function playNotificationSound(key: string, volume: number): boolean {
  try { return !!native?.play(key, volume); } catch { return false; }
}
