import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';

// Save a picture or video to the phone's gallery.
// Needs the package `expo-media-library` inside the installed app. Without it
// (Expo Go, or an older build) the person is told the app needs updating.
let ML: any = null;
// In newer Expo versions the simple functions live in "expo-media-library/legacy";
// older ones only have the main path. Try the legacy path first.
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ML = require('expo-media-library/legacy');
} catch {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ML = require('expo-media-library');
  } catch {
    ML = null;
  }
}

const extOf = (url: string, fallback: string) => {
  const m = /\.([a-zA-Z0-9]{2,4})(?:[?#]|$)/.exec(url);
  return (m ? m[1] : fallback).toLowerCase();
};

export let lastSaveError = '';

export async function saveMedia(url: string, kind: 'image' | 'video'): Promise<'ok' | 'denied' | 'unavailable' | 'failed'> {
  lastSaveError = '';
  if (!ML) return 'unavailable';
  let local = '';
  try {
    const perm = await ML.requestPermissionsAsync(true);
    if (!perm?.granted) return 'denied';
    local = `${FileSystem.cacheDirectory}flitters_${Date.now()}.${extOf(url, kind === 'video' ? 'mp4' : 'jpg')}`;
    const res = await FileSystem.downloadAsync(url, local);
    if (res.status < 200 || res.status >= 300) {
      lastSaveError = 'download answered ' + res.status;
      return 'failed';
    }
    try {
      await ML.saveToLibraryAsync(res.uri);
    } catch (e1: any) {
      // second way of saving, in case the first one is refused on this phone
      try {
        await ML.createAssetAsync(res.uri);
      } catch (e2: any) {
        lastSaveError = String(e2?.message || e1?.message || e2 || e1);
        return 'failed';
      }
    }
    return 'ok';
  } catch (e: any) {
    lastSaveError = String(e?.message || e);
    return 'failed';
  } finally {
    if (local) FileSystem.deleteAsync(local, { idempotent: true }).catch(() => {});
  }
}

export async function saveMediaWithAlert(url: string | null | undefined, kind: 'image' | 'video') {
  if (!url) return;
  const r = await saveMedia(url, kind);
  if (r === 'ok') Alert.alert('Saved', kind === 'video' ? 'The video is in your gallery.' : 'The picture is in your gallery.');
  else if (r === 'denied') Alert.alert('Permission needed', 'Allow Flitters to save to your gallery in the phone settings, then try again.');
  else if (r === 'unavailable') Alert.alert('Update needed', 'Saving needs the latest Flitters from Google Play.');
  else Alert.alert("Couldn't save", lastSaveError ? 'Reason: ' + lastSaveError.slice(0, 200) : 'Check your connection and try again.');
}

// Save a picture that is already on the phone (for example a Share-as-image card).
export async function saveLocalImage(uri: string): Promise<'ok' | 'denied' | 'unavailable' | 'failed'> {
  if (!ML) return 'unavailable';
  try {
    const perm = await ML.requestPermissionsAsync(true);
    if (!perm?.granted) return 'denied';
    try {
      await ML.saveToLibraryAsync(uri);
    } catch {
      await ML.createAssetAsync(uri);
    }
    return 'ok';
  } catch (e: any) {
    lastSaveError = String(e?.message || e);
    return 'failed';
  }
}

// Only verified (blue) or authentic (gold) accounts may save videos.
let cache: { id: string; ok: boolean; at: number } | null = null;
export async function canDownloadVideos(userId?: string | null): Promise<boolean> {
  if (!userId) return false;
  if (cache && cache.id === userId && Date.now() - cache.at < 60000) return cache.ok;
  const { data } = await supabase.from('profiles').select('verified,is_authentic').eq('id', userId).maybeSingle();
  const ok = !!(data?.verified || data?.is_authentic);
  cache = { id: userId, ok, at: Date.now() };
  return ok;
}

export async function saveVideoIfAllowed(userId: string | null | undefined, url: string | null | undefined) {
  if (!url) return;
  if (!(await canDownloadVideos(userId))) {
    Alert.alert('Verified accounts only', 'Saving videos is a feature of verified accounts.', [
      { text: 'Not now', style: 'cancel' },
      { text: 'Get verified', onPress: () => router.push('/get-verified') },
    ]);
    return;
  }
  await saveMediaWithAlert(url, 'video');
}
