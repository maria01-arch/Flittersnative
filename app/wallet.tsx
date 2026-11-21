import { useEffect, useState, useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import Text from '@/components/AppText';
import { router, Stack } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useIAP } from 'expo-iap';
import { useTheme } from '@/lib/ThemeContext';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { loadPacks, useWallet, fmtCoins, fetchCoinConfig, canShowWebLink, type CoinPack, type CoinConfig } from '@/lib/coins';
import { usdWithLocal } from '@/lib/currency';
import * as Clipboard from 'expo-clipboard';
import { Linking } from 'react-native';


// Flit coins: buy with Google Play, spend on gifts. Coins can't be cashed out.
export default function WalletScreen() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const uid = session?.user?.id;
  const { balance, earned, reload } = useWallet(uid);
  const [cfg, setCfg] = useState<CoinConfig | null>(null);
  const [money, setMoney] = useState<{ usd: string; local: string | null } | null>(null);
  const [wbusy, setWbusy] = useState(false);
  const [packs, setPacks] = useState<CoinPack[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!uid) return;
    const { data } = await supabase.from('coin_ledger').select('id,delta,kind,created_at').eq('user_id', uid).order('id', { ascending: false }).limit(30);
    setHistory(data || []);
  }, [uid]);

  useEffect(() => { loadPacks().then(setPacks); loadHistory(); fetchCoinConfig().then(setCfg); }, [loadHistory]);
  useEffect(() => { if (cfg) usdWithLocal(earned / cfg.coins_per_usd).then(setMoney); }, [earned, cfg?.coins_per_usd]);

  const showPlay = !!cfg?.play_purchase_enabled;
  const showWeb = canShowWebLink(cfg);
  const [copied, setCopied] = useState(false);
  const copyLink = async () => { if (!cfg) return; await Clipboard.setStringAsync(cfg.web_buy_url); setCopied(true); setTimeout(() => setCopied(false), 1800); };

  const opens = cfg ? new Date(cfg.withdraw_opens_at) : null;
  const locked = !opens || Date.now() < opens.getTime();
  const opensText = opens ? opens.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  const withdraw = () => {
    if (!cfg || locked || wbusy) return;
    if (earned < cfg.min_withdraw_coins) return Alert.alert('Not enough yet', `The minimum withdrawal is ${fmtCoins(cfg.min_withdraw_coins)} coins.`);
    Alert.alert('Withdraw earnings?', `${fmtCoins(earned)} coins (${money?.usd}${money?.local ? ' ≈ ' + money.local : ''}) will be sent for payout.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Withdraw', onPress: async () => {
        setWbusy(true);
        const { error } = await supabase.rpc('request_withdrawal', { p_coins: earned });
        setWbusy(false);
        if (error) return Alert.alert("Couldn't withdraw", error.message);
        await reload(); loadHistory();
        Alert.alert('Request sent', 'We will review it and pay you out. You can follow it here.');
      } },
    ]);
  };

  // Ask our server to check the purchase with Google; coins are added only if Google confirms it.
  const confirmOnServer = async (purchase: any): Promise<boolean> => {
    if (!purchase?.purchaseToken) return false;
    const { data, error } = await supabase.functions.invoke('verify-coin-purchase', { body: { productId: purchase.productId, purchaseToken: purchase.purchaseToken } });
    if (error || !(data as any)?.ok) { console.warn('[coins] verify failed', error?.message, data); return false; }
    return true;
  };

  const skus = packs.map((p) => p.sku);
  const { connected, products, fetchProducts, requestPurchase, finishTransaction, getAvailablePurchases, availablePurchases } = useIAP({
    onPurchaseSuccess: async (purchase: any) => {
      if (!String(purchase.productId || '').startsWith('flitcoins_')) return;
      const ok = await confirmOnServer(purchase);
      setBusy(null);
      if (ok) {
        try { await finishTransaction({ purchase, isConsumable: true }); } catch {}
        await reload(); loadHistory();
        Alert.alert('Coins added', 'Your Flit coins are in your wallet.');
      } else {
        Alert.alert("We couldn't confirm your purchase yet", 'You have not lost anything. Open this screen again in a minute and it will be applied.');
      }
    },
    onPurchaseError: (error: any) => {
      setBusy(null);
      if (error?.code !== 'user-cancelled') Alert.alert('Purchase did not go through', error?.message || 'Please try again.');
    },
  } as any);

  useEffect(() => { if (showPlay && connected && skus.length) fetchProducts({ skus, type: 'in-app' } as any); }, [showPlay, connected, packs.length]);

  // A coin purchase that paid but wasn't applied (phone died, no signal...) is applied next time this screen opens.
  useEffect(() => { if (showPlay && connected) getAvailablePurchases?.(); }, [showPlay, connected]);
  useEffect(() => {
    const pending = (availablePurchases || []).filter((p: any) => String(p.productId || '').startsWith('flitcoins_'));
    if (!pending.length) return;
    (async () => {
      let applied = 0;
      for (const p of pending) if (await confirmOnServer(p)) { applied++; try { await finishTransaction({ purchase: p, isConsumable: true }); } catch {} }
      if (applied) { await reload(); loadHistory(); }
    })();
  }, [availablePurchases]);

  const priceOf = (sku: string) => {
    const p: any = (products as any[])?.find((x: any) => x.id === sku || x.productId === sku);
    return p?.displayPrice || p?.localizedPrice || p?.price || '';
  };

  const buy = async (pack: CoinPack) => {
    if (busy) return;
    if (!products?.some((x: any) => (x.id || x.productId) === pack.sku)) return Alert.alert("This pack isn't available right now", 'Please try again in a moment.');
    setBusy(pack.sku);
    try {
      await requestPurchase({ request: { google: { skus: [pack.sku] } }, type: 'in-app' } as any);
    } catch (err: any) {
      setBusy(null);
      Alert.alert('Purchase did not start', err?.message || 'Please try again.');
    }
  };

  const label = (h: any) => (h.kind === 'purchase' ? 'Coins bought' : h.kind === 'gift_sent' ? 'Gift sent' : h.kind === 'gift_received' ? 'Gift received' : h.kind === 'withdrawal' ? 'Withdrawal' : h.kind === 'refund' ? 'Refund' : 'Adjustment');

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.top, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}><Ionicons name="arrow-back" size={24} color={colors.text} /></TouchableOpacity>
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 18 }}>Flit coins</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await reload(); await loadHistory(); setRefreshing(false); }} />} contentContainerStyle={{ padding: 16, paddingBottom: 50 }}>
        <View style={[styles.balCard, { backgroundColor: colors.primary }]}>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontWeight: '700', fontSize: 13 }}>Your balance</Text>
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 40, marginTop: 4 }}>🪙 {fmtCoins(balance)}</Text>
        </View>

        <View style={[styles.earnCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>Earned from gifts</Text>
          <Text style={{ color: colors.text, fontWeight: '900', fontSize: 24, marginTop: 4 }}>🪙 {fmtCoins(earned)}</Text>
          <Text style={{ color: colors.subtext, fontSize: 13, marginTop: 2 }}>
            {money ? `${money.usd}${money.local ? '  ≈  ' + money.local : ''}` : ' '}
          </Text>
          <Text style={{ color: colors.faint, fontSize: 12, marginTop: 6 }}>Earned coins can be spent on gifts too. {cfg ? `${fmtCoins(cfg.coins_per_usd)} coins = $1.` : ''}</Text>
          <TouchableOpacity disabled={locked || wbusy} onPress={withdraw} style={[styles.wbtn, { backgroundColor: locked ? colors.border : colors.primary }]}>
            {wbusy ? <ActivityIndicator color="#fff" /> : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {locked && <Ionicons name="lock-closed" size={14} color={colors.subtext} />}
                <Text style={{ color: locked ? colors.subtext : '#fff', fontWeight: '800', fontSize: 14 }}>{locked ? `Withdrawals open ${opensText}` : 'Withdraw earnings'}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <Text style={[styles.h, { color: colors.text }]}>Get coins</Text>
        {cfg && !showPlay && (
          <View style={[styles.webCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {showWeb ? (
              <>
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>Buying in the app is unavailable right now</Text>
                <Text style={{ color: colors.subtext, fontSize: 13, lineHeight: 18, marginTop: 4 }}>You can get Flit coins on our website. Sign in with the same account and they appear here.</Text>
                <View style={[styles.urlBox, { backgroundColor: colors.inputBg }]}>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }} numberOfLines={1} selectable>{cfg.web_buy_url.replace(/^https?:\/\//, '')}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                  <TouchableOpacity onPress={copyLink} style={[styles.linkBtn, { borderColor: colors.primary }]}>
                    <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 14 }}>{copied ? 'Copied' : 'Copy link'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => Linking.openURL(cfg.web_buy_url)} style={[styles.linkBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                    <Ionicons name="open-outline" size={16} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Open</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <Text style={{ color: colors.subtext, fontSize: 14, lineHeight: 19 }}>Buying coins isn't available in the app right now.</Text>
            )}
          </View>
        )}
        {showPlay && (packs.length === 0 ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} /> : packs.map((p) => (
          <TouchableOpacity key={p.sku} activeOpacity={0.8} onPress={() => buy(p)} disabled={!!busy} style={[styles.pack, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ fontSize: 26 }}>🪙</Text>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>{fmtCoins(p.coins)} coins</Text>
              {!!p.label && <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12, marginTop: 1 }}>{p.label}</Text>}
            </View>
            {busy === p.sku ? <ActivityIndicator color={colors.primary} /> : (
              <View style={[styles.price, { backgroundColor: colors.primary }]}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{priceOf(p.sku) || 'Buy'}</Text></View>
            )}
          </TouchableOpacity>
        )))}
        <Text style={{ color: colors.faint, fontSize: 12, lineHeight: 17, marginTop: 8 }}>
          Coins you buy are for sending gifts and can't be withdrawn. Only coins you earn from gifts can be withdrawn, once withdrawals open..
        </Text>

        <Text style={[styles.h, { color: colors.text, marginTop: 26 }]}>History</Text>
        {history.length === 0 ? <Text style={{ color: colors.subtext }}>Nothing yet.</Text> : history.map((h) => (
          <View key={h.id} style={[styles.hrow, { borderBottomColor: colors.border }]}>
            <View>
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>{label(h)}</Text>
              <Text style={{ color: colors.faint, fontSize: 12 }}>{new Date(h.created_at).toLocaleString()}</Text>
            </View>
            <Text style={{ color: h.delta > 0 ? '#16A34A' : colors.text, fontWeight: '800', fontSize: 15 }}>{h.delta > 0 ? '+' : ''}{fmtCoins(h.delta)}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 52, paddingBottom: 12, borderBottomWidth: 1 },
  webCard: { borderWidth: 1, borderRadius: 16, padding: 16 },
  urlBox: { marginTop: 12, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  linkBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderRadius: 12, paddingVertical: 11 },
  earnCard: { borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 14 },
  wbtn: { marginTop: 12, borderRadius: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  balCard: { borderRadius: 20, padding: 20, marginBottom: 6 },
  h: { fontSize: 16, fontWeight: '800', marginTop: 20, marginBottom: 10 },
  pack: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 10 },
  price: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  hrow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
});
