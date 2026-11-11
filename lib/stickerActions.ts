import { Alert } from 'react-native';
import { supabase } from './supabase';

// Your own sticker pack (the first one — "My Stickers"), created if missing.
export async function myPackId(userId: string): Promise<string | null> {
  const { data } = await supabase.from('sticker_packs').select('id').eq('owner_id', userId).order('created_at', { ascending: true }).limit(1);
  if (data?.[0]) return data[0].id;
  const { data: created } = await supabase.from('sticker_packs').insert({ owner_id: userId, name: 'My Stickers' }).select('id').single();
  return created?.id ?? null;
}

export type StickerResult = { status: 'added' | 'exists' | 'own' | 'limit' | 'error'; count?: number; message?: string };

// Save ONE sticker (from a chat, a comment or a shared pack) into your own pack.
// Stickers are saved one at a time on purpose: grabbing a whole pack in one go
// is no longer possible, and the database allows only 20 saved stickers a day.
export async function addStickerToMyPack(userId: string, url: string): Promise<StickerResult> {
  const pack = await myPackId(userId);
  if (!pack) return { status: 'error', message: "Couldn't open your sticker pack." };
  const { data: have } = await supabase.from('stickers').select('id').eq('pack_id', pack).eq('media_url', url).limit(1);
  if (have?.length) return { status: 'exists' };
  const { error } = await supabase.from('stickers').insert({ pack_id: pack, media_url: url });
  if (error) {
    if (/limit/i.test(error.message || '')) return { status: 'limit', message: error.message };
    return { status: 'error', message: error.message };
  }
  return { status: 'added', count: 1 };
}

// Save one sticker and tell the person what happened.
export async function saveStickerWithAlert(userId: string, url: string) {
  const r = await addStickerToMyPack(userId, url);
  if (r.status === 'added') Alert.alert('Saved', 'Added to your stickers.');
  else if (r.status === 'exists') Alert.alert('Already saved', 'You already have this in your stickers.');
  else if (r.status === 'limit') Alert.alert('Daily limit reached', 'Free accounts can save 20 stickers a day. Verified members save unlimited stickers. Try again tomorrow.');
  else Alert.alert("Couldn't save", r.message || 'Please try again.');
  return r;
}

// The pack a sticker belongs to (looked up by its picture address).
export async function findPackIdByUrl(url: string): Promise<string | null> {
  const { data } = await supabase.from('stickers').select('pack_id').eq('media_url', url).limit(1);
  return data?.[0]?.pack_id ?? null;
}
