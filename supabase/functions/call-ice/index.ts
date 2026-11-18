// Gives the signed-in app the list of servers a phone call needs to connect (STUN, and TURN for the
// networks where a direct connection is impossible). Needs a signed-in user: the app calls it with
// the person's login, and Supabase checks that for us (leave "Verify JWT" ON for this function).
//
// Pick ONE way to provide TURN (set these under Edge Functions > Secrets):
//   A) Your own coturn server:    TURN_URLS="turn:turn.example.com:3478?transport=udp,turns:turn.example.com:5349?transport=tcp"
//                                 TURN_SECRET="<static-auth-secret from turnserver.conf, with use-auth-secret on>"
//   B) Metered (hosted, free tier):  METERED_DOMAIN="yourapp.metered.live"   METERED_SECRET_KEY="<secret key>"
//      (older Metered accounts that show an API key instead can use METERED_API_KEY="<api key>")
// With neither, only free Google STUN is returned: calls work on most Wi-Fi and some mobile networks, not all.

const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

async function hmacBase64(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

function userIdFromJwt(req: Request): string {
  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer /i, '');
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub || 'user';
  } catch {
    return 'user';
  }
}

// Metered gives a secret key. With it we create one calling credential (valid 12 hours) and reuse it for
// everyone, instead of making a new one per call (a new credential can take a moment to start working).
let cached: { servers: unknown[]; made: number } | null = null;
async function meteredFromSecret(domain: string, secret: string): Promise<unknown[]> {
  const now = Date.now();
  if (cached && now - cached.made < 11 * 3600 * 1000) return cached.servers;
  let servers: unknown[] = [];
  try {
    const r = await fetch(`https://${domain}/api/v1/turn/credential?secretKey=${encodeURIComponent(secret)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiryInSeconds: 12 * 3600, label: 'flitters-calls' }),
    });
    if (!r.ok) {
      console.error('[call-ice] metered credential create failed', r.status, await r.text());
      return cached?.servers || [];
    }
    const cred = await r.json();
    // Ask Metered for the ready-made server list for this credential; if that is not available, use their standard servers.
    try {
      const l = await fetch(`https://${domain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(cred.apiKey)}`);
      if (l.ok) {
        const list = await l.json();
        if (Array.isArray(list)) servers = list.filter((x) => x && x.urls);
      }
    } catch { /* fall through to the standard list */ }
    if (!servers.length) {
      servers = [{
        urls: ['turn:global.relay.metered.ca:80', 'turn:global.relay.metered.ca:80?transport=tcp', 'turn:global.relay.metered.ca:443', 'turns:global.relay.metered.ca:443?transport=tcp'],
        username: cred.username,
        credential: cred.password,
      }];
    }
    cached = { servers, made: now };
  } catch (err) {
    console.error('[call-ice] metered failed:', err);
    return cached?.servers || [];
  }
  return servers;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const servers: unknown[] = [...STUN];
  try {
    const urls = (Deno.env.get('TURN_URLS') || '').split(',').map((u) => u.trim()).filter(Boolean);
    const secret = Deno.env.get('TURN_SECRET');
    const metered = Deno.env.get('METERED_DOMAIN');
    const meteredKey = Deno.env.get('METERED_API_KEY');
    const meteredSecret = Deno.env.get('METERED_SECRET_KEY');
    if (urls.length && secret) {
      // coturn "REST API" credentials: a name that expires in 1 hour and its signature.
      const username = `${Math.floor(Date.now() / 1000) + 3600}:${userIdFromJwt(req)}`;
      servers.push({ urls, username, credential: await hmacBase64(secret, username) });
    } else if (metered && meteredSecret) {
      servers.push(...(await meteredFromSecret(metered, meteredSecret)));
    } else if (metered && meteredKey) {
      const r = await fetch(`https://${metered}/api/v1/turn/credentials?apiKey=${encodeURIComponent(meteredKey)}`);
      if (r.ok) {
        const list = await r.json();
        if (Array.isArray(list)) servers.push(...list.filter((x) => x && x.urls));
      } else {
        console.error('[call-ice] metered returned', r.status);
      }
    }
  } catch (err) {
    console.error('[call-ice] failed to build TURN list:', err);
  }
  return new Response(JSON.stringify({ iceServers: servers }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
});
