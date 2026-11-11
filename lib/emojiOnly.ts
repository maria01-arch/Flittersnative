// True when a message is exactly ONE emoji (and nothing else). Such a message is
// shown big, with no bubble. Written by hand (no Unicode regex) so it behaves the
// same on every phone.
const isSkinTone = (c: number) => c >= 0x1f3fb && c <= 0x1f3ff;
const isTag = (c: number) => c >= 0xe0020 && c <= 0xe007f;
const isRegional = (c: number) => c >= 0x1f1e6 && c <= 0x1f1ff;

const isBase = (c: number) =>
  (c >= 0x1f300 && c <= 0x1faff) ||
  (c >= 0x2600 && c <= 0x27bf) ||
  (c >= 0x2194 && c <= 0x2199) ||
  c === 0x21a9 ||
  c === 0x21aa ||
  c === 0x231a ||
  c === 0x231b ||
  (c >= 0x23e9 && c <= 0x23f3) ||
  (c >= 0x23f8 && c <= 0x23fa) ||
  c === 0x24c2 ||
  c === 0x25aa ||
  c === 0x25ab ||
  c === 0x25b6 ||
  c === 0x25c0 ||
  (c >= 0x25fb && c <= 0x25fe) ||
  c === 0x2934 ||
  c === 0x2935 ||
  (c >= 0x2b05 && c <= 0x2b07) ||
  c === 0x2b1b ||
  c === 0x2b1c ||
  c === 0x2b50 ||
  c === 0x2b55 ||
  c === 0x203c ||
  c === 0x2049 ||
  c === 0x3030 ||
  c === 0x303d ||
  c === 0x3297 ||
  c === 0x3299;

export function isSingleEmoji(text?: string | null): boolean {
  if (!text) return false;
  const s = text.trim();
  if (!s || s.length > 40) return false;
  const cps = Array.from(s).map((ch) => ch.codePointAt(0) as number);
  let units = 0;
  let joined = false; // the previous mark was a joiner, so the next emoji is part of the same one
  let i = 0;
  while (i < cps.length) {
    const c = cps[i];
    if (c === 0x200d) {
      if (units === 0) return false;
      joined = true;
      i++;
      continue;
    }
    if (c === 0xfe0f || isSkinTone(c) || isTag(c)) {
      if (units === 0) return false;
      i++;
      continue;
    }
    if (isRegional(c)) {
      if (!joined) units++;
      joined = false;
      i += i + 1 < cps.length && isRegional(cps[i + 1]) ? 2 : 1;
      continue;
    }
    if (isBase(c)) {
      if (!joined) units++;
      joined = false;
      i++;
      continue;
    }
    // Keycap emoji such as 1️⃣
    if ((c >= 0x30 && c <= 0x39) || c === 0x23 || c === 0x2a) {
      let j = i + 1;
      if (cps[j] === 0xfe0f) j++;
      if (cps[j] === 0x20e3) {
        if (!joined) units++;
        joined = false;
        i = j + 1;
        continue;
      }
    }
    return false;
  }
  return units === 1;
}
