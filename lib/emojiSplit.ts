// Finds emoji inside normal text, by hand (no Unicode regex) so it behaves the same
// on every phone. Returns the text cut into pieces: plain text, and emoji.
export type EmojiPiece = { t: string; emoji: boolean };

const isSkin = (c: number) => c >= 0x1f3fb && c <= 0x1f3ff;
const isTag = (c: number) => c >= 0xe0020 && c <= 0xe007f;
const isRegional = (c: number) => c >= 0x1f1e6 && c <= 0x1f1ff;

// Symbols below 0x1f000 that are drawn as emoji by themselves (no fe0f needed).
const EMOJI_BY_DEFAULT = new Set<number>([
  0x231a, 0x231b, 0x23e9, 0x23ea, 0x23eb, 0x23ec, 0x23f0, 0x23f3, 0x25fd, 0x25fe, 0x2614, 0x2615,
  0x267f, 0x2693, 0x26a1, 0x26aa, 0x26ab, 0x26bd, 0x26be, 0x26c4, 0x26c5, 0x26ce, 0x26d4, 0x26ea,
  0x26f2, 0x26f3, 0x26f5, 0x26fa, 0x26fd, 0x2705, 0x270a, 0x270b, 0x2728, 0x274c, 0x274e, 0x2753,
  0x2754, 0x2755, 0x2757, 0x2795, 0x2796, 0x2797, 0x27b0, 0x27bf, 0x2b1b, 0x2b1c, 0x2b50, 0x2b55,
]);
for (let c = 0x2648; c <= 0x2653; c++) EMOJI_BY_DEFAULT.add(c);

const isBig = (c: number) => (c >= 0x1f300 && c <= 0x1faff) || (c >= 0x1f000 && c <= 0x1f2ff);

// Quick check used before doing any work.
export function mayHaveEmoji(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const u = s.charCodeAt(i);
    if (u >= 0xd800 || (u >= 0x2190 && u < 0x2c00) || u === 0x20e3 || u === 0xa9 || u === 0xae || u === 0x203c || u === 0x2049 || u === 0x2122) return true;
  }
  return false;
}

export function splitEmoji(text: string): EmojiPiece[] {
  const cps = Array.from(text).map((ch) => ch.codePointAt(0) || 0);
  const out: EmojiPiece[] = [];
  let plain = '';
  const flush = () => {
    if (plain) out.push({ t: plain, emoji: false });
    plain = '';
  };
  let i = 0;
  while (i < cps.length) {
    const c = cps[i];
    let end = -1; // index after the emoji, if one starts here
    if (isRegional(c) && i + 1 < cps.length && isRegional(cps[i + 1])) {
      end = i + 2;
    } else if (((c >= 0x30 && c <= 0x39) || c === 0x23 || c === 0x2a) && (cps[i + 1] === 0x20e3 || (cps[i + 1] === 0xfe0f && cps[i + 2] === 0x20e3))) {
      end = cps[i + 1] === 0x20e3 ? i + 2 : i + 3;
    } else if (isBig(c) || EMOJI_BY_DEFAULT.has(c) || (c >= 0xa9 && c < 0x3300 && cps[i + 1] === 0xfe0f && (c === 0xa9 || c === 0xae || c === 0x203c || c === 0x2049 || c === 0x2122 || (c >= 0x2190 && c < 0x2c00) || c === 0x3030 || c === 0x303d || c === 0x3297 || c === 0x3299))) {
      end = i + 1;
    }
    if (end < 0) {
      plain += String.fromCodePoint(c);
      i++;
      continue;
    }
    // Take everything that belongs to this emoji: markers, skin tones, joined parts.
    let j = end;
    for (;;) {
      const n = cps[j];
      if (n === undefined) break;
      if (n === 0xfe0f || isSkin(n) || isTag(n) || n === 0x20e3) {
        j++;
      } else if (n === 0x200d && cps[j + 1] !== undefined && (isBig(cps[j + 1]) || (cps[j + 1] >= 0x2190 && cps[j + 1] < 0x2c00))) {
        j += 2;
      } else break;
    }
    flush();
    out.push({ t: cps.slice(i, j).map((x) => String.fromCodePoint(x)).join(''), emoji: true });
    i = j;
  }
  flush();
  return out;
}

// A single symbol picked from the emoji list gets its invisible "make it an emoji"
// marker, so it is drawn (and sent) as an emoji, not a plain black symbol.
export function qualify(e: string): string {
  const cps = Array.from(e);
  if (cps.length !== 1) return e;
  const c = cps[0].codePointAt(0) || 0;
  if (c >= 0x2190 && c < 0x2c00 && !EMOJI_BY_DEFAULT.has(c)) return e + '️';
  if (c === 0xa9 || c === 0xae || c === 0x203c || c === 0x2049 || c === 0x2122) return e + '️';
  return e;
}

// Backspace for the emoji tray: removes the last emoji as a whole, or else the last character.
export function deleteLast(t: string): string {
  if (!t) return t;
  const parts = splitEmoji(t);
  const last = parts[parts.length - 1];
  const head = parts.slice(0, -1).map((p) => p.t).join('');
  if (last.emoji) return head;
  const cps = Array.from(last.t);
  cps.pop();
  return head + cps.join('');
}
