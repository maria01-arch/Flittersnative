import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { shrinkImage } from './upload';

// Chat themes are personal: they are saved on THIS phone, per conversation, and
// only change what the person who set them sees. The other person's screen
// is not affected. Only verified accounts can change them.
export type ChatTheme = {
  wallpaper: { kind: 'none' } | { kind: 'preset'; id: string } | { kind: 'upload'; uri: string };
  // Id of a look in BUBBLE_STYLES ('default' = navy blue; older saved themes may say 'navy').
  bubble: string;
  // How much an uploaded wallpaper is darkened (0 = untouched, up to 0.7), so text stays readable.
  dim: number;
};

export const DEFAULT_THEME: ChatTheme = { wallpaper: { kind: 'none' }, bubble: 'default', dim: 0.25 };

export const WALLPAPER_PRESETS: { id: string; name: string; colors: [string, string] }[] = [
  { id: 'midnight', name: 'Midnight', colors: ['#0b1220', '#1e3a8a'] },
  { id: 'forest', name: 'Forest', colors: ['#052e16', '#15803d'] },
  { id: 'dusk', name: 'Dusk', colors: ['#2e1065', '#be185d'] },
  { id: 'ember', name: 'Ember', colors: ['#1c1917', '#9a3412'] },
];

// My own message bubbles. Navy blue is the default for everyone; verified members can
// pick another solid colour or a gradient (two or more colours).
export const DEFAULT_BUBBLE_COLOR = '#1E3A8A';
export type BubbleStyle = { id: string; name: string; colors: string[] };
export const BUBBLE_STYLES: BubbleStyle[] = [
  { id: 'default', name: 'Navy', colors: [DEFAULT_BUBBLE_COLOR] },
  { id: 'light', name: 'Light blue', colors: ['@primary'] }, // the app's own blue (changes with light/dark mode)
  { id: 'green', name: 'Green', colors: ['#15803D'] },
  { id: 'red', name: 'Red', colors: ['#B91C1C'] },
  { id: 'purple', name: 'Purple', colors: ['#6D28D9'] },
  { id: 'teal', name: 'Teal', colors: ['#0F766E'] },
  { id: 'pink', name: 'Pink', colors: ['#BE185D'] },
  { id: 'sunset', name: 'Sunset', colors: ['#EA580C', '#DB2777'] },
  { id: 'ocean', name: 'Ocean', colors: ['#0EA5E9', '#1D4ED8'] },
  { id: 'aurora', name: 'Aurora', colors: ['#059669', '#2563EB'] },
  { id: 'grape', name: 'Grape', colors: ['#7C3AED', '#DB2777'] },
  { id: 'midnight', name: 'Midnight', colors: ['#0F172A', '#1E40AF'] },
  { id: 'ember', name: 'Ember', colors: ['#DC2626', '#EA580C'] },
  { id: 'lagoon', name: 'Lagoon', colors: ['#0D9488', '#2563EB', '#7C3AED'] },
];

// What to paint my bubbles with: one colour, plus the gradient colours when it is one.
export function resolveBubble(id: string | undefined, primary: string): { color: string; gradient?: string[] } {
  const st = BUBBLE_STYLES.find((b) => b.id === (id === 'navy' ? 'default' : id)) || BUBBLE_STYLES[0];
  const cols = st.colors.map((c) => (c === '@primary' ? primary : c));
  return cols.length > 1 ? { color: cols[0], gradient: cols } : { color: cols[0] };
}

const key = (conversationId: string) => `chat_theme_${conversationId}`;

// Themes live on the phone (AsyncStorage), which answers a moment AFTER a chat first
// draws, so chats used to show the plain colours first and then flip. This copy is
// kept in memory (filled when the Chats tab opens) so a chat can start in the right look.
const mem = new Map<string, string>();
let warmed = false;

export async function warmChatThemes() {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith('chat_theme_'));
    const pairs = keys.length ? await AsyncStorage.multiGet(keys) : [];
    pairs.forEach(([k, v]) => {
      if (v) mem.set(k, v);
    });
    warmed = true;
  } catch {}
}

// The theme right now, without waiting. undefined = not known yet (use the plain look).
export function peekChatTheme(conversationId: string): ChatTheme | undefined {
  if (!warmed) return undefined;
  const raw = mem.get(key(conversationId)) ?? mem.get(key('global'));
  try {
    return raw ? { ...DEFAULT_THEME, ...JSON.parse(raw) } : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

// A chat's own theme wins; otherwise the person's default from Settings (id
// 'global'), which covers every chat and group; otherwise the plain look.
export async function loadChatTheme(conversationId: string): Promise<ChatTheme> {
  try {
    const specific = conversationId !== 'global' ? await AsyncStorage.getItem(key(conversationId)) : null;
    const globalRaw = await AsyncStorage.getItem(key('global'));
    if (specific) mem.set(key(conversationId), specific);
    if (globalRaw) mem.set(key('global'), globalRaw);
    const raw = specific ?? globalRaw;
    return raw ? { ...DEFAULT_THEME, ...JSON.parse(raw) } : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export async function clearChatTheme(conversationId: string) {
  mem.delete(key(conversationId));
  await AsyncStorage.removeItem(key(conversationId));
}

export async function saveChatTheme(conversationId: string, theme: ChatTheme) {
  mem.set(key(conversationId), JSON.stringify(theme));
  await AsyncStorage.setItem(key(conversationId), JSON.stringify(theme));
}

// Lets the person pick a picture from their phone, shrinks it, and keeps a
// copy inside the app (the picker's own copy can be deleted by the system).
export async function pickWallpaper(conversationId: string): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (result.canceled || !result.assets?.[0]) return null;
  const small = await shrinkImage(result.assets[0].uri, 1080);
  const dest = `${FileSystem.documentDirectory}wallpaper_${conversationId}_${Date.now()}.jpg`;
  await FileSystem.copyAsync({ from: small, to: dest });
  return dest;
}
