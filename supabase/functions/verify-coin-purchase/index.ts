// Checks a Flit coin purchase with Google Play, then adds the coins to the buyer's wallet.
// The app calls this after the buyer pays. Leave "Verify JWT" ON (it needs a signed-in user).
//
// Secrets (Edge Functions > Secrets):
//   GOOGLE_SERVICE_ACCOUNT_JSON   the whole JSON file of a Google service account that has been
//                                 given access to your app in Play Console (Users and permissions >
//                                 Invite user > paste the service account's email > allow "View financial
//                                 data" and "Manage orders and subscriptions"). Reuse the one your website uses.
//   ANDROID_PACKAGE               optional, defaults to com.xchordlabs.flitters
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const b64url = (buf: ArrayBuffer | string) => {
  const bytes = typeof buf === 'string' ? new TextEncoder().encode(buf) : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function googleToken(sa: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3000 }));
  const pem = String(sa.private_key).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${claim}`));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${b64url(sig)}` }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('Google sign-in failed: ' + JSON.stringify(j));
  return j.access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = Deno.env.get('SUPABASE_URL')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const db = createClient(url, service);

    // who is asking
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer /i, '');
    const { data: u, error: uerr } = await db.auth.getUser(jwt);
    if (uerr || !u?.user) return json({ error: 'Sign in first.' }, 401);
    const uid = u.user.id;

    const { productId, purchaseToken } = await req.json();
    if (!productId || !purchaseToken) return json({ error: 'Missing purchase details.' }, 400);
    const { data: pack } = await db.from('coin_packs').select('sku').eq('sku', productId).maybeSingle();
    if (!pack) return json({ error: 'Unknown coin pack.' }, 400);

    const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
    if (!raw) return json({ error: 'Server is not set up for purchases yet.' }, 500);
    const pkg = Deno.env.get('ANDROID_PACKAGE') || 'com.xchordlabs.flitters';
    const token = await googleToken(JSON.parse(raw));
    const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;

    const r = await fetch(base, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) { console.warn('Google said', r.status, await r.text()); return json({ error: 'Google could not confirm this purchase.' }, 400); }
    const p = await r.json();
    if (p.purchaseState === 2) return json({ pending: true, error: 'This payment is still pending. Coins arrive once it completes.' }, 202);
    if (p.purchaseState !== 0) return json({ error: 'This purchase was cancelled or refunded.' }, 400);

    const { data: res, error } = await db.rpc('credit_coin_purchase', { p_user: uid, p_sku: productId, p_token: purchaseToken, p_order: p.orderId ?? null });
    if (error) return json({ error: error.message }, 500);

    // Mark it used up so the same product can be bought again. Failure here is harmless (the app also consumes it).
    try { await fetch(`${base}:consume`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Length': '0' } }); } catch {}

    return json({ ok: true, ...(res as object) });
  } catch (e) {
    console.error(e);
    return json({ error: 'Something went wrong confirming the purchase.' }, 500);
  }
});
