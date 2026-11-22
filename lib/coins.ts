import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { deviceRegion } from '@/lib/currency';

// Where Google lets an app point people to a website to pay (after the developer enrols in Google's programme).
const LINKOUT_REGIONS = new Set(['US', 'GB', 'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO']);
// The one rule for "may this phone be shown the website link?" (set in the admin Coins page).
export function canShowWebLink(cfg: { web_link_mode: string } | null | undefined): boolean {
  return !!cfg && (cfg.web_link_mode === 'always' || (cfg.web_link_mode === 'allowed_regions' && LINKOUT_REGIONS.has(deviceRegion())));
}

// Flit coins: bought with Google Play, spent on gifts. All money rules live on the server
// (SQL 13_flit_coins.sql); this file only reads the wallet and asks the server to send gifts.
export type GiftItem = { id: string; name: string; emoji: string; cost: number; sort: number };
export type CoinPack = { sku: string; coins: number; label: string | null; sort: number };

let giftCache: GiftItem[] | null = null;
let packCache: CoinPack[] | null = null;

export async function loadGifts(force = false): Promise<GiftItem[]> {
  if (giftCache && !force) return giftCache;
  const { data } = await supabase.from('gift_items').select('id,name,emoji,cost,sort').order('sort');
  giftCache = (data as GiftItem[]) || [];
  return giftCache;
}

export async function loadPacks(force = false): Promise<CoinPack[]> {
  if (packCache && !force) return packCache;
  const { data } = await supabase.from('coin_packs').select('sku,coins,label,sort').order('sort');
  packCache = (data as CoinPack[]) || [];
  return packCache;
}

export async function fetchWallet(uid: string): Promise<{ balance: number; earned: number }> {
  const { data } = await supabase.from('wallets').select('balance,earned').eq('user_id', uid).maybeSingle();
  return { balance: Number(data?.balance ?? 0), earned: Number(data?.earned ?? 0) };
}

export type CoinConfig = { receiver_share_pct: number; coins_per_usd: number; withdraw_opens_at: string; min_withdraw_coins: number; play_purchase_enabled: boolean; web_link_mode: 'off' | 'allowed_regions' | 'always'; web_buy_url: string };
export async function fetchCoinConfig(): Promise<CoinConfig> {
  const { data } = await supabase.from('coin_config').select('*').maybeSingle();
  return (data as CoinConfig) || { receiver_share_pct: 70, coins_per_usd: 100, withdraw_opens_at: '2027-01-05T08:00:00Z', min_withdraw_coins: 1000, play_purchase_enabled: false, web_link_mode: 'off', web_buy_url: 'https://xchord.space/coins' };
}

// Live balance: reads once, then follows changes while the screen is open.
export function useWallet(uid?: string | null) {
  const [balance, setBalance] = useState<number | null>(null);
  const [earned, setEarned] = useState(0);
  const reload = useCallback(async () => { if (uid) { const w = await fetchWallet(uid); setBalance(w.balance); setEarned(w.earned); } }, [uid]);
  useEffect(() => {
    if (!uid) return;
    reload();
    const ch = supabase
      .channel(`wallet:${uid}:${Math.random().toString(36).slice(2, 9)}`)   // unique per use, so two screens never share (and re-subscribe) one channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallets', filter: `user_id=eq.${uid}` }, (p: any) => {
        if (p.new?.balance != null) setBalance(Number(p.new.balance));
        if (p.new?.earned != null) setEarned(Number(p.new.earned));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [uid, reload]);
  return { balance, earned, setBalance, reload };
}

export type GiftContext = 'chat' | 'comment' | 'profile';

export async function sendGift(args: { giftId: string; toUserId: string; context: GiftContext; conversationId?: string | null; postId?: string | null }): Promise<{ ok: boolean; balance?: number; error?: string }> {
  const { data, error } = await supabase.rpc('send_gift', {
    p_gift: args.giftId,
    p_to: args.toUserId,
    p_context: args.context,
    p_conversation: args.conversationId ?? null,
    p_post: args.postId ?? null,
    p_note: null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, balance: Number((data as any)?.balance ?? 0) };
}

export type GiftTop = { emoji: string; name: string; cost: number; n: number };
export async function giftTotals(userId: string): Promise<{ count: number; top: GiftTop[] }> {
  const { data } = await supabase.rpc('gift_totals', { p_user: userId });
  return { count: Number((data as any)?.count ?? 0), top: (data as any)?.top || [] };
}

export async function giftInventory(userId: string): Promise<{ count: number; items: (GiftTop & { last_at: string })[] }> {
  const { data } = await supabase.rpc('gift_inventory', { p_user: userId });
  return { count: Number((data as any)?.count ?? 0), items: (data as any)?.items || [] };
}

// Who can receive gifts, and what they switched on. Rules live on the server (see 18_monetization.sql).
export type MonetizationStatus = {
  badge: boolean; followers: number; likes: number;
  need_followers: number; need_likes: number; need_dm_followers: number;
  post_eligible: boolean; dm_eligible: boolean;
  comments_on: boolean; profile_on: boolean; dm_on: boolean;
};
export async function fetchMonetization(userId: string): Promise<MonetizationStatus | null> {
  const { data, error } = await supabase.rpc('monetization_status', { p_user: userId });
  if (error || !data) return null;
  return data as MonetizationStatus;
}
export function useGiftAccess(userId?: string | null) {
  const [st, setSt] = useState<MonetizationStatus | null>(null);
  useEffect(() => { if (userId) fetchMonetization(userId).then(setSt).catch(() => {}); }, [userId]);
  return st;
}
export async function saveMonetization(v: { comments: boolean; profile: boolean; dm: boolean }): Promise<{ data?: MonetizationStatus; error?: string }> {
  const { data, error } = await supabase.rpc('set_monetization', { p_comments: v.comments, p_profile: v.profile, p_dm: v.dm });
  if (error) return { error: error.message };
  return { data: data as MonetizationStatus };
}


export const fmtCoins = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString());
