// The native helpers for voice calls (Android only; needs the installed app, not Expo Go).
// See android/.../FlittersCallModule.kt.
let native: { start: (title: string) => boolean; setSpeaker: (on: boolean) => boolean; stop: () => boolean } | null = null;
try {
  const { requireNativeModule } = require('expo-modules-core');
  native = requireNativeModule('FlittersCall');
} catch {
  native = null;
}

export const isCallNativeAvailable = () => !!native;
export const callAudioStart = (title: string) => (native ? native.start(title) : false);
export const callAudioSpeaker = (on: boolean) => (native ? native.setSpeaker(on) : false);
export const callAudioStop = () => (native ? native.stop() : false);
