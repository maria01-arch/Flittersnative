import { lightColors, darkColors } from './theme';

// App themes: the accent colour (buttons, links, highlights) and the surface
// style (background and card tones) are picked separately, then combined with
// Light / Dark / System. Everything is saved on this phone only.
export type Palette = typeof lightColors;

export type Accent = { id: string; name: string; light: string; dark: string };
export const ACCENTS: Accent[] = [
  { id: 'blue', name: 'Blue', light: lightColors.primary, dark: darkColors.primary },
  { id: 'ocean', name: 'Ocean blue', light: '#0077B6', dark: '#00B4D8' },
  { id: 'violet', name: 'Violet', light: '#7C3AED', dark: '#8B5CF6' },
  { id: 'indigo', name: 'Indigo', light: '#4F46E5', dark: '#6366F1' },
  { id: 'pink', name: 'Pink', light: '#DB2777', dark: '#EC4899' },
  { id: 'red', name: 'Red', light: '#DC2626', dark: '#EF4444' },
  { id: 'orange', name: 'Orange', light: '#EA580C', dark: '#F97316' },
  { id: 'green', name: 'Green', light: '#16A34A', dark: '#22C55E' },
  { id: 'teal', name: 'Teal', light: '#0D9488', dark: '#14B8A6' },
];

type Surface = { id: string; name: string; hint: string; light: Partial<Palette>; dark: Partial<Palette> };
export const SURFACES: Surface[] = [
  { id: 'classic', name: 'Classic', hint: 'The standard Flitters look', light: {}, dark: {} },
  {
    id: 'slate', name: 'Slate', hint: 'Cool blue-grey',
    light: { bg: '#F8FAFC', card: '#FFFFFF', border: '#E2E8F0', inputBg: '#EEF2F7', bubbleTheirs: '#EEF2F7' },
    dark: { bg: '#0F172A', card: '#1E293B', border: '#334155', text: '#F1F5F9', subtext: '#94A3B8', faint: '#64748B', inputBg: '#1E293B', bubbleTheirs: '#1E293B' },
  },
  {
    id: 'ocean', name: 'Ocean', hint: 'Deep sea blues',
    light: { bg: '#F3FAFD', card: '#FFFFFF', border: '#D5E9F2', inputBg: '#E6F3F9', bubbleTheirs: '#E6F3F9' },
    dark: { bg: '#04141F', card: '#0A2030', border: '#143247', text: '#E6F4FA', subtext: '#8DB3C7', faint: '#527A8F', inputBg: '#0C2638', bubbleTheirs: '#0C2638' },
  },
  {
    id: 'warm', name: 'Warm', hint: 'Soft, paper-like tones',
    light: { bg: '#FBF7F2', card: '#FFFFFF', border: '#EADFD2', text: '#2B2118', subtext: '#7A6A58', faint: '#A8998A', inputBg: '#F3ECE3', bubbleTheirs: '#F3ECE3' },
    dark: { bg: '#16120E', card: '#211B15', border: '#33291F', text: '#F5EFE6', subtext: '#B5A793', faint: '#7A6E5E', inputBg: '#2A221A', bubbleTheirs: '#2A221A' },
  },
  {
    id: 'black', name: 'Pure black', hint: 'Dark mode only. Saves battery on OLED screens',
    light: {},
    dark: { bg: '#000000', card: '#0A0A0A', border: '#1A1A1A', inputBg: '#111111', bubbleTheirs: '#111111' },
  },
];

function shade(hex: string, amt: number): string {
  const ch = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16);
    const n = amt < 0 ? Math.round(v * (1 + amt)) : Math.round(v + (255 - v) * amt);
    return Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  });
  return '#' + ch.join('');
}

export function buildColors(isDark: boolean, accentId: string, surfaceId: string): Palette {
  const base = isDark ? darkColors : lightColors;
  const surface = SURFACES.find((s) => s.id === surfaceId) || SURFACES[0];
  const accent = ACCENTS.find((a) => a.id === accentId);
  let primary = base.primary;
  if (accent) primary = isDark ? accent.dark : accent.light;
  const out: Palette = { ...base, ...(isDark ? surface.dark : surface.light), primary, primaryDark: shade(primary, -0.15) };
  if (primary === base.primary) out.primaryDark = base.primaryDark;
  return out;
}
