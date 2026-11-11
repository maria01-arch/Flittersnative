// Turns what a QR code says into a screen inside the app. Only Flitters
// addresses are accepted (profile, post, group invite, hashtag). Anything
// else — another website, plain text — is refused, so scanning a stranger's
// code can never send you somewhere unexpected.
import { HOSTS_PATTERN } from './siteConfig';
const KINDS = ['u', 'user', 'p', 'post', 'join', 'hashtag'];

export function flittersPathFromScan(raw: string): string | null {
  const text = (raw || '').trim();
  const m = new RegExp('^(?:https?:\\/\\/(?:www\\.)?' + HOSTS_PATTERN + '|flittersnative:\\/)\\/(?:\\/)?([a-z]+)\\/([A-Za-z0-9_.\\-%]+)\\/?(?:[?#].*)?$', 'i').exec(text);
  if (!m) return null;
  const kind = m[1].toLowerCase();
  if (!KINDS.includes(kind)) return null;
  return `/${kind}/${m[2]}`;
}
