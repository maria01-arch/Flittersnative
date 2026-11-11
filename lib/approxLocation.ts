import { Platform } from 'react-native';

// An APPROXIMATE place (city / region / country) worked out from the internet
// connection — no location permission, no prompt, no GPS. Good enough to show
// "where you logged in" without ever asking the person to turn location on.
// It can be off by a city on mobile data; that is fine for a security log.
export type ApproxPlace = { city: string | null; region: string | null; country: string | null };

async function getJson(url: string, ms: number): Promise<any | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function getApproxPlace(): Promise<ApproxPlace | null> {
  const a = await getJson('https://ipwho.is/', 4500);
  if (a && a.success !== false && (a.city || a.region || a.country)) {
    return { city: a.city || null, region: a.region || null, country: a.country || null };
  }
  const b = await getJson('https://ipapi.co/json/', 4500);
  if (b && !b.error && (b.city || b.region || b.country_name)) {
    return { city: b.city || null, region: b.region || null, country: b.country_name || null };
  }
  return null;
}

// "Infinix X6525D", "Samsung SM-A546B", "iPhone" — read from the phone itself.
export function getDeviceName(): string {
  try {
    if (Platform.OS === 'android') {
      const c: any = Platform.constants || {};
      const brand = String(c.Brand || c.Manufacturer || '').trim();
      const model = String(c.Model || '').trim();
      if (!model) return brand || 'Android phone';
      const b = brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : '';
      return b && !model.toLowerCase().startsWith(brand.toLowerCase()) ? `${b} ${model}` : model;
    }
    if (Platform.OS === 'ios') return (Platform as any).isPad ? 'iPad' : 'iPhone';
  } catch {}
  return Platform.OS;
}

export function placeLabel(p: { city?: string | null; region?: string | null; country?: string | null }): string | null {
  const parts = [p.city, p.region, p.country].filter(Boolean) as string[];
  // Drop repeats ("Lagos, Lagos").
  const uniq = parts.filter((x, i) => parts.indexOf(x) === i);
  return uniq.length ? uniq.join(', ') : null;
}
