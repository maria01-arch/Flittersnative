import AsyncStorage from '@react-native-async-storage/async-storage';

// Shows a dollar amount in the person's own money. The country comes from the phone's region setting;
// the exchange rate comes from a free public rate list and is remembered for 12 hours.
const REGION_CURRENCY: Record<string, string> = {
  US: 'USD', CA: 'CAD', GB: 'GBP', NG: 'NGN', GH: 'GHS', KE: 'KES', ZA: 'ZAR', EG: 'EGP', TZ: 'TZS', UG: 'UGX', ET: 'ETB', MA: 'MAD', SN: 'XOF', CI: 'XOF', CM: 'XAF',
  IN: 'INR', PK: 'PKR', BD: 'BDT', LK: 'LKR', NP: 'NPR', ID: 'IDR', MY: 'MYR', SG: 'SGD', PH: 'PHP', TH: 'THB', VN: 'VND', CN: 'CNY', HK: 'HKD', TW: 'TWD', JP: 'JPY', KR: 'KRW',
  AU: 'AUD', NZ: 'NZD', AE: 'AED', SA: 'SAR', QA: 'QAR', KW: 'KWD', IL: 'ILS', TR: 'TRY', RU: 'RUB', UA: 'UAH', PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', SE: 'SEK', NO: 'NOK', DK: 'DKK', CH: 'CHF',
  BR: 'BRL', MX: 'MXN', AR: 'ARS', CL: 'CLP', CO: 'COP', PE: 'PEN',
  DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR', PT: 'EUR', IE: 'EUR', AT: 'EUR', FI: 'EUR', GR: 'EUR',
};

export function deviceRegion(): string {
  try {
    const loc = (Intl.NumberFormat().resolvedOptions().locale || '').replace('_', '-');
    const m = loc.match(/-([A-Za-z]{2})\b/);
    if (m) return m[1].toUpperCase();
  } catch {}
  return 'US';
}

export const currencyForRegion = (r: string) => REGION_CURRENCY[r] || 'USD';

const KEY = 'flit.fx.v1';
export async function usdRate(code: string): Promise<number> {
  if (code === 'USD') return 1;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const c = JSON.parse(raw);
      if (Date.now() - c.at < 12 * 3600 * 1000 && c.rates?.[code]) return Number(c.rates[code]);
    }
  } catch {}
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    const j = await res.json();
    if (j?.rates?.[code]) {
      try { await AsyncStorage.setItem(KEY, JSON.stringify({ at: Date.now(), rates: j.rates })); } catch {}
      return Number(j.rates[code]);
    }
  } catch {}
  return 0;   // no rate available: caller falls back to dollars
}

export function formatMoney(amount: number, code: string): string {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: code, maximumFractionDigits: 2 }).format(amount); }
  catch { return `${code} ${amount.toFixed(2)}`; }
}

// "$5.00 (≈ ₦7,500.00)" for someone in Nigeria; just "$5.00" for someone in the US or if no rate is available.
export async function usdWithLocal(usd: number): Promise<{ usd: string; local: string | null; code: string }> {
  const code = currencyForRegion(deviceRegion());
  const base = formatMoney(usd, 'USD');
  if (code === 'USD') return { usd: base, local: null, code };
  const r = await usdRate(code);
  return { usd: base, local: r ? formatMoney(usd * r, code) : null, code };
}
