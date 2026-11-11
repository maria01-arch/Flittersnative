import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { shrinkImage } from './upload';

// Chat themes are personal: they are saved on THIS phone, per conversation, and
// only change what the person who set them sees. The other person's screen
// is not affected. Only verified accounts can change them.
export type ChatTheme = {
  wallpaper: { kind: 'none' } | { kind: 'preset'; id: string } | { kind: 'upload'; uri: string };
  bubble: 'default' | 'navy' | 'green' | 'red';
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

// My own message bubbles: navy blue, green or red (or the app's normal colour).
export const BUBBLE_COLORS: Record<string, string> = { navy: '#1E3A8A', green: '#15803D', red: '#B91C1C' };

const key = (conversationId: string) => `chat_theme_${conversationId}`;

// A chat's own theme wins; otherwise the person's default from Settings (id
// 'global'), which covers every chat and group; otherwise the plain look.
export async function loadChatTheme(conversationId: string): Promise<ChatTheme> {
  try {
    const specific = conversationId !== 'global' ? await AsyncStorage.getItem(key(conversationId)) : null;
    const raw = specific ?? (await AsyncStorage.getItem(key('global')));
    return raw ? { ...DEFAULT_THEME, ...JSON.parse(raw) } : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export async function clearChatTheme(conversationId: string) {
  await AsyncStorage.removeItem(key(conversationId));
}

export async function saveChatTheme(conversationId: string, theme: ChatTheme) {
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
