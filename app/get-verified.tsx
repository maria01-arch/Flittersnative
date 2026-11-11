import { SITE_URL } from '@/lib/siteConfig';
import { useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Linking, Platform, Modal } from 'react-native';
import Text from '@/components/AppText';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useIAP } from 'expo-iap';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import AnimatedBadge from '@/components/AnimatedBadge';
import { refreshBilling, onOwnBadgeChanged } from '@/lib/billingRefresh';

// Flitters Basic (blue badge) and Flitters Premium (gold badge), paid through
// Google Play. In Play Console each plan is ONE subscription with two base
// plans: "monthly" and "annual". The server (xchord.space/api/billing/verify)
// checks every purchase with Google before the badge is granted.
const API = SITE_URL + '/api/billing/verify';
const PLANS = [
  { key: 'basic', sku: 'flitters_basic', name: 'Flitters Basic', tagline: 'Get the blue badge and the essentials.', monthly: 5, annualDiscount: 0.1, color: '#1877F2', perks: ['Blue verified badge', 'Videos up to 1 minute', 'Up to 8 co-owners on a post', 'Custom chat wallpapers and bubble colours'] },
  { key: 'premium', sku: 'flitters_premium', name: 'Flitters Premium', tagline: 'The gold badge and everything we build next.', monthly: 30, annualDiscount: 0.15, color: '#F5B301', perks: ['Everything in Basic', 'Gold verified badge', 'More Premium features coming soon'] },
];
const SKUS = PLANS.map((p) => p.sku);

export default function GetVerifiedScreen() {
  const { session } = useAuth();
  const [tab, setTab] = useState<'basic' | 'premium'>('basic');
  const [busy, setBusy] = useState<string | null>(null); // "plan:billing"
  const [celebrate, setCelebrate] = useState<'basic' | 'premium' | null>(null);
  const [tabSet, setTabSet] = useState(false);
  const [current, setCurrent] = useState<any>(null);
  const [restoring, setRestoring] = useState(false);

  const loadCurrent = async () => {
    if (!session?.user?.id) return;
    const { data } = await supabase.from('profiles').select('verified_plan,verified_until').eq('id', session.user.id).maybeSingle();
    setCurrent(data);
    // Open on the tab of the plan you already own.
    if (!tabSet && data?.verified_plan) {
      setTab(data.verified_plan === 'premium' ? 'premium' : 'basic');
      setTabSet(true);
    }
  };
  useEffect(() => {
    loadCurrent();
    // Ask the server to re-check Google (it adds / removes the badge), then
    // show whatever it decided. Limited to once every few minutes.
    refreshBilling().then((ok) => ok && loadCurrent());
  }, [session?.user?.id]);
  // Another part of the app (foreground refresh) changed the badge: follow it.
  useEffect(() => onOwnBadgeChanged((uid, patch) => {
    if (uid === session?.user?.id) setCurrent((c: any) => ({ ...(c || {}), ...patch }));
  }), [session?.user?.id]);

  // "Had a plan before": an end date in the past, or a purchase on record.
  // (If the purchases table can't be read, only the end date is used.)
  const [hadBefore, setHadBefore] = useState(false);
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid || !current) return;
    if (current.verified_plan) {
      setHadBefore(false);
      return;
    }
    const until = current.verified_until ? new Date(current.verified_until).getTime() : NaN;
    if (!isNaN(until) && until < Date.now()) {
      setHadBefore(true);
      return;
    }
    let alive = true;
    supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', uid)
      .limit(1)
      .then(({ data, error }) => {
        if (alive) setHadBefore(!error && !!data?.length);
      });
    return () => {
      alive = false;
    };
  }, [session?.user?.id, current?.verified_plan, current?.verified_until]);

  // Sends the purchase to our server; only when Google confirms it does the badge appear.
  const confirmOnServer = async (purchase: any): Promise<boolean> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token || !purchase?.purchaseToken) return false;
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ productId: purchase.productId, purchaseToken: purchase.purchaseToken }),
      });
      if (!res.ok) console.warn('[billing] server refused:', res.status, await res.text());
      return res.ok;
    } catch (err) {
      console.warn('[billing] verify failed:', err);
      return false;
    }
  };

  const { connected, subscriptions, fetchProducts, requestPurchase, finishTransaction, getAvailablePurchases, availablePurchases } = useIAP({
    onPurchaseSuccess: async (purchase: any) => {
      const ok = await confirmOnServer(purchase);
      setBusy(null);
      if (ok) {
        await finishTransaction({ purchase, isConsumable: false });
        await refreshBilling({ force: true });
        await loadCurrent();
        setTab(purchase.productId === 'flitters_premium' ? 'premium' : 'basic');
        setCelebrate(purchase.productId === 'flitters_premium' ? 'premium' : 'basic');
      } else {
        Alert.alert("We couldn't confirm your purchase yet", 'You have not lost anything. Tap "Restore purchases" in a minute and it will be applied.');
      }
    },
    onPurchaseError: (error: any) => {
      setBusy(null);
      if (error?.code !== 'user-cancelled') Alert.alert('Purchase did not go through', error?.message || 'Please try again.');
    },
  } as any);

  useEffect(() => {
    if (connected) fetchProducts({ skus: SKUS, type: 'subs' } as any);
  }, [connected]);

  // Restore: re-check what Google says this account owns, and apply it.
  useEffect(() => {
    if (!restoring) return;
    (async () => {
      const mine = (availablePurchases || []).filter((p: any) => SKUS.includes(p.productId));
      let applied = 0;
      for (const p of mine) if (await confirmOnServer(p)) applied++;
      setRestoring(false);
      if (applied) await refreshBilling({ force: true });
      await loadCurrent();
      Alert.alert(applied ? 'Restored' : 'Nothing to restore', applied ? 'Your subscription has been applied.' : 'No active Flitters subscription was found on this Google account.');
    })();
  }, [availablePurchases]);

  const subscribe = async (plan: (typeof PLANS)[number], billing: 'monthly' | 'annual') => {
    if (Platform.OS !== 'android') return Alert.alert('Android only', 'Subscriptions are available on Android for now.');
    if (!connected) return Alert.alert('Google Play not ready', 'Please try again in a moment.');
    const sub: any = subscriptions.find((s: any) => s.id === plan.sku);
    // Pick the plan by how often it bills (every month / every year), not by
    // the name given to it in Play Console — Play won't let a base plan ID be
    // changed or reused, so the names can be anything.
    // The billing library has changed the names of these fields between
    // versions, so look at every shape it is known to use rather than one name.
    const rawOffers: any[] =
      sub?.subscriptionOfferDetailsAndroid ||
      sub?.subscriptionOffers ||
      (Object.values(sub || {}).find((v: any) => Array.isArray(v) && v.length && v.some((x: any) => x && (x.offerToken || x.offerTokenAndroid))) as any[]) ||
      [];
    const tokenOf = (o: any) => o?.offerToken || o?.offerTokenAndroid;
    const baseOf = (o: any) => String(o?.basePlanId || o?.basePlanIdAndroid || '');
    const periodOf = (o: any): string => {
      const phases = o?.pricingPhases?.pricingPhaseList || o?.pricingPhasesAndroid?.pricingPhaseList || o?.pricingPhases || [];
      const last = Array.isArray(phases) && phases.length ? phases[phases.length - 1] : null;
      if (last?.billingPeriod) return last.billingPeriod;
      if (o?.period && typeof o.period === 'object') {
        const unit = String(o.period.unit || '').toLowerCase();
        const n = o.period.value || 1;
        if (unit.startsWith('year')) return `P${n}Y`;
        if (unit.startsWith('month')) return `P${n}M`;
      }
      return '';
    };
    // Pick the plan by how often it bills, not by the name given in Play Console.
    const isWanted = (o: any) => {
      const period = periodOf(o);
      if (period) return billing === 'annual' ? period === 'P1Y' : period === 'P1M';
      const id = baseOf(o).toLowerCase();
      return billing === 'annual' ? /annual|year/.test(id) : !/annual|year/.test(id);
    };
    const offers = rawOffers.filter((o: any) => tokenOf(o)).filter(isWanted).map((o: any) => ({ sku: plan.sku, offerToken: tokenOf(o) }));
    if (!sub || !offers.length) {
      console.warn('[billing] plan not offered', plan.sku, billing, (subscriptions as any[]).map((x: any) => x.id));
      return Alert.alert("This plan isn't available right now", 'Please try again in a moment.');
    }
    setBusy(`${plan.key}:${billing}`);
    try {
      await requestPurchase({ request: { google: { skus: [plan.sku], subscriptionOffers: offers } }, type: 'subs' } as any);
    } catch (err: any) {
      setBusy(null);
      Alert.alert('Purchase did not start', err?.message || 'Please try again.');
    }
  };

  const plan = PLANS.find((p) => p.key === tab)!;
  const owned: 'basic' | 'premium' | null = current?.verified_plan === 'premium' ? 'premium' : current?.verified_plan ? 'basic' : null;
  const isMine = owned === tab;
  const includedInPremium = owned === 'premium' && tab === 'basic';
  const yearly = (p: (typeof PLANS)[number]) => p.monthly * 12 * (1 - p.annualDiscount);
  const until = current?.verified_until ? new Date(current.verified_until) : null;
  const untilText = until && !isNaN(until.getTime()) ? until.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  const manage = () => Linking.openURL('https://play.google.com/store/account/subscriptions');
  const tint = plan.color;

  const features = tab === 'basic'
    ? [
        { icon: 'shield-checkmark', text: 'Blue verified badge' },
        { icon: 'videocam', text: 'Videos up to 1 minute' },
        { icon: 'people', text: 'Up to 8 co-owners on a post' },
        { icon: 'color-palette', text: 'Custom chat wallpapers and bubble colours' },
      ]
    : [
        { icon: 'layers', text: 'Everything in Basic' },
        { icon: 'star', text: 'Gold verified badge' },
        { icon: 'sparkles', text: 'More Premium features coming soon' },
      ];

  const celebratePlan = celebrate ? PLANS.find((p) => p.key === celebrate)! : null;

  return (
    <View style={{ flex: 1, backgroundColor: '#0B0F1A' }}>
      <LinearGradient
        colors={tab === 'basic' ? ['#0E2A66', '#0B1530', '#0B0F1A'] : ['#4A3300', '#1E1600', '#0B0F1A']}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.top}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.seg}>
          {PLANS.map((p) => (
            <TouchableOpacity key={p.key} onPress={() => setTab(p.key as any)} style={[styles.segBtn, tab === p.key && { backgroundColor: p.color }]}>
              <Text style={{ color: tab === p.key ? (p.key === 'premium' ? '#1a1300' : '#fff') : 'rgba(255,255,255,0.75)', fontWeight: '800', fontSize: 13 }}>{p.name.replace('Flitters ', '')}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => {
            setRestoring(true);
            getAvailablePurchases();
          }}
        >
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontWeight: '700', fontSize: 12 }}>{restoring ? 'Checking…' : 'Restore'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ alignItems: 'center', paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        <View style={{ marginTop: -10, marginBottom: -30 }}>
          <AnimatedBadge key={tab} plan={tab} size={130} />
        </View>
        <Text style={styles.title}>{plan.name}</Text>
        <Text style={styles.tagline}>{plan.tagline}</Text>

        <View style={styles.features}>
          {features.map((f) => (
            <View key={f.text} style={styles.featRow}>
              <View style={[styles.featIcon, { backgroundColor: tint + '33' }]}>
                <Ionicons name={f.icon as any} size={17} color={tint} />
              </View>
              <Text style={styles.featText}>{f.text}</Text>
            </View>
          ))}
        </View>

        {isMine && (
          <View style={[styles.status, { borderColor: tint }]}>
            <Ionicons name="checkmark-circle" size={20} color={tint} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>Active{untilText ? ` · Renews ${untilText}` : ''}</Text>
              <TouchableOpacity onPress={manage}>
                <Text style={{ color: tint, fontWeight: '700', marginTop: 3 }}>Manage in Google Play</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {!owned && hadBefore && (
          <View style={[styles.status, { borderColor: '#F87171' }]}>
            <Ionicons name="alert-circle" size={20} color="#F87171" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>Your subscription has ended</Text>
              <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 3 }}>Your badge was removed. Subscribe again below to get it back.</Text>
            </View>
          </View>
        )}
        {includedInPremium && (
          <View style={[styles.status, { borderColor: '#F5B301' }]}>
            <Ionicons name="star" size={20} color="#F5B301" />
            <Text style={{ color: '#fff', fontWeight: '800', flex: 1 }}>Included in your Premium plan</Text>
          </View>
        )}
        {owned === 'basic' && tab === 'premium' && (
          <Text style={styles.note}>Upgrading to Premium is a separate subscription. After you subscribe, cancel Basic in Google Play so you are not charged for both.</Text>
        )}
      </ScrollView>

      {!isMine && !includedInPremium && (
        <View style={styles.bottom}>
          {(['monthly', 'annual'] as const).map((b) => {
            const key = `${plan.key}:${b}`;
            const isYear = b === 'annual';
            const amount = isYear ? yearly(plan) : plan.monthly;
            const primary = isYear;
            const label = isYear ? 'Yearly' : 'Monthly';
            const sub = isYear ? `$${amount.toFixed(0)} / year · Save ${Math.round(plan.annualDiscount * 100)}%` : `$${amount.toFixed(0)} / month`;
            const txt = primary ? (tab === 'premium' ? '#1a1300' : '#fff') : '#fff';
            return (
              <TouchableOpacity
                key={b}
                disabled={!!busy}
                onPress={() => subscribe(plan, b)}
                style={[
                  styles.buyBtn,
                  primary ? { backgroundColor: tint } : { backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1.5, borderColor: tint },
                  busy && busy !== key && { opacity: 0.5 },
                ]}
              >
                {busy === key ? (
                  <ActivityIndicator color={txt} />
                ) : (
                  <>
                    <Text style={{ color: txt, fontWeight: '900', fontSize: 15 }}>{label}</Text>
                    <Text style={{ color: txt, opacity: 0.85, fontSize: 11, marginTop: 2, fontWeight: '600' }}>{sub}</Text>
                  </>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      <Text style={styles.fine}>Billed through Google Play and renewed automatically until you cancel in Google Play. The price you pay is the one Google Play shows at checkout.</Text>

      <Modal visible={!!celebratePlan} transparent animationType="fade" onRequestClose={() => setCelebrate(null)}>
        {celebratePlan && (
          <View style={styles.celebrate}>
            <LinearGradient colors={celebratePlan.key === 'premium' ? ['#4A3300', '#0B0F1A'] : ['#0E2A66', '#0B0F1A']} style={StyleSheet.absoluteFill} />
            <AnimatedBadge plan={celebratePlan.key as any} size={170} />
            <Text style={[styles.title, { marginTop: -20 }]}>Welcome to {celebratePlan.name}</Text>
            <Text style={styles.tagline}>Your badge is live.</Text>
            <View style={styles.features}>
              {celebratePlan.perks.map((perk) => (
                <View key={perk} style={styles.featRow}>
                  <Ionicons name="checkmark-circle" size={20} color={celebratePlan.color} />
                  <Text style={styles.featText}>{perk}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={[styles.doneBtn, { backgroundColor: celebratePlan.color }]} onPress={() => { setCelebrate(null); router.back(); }}>
              <Text style={{ color: celebratePlan.key === 'premium' ? '#1a1300' : '#fff', fontWeight: '900', fontSize: 16 }}>Done</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={manage} style={{ marginTop: 14 }}>
              <Text style={{ color: 'rgba(255,255,255,0.75)', fontWeight: '700' }}>Manage subscription</Text>
            </TouchableOpacity>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 54, paddingHorizontal: 16, paddingBottom: 6 },
  seg: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 20, padding: 3 },
  segBtn: { paddingVertical: 7, paddingHorizontal: 22, borderRadius: 17 },
  title: { color: '#fff', fontSize: 26, fontWeight: '900', textAlign: 'center' },
  tagline: { color: 'rgba(255,255,255,0.75)', fontSize: 14, marginTop: 4, textAlign: 'center', paddingHorizontal: 30 },
  features: { alignSelf: 'stretch', marginHorizontal: 22, marginTop: 22, gap: 12 },
  featRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  featText: { color: '#fff', fontSize: 15, fontWeight: '600', flex: 1 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch', marginHorizontal: 22, marginTop: 22, borderWidth: 1.5, borderRadius: 16, padding: 14, backgroundColor: 'rgba(255,255,255,0.06)' },
  note: { color: 'rgba(255,255,255,0.65)', fontSize: 12, lineHeight: 18, textAlign: 'center', marginHorizontal: 28, marginTop: 16 },
  bottom: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 10 },
  buyBtn: { flex: 1, borderRadius: 26, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', minHeight: 58 },
  fine: { color: 'rgba(255,255,255,0.45)', fontSize: 10.5, textAlign: 'center', lineHeight: 15, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 22 },
  celebrate: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0B0F1A', paddingHorizontal: 10 },
  doneBtn: { alignSelf: 'stretch', marginHorizontal: 28, marginTop: 28, borderRadius: 26, paddingVertical: 14, alignItems: 'center' },
});
