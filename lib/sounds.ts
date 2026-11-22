import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { AppState, Platform } from 'react-native';
import { isNotificationSoundAvailable, loadNotificationSound, playNotificationSound } from '../modules/flitters-sound';

// Short, soft app sounds. Each one is a tiny file in assets/sounds.
// They mix with other audio (music keeps playing), stay quiet, and can be
// switched off in Settings → Notifications → Sounds.
export type SoundName = 'typing' | 'incoming' | 'send' | 'like';

// A sound can have several versions; it steps through them in turn (the
// typing "bloops" climb and fall like a little tune).
const SRC: Record<SoundName, any[]> = {
  typing: [], // typing sound removed on purpose — playSound('typing') does nothing
  incoming: [require('../assets/sounds/incoming.wav')],
  send: [require('../assets/sounds/knock.wav')],
  like: [require('../assets/sounds/like.wav')],
};
const turn: Partial<Record<SoundName, number>> = {};
const VOLUME: Record<SoundName, number> = { typing: 0.5, incoming: 0.5, send: 0.6, like: 0.5 };
// A sound won't repeat faster than this (typing signals arrive every few seconds).
const MIN_GAP: Record<SoundName, number> = { typing: 3500, incoming: 250, send: 150, like: 200 };

const KEY = 'sounds_enabled';
let enabled = true;
let loaded = false;
let modeAt = 0;
const players: Record<string, any> = {};
const lastPlayed: Partial<Record<SoundName, number>> = {};

// Android: sounds play like notification sounds (notification volume, no audio focus), so music, videos
// and voice notes can't stop them and they don't stop music. Needs the rebuilt app; otherwise the old way below is used.
const nativeLoaded = new Set<string>();
let nativeLoading = false;
async function prepareNative() {
  if (nativeLoading || Platform.OS !== 'android' || !isNotificationSoundAvailable()) return;
  nativeLoading = true;
  try {
    const { Asset } = require('expo-asset');
    for (const name of Object.keys(SRC) as SoundName[]) {
      const files = SRC[name];
      for (let i = 0; i < files.length; i++) {
        const a = Asset.fromModule(files[i]);
        await a.downloadAsync();
        const uri = a.localUri || a.uri;
        if (uri && loadNotificationSound(`${name}:${i}`, uri)) nativeLoaded.add(`${name}:${i}`);
      }
    }
  } catch {}
  nativeLoading = false;
}

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    enabled = (await AsyncStorage.getItem(KEY)) !== 'false';
  } catch {}
}
load();
prepareNative();

// Voice messages and video change the phone's audio mode and leave it that
// way, which is why the app sounds went quiet until restart. The mode is now
// re-applied before sounds (at most every 4 seconds), and the sound players
// are rebuilt when the app comes back from the background.
AppState.addEventListener('change', (s) => {
  if (s !== 'active') return;
  modeAt = 0;
  Object.keys(players).forEach((k) => {
    try { players[k]?.remove?.(); } catch {}
    delete players[k];
  });
});

export async function getSoundsEnabled(): Promise<boolean> {
  await load();
  return enabled;
}
export async function setSoundsEnabled(v: boolean) {
  enabled = v;
  loaded = true;
  try {
    await AsyncStorage.setItem(KEY, v ? 'true' : 'false');
  } catch {}
}

export function playSound(name: SoundName, force = false) {
  if (!enabled) return;
  if (name === 'typing') return; // switched off for good
  const now = Date.now();
  if (!force && now - (lastPlayed[name] || 0) < MIN_GAP[name]) return;
  lastPlayed[name] = now;
  try {
    const i = (turn[name] || 0) % SRC[name].length;
    turn[name] = i + 1;
    const pk = `${name}:${i}`;
    if (nativeLoaded.has(pk) && playNotificationSound(pk, VOLUME[name])) return;
    if (!nativeLoaded.size) prepareNative();
    const go = () => {
      try {
        let p = players[pk];
        if (!p) {
          p = createAudioPlayer(SRC[name][i]);
          players[pk] = p;
        }
        p.volume = VOLUME[name];
        Promise.resolve(p.seekTo(0))
          .catch(() => {})
          .then(() => p.play())
          .catch(() => {
            // a dead player: throw it away so the next sound builds a fresh one
            try { p.remove?.(); } catch {}
            delete players[pk];
          });
      } catch {}
    };
    if (now - modeAt > 4000) {
      modeAt = now;
      setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', allowsRecording: false } as any)
        .catch(() => {})
        .then(go);
    } else go();
  } catch (err) {
    console.warn('[sounds] could not play', name, err);
  }
}
