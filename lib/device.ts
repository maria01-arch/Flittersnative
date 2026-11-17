import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';

// A random id made once per install and kept across account switches, so
// two accounts used on the same phone are recognised as sharing it. Used to
// keep chat streaks honest (08_streak_anti_abuse.sql).
const KEY = 'install_id_v1';
let cached: string | null = null;

export async function getInstallId(): Promise<string> {
  if (cached) return cached;
  try {
    const saved = await AsyncStorage.getItem(KEY);
    if (saved && saved.length >= 16) return (cached = saved);
  } catch {}
  const fresh = Crypto.randomUUID();
  try { await AsyncStorage.setItem(KEY, fresh); } catch {}
  return (cached = fresh);
}

export async function registerDevice(): Promise<void> {
  try {
    const id = await getInstallId();
    await supabase.rpc('register_device', { p_device: id });
  } catch {}
}
