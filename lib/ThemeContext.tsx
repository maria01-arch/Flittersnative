import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';
import { lightColors } from './theme';
import { buildColors, ACCENTS, SURFACES } from './appThemes';

type Mode = 'light' | 'dark' | 'system';
type ThemeColors = typeof lightColors;

type ThemeContextValue = {
  colors: ThemeColors;
  mode: Mode;
  setMode: (m: Mode) => void;
  isDark: boolean;
  // App theme: accent colour + surface style (saved on this phone).
  accent: string;           // an id from ACCENTS
  surface: string;          // an id from SURFACES
  setAccent: (id: string) => void;
  setSurface: (id: string) => void;
  resetAppTheme: () => void;
};

const defaultValue: ThemeContextValue = {
  colors: lightColors,
  mode: 'system',
  setMode: () => {},
  isDark: false,
  accent: 'blue',
  surface: 'classic',
  setAccent: () => {},
  setSurface: () => {},
  resetAppTheme: () => {},
};

const Ctx = createContext<ThemeContextValue>(defaultValue);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<Mode>('system');

  const [accent, setAccentState] = useState('blue');
  const [surface, setSurfaceState] = useState('classic');

  useEffect(() => {
    AsyncStorage.multiGet(['theme_accent', 'theme_surface']).then((rows) => {
      const [a, sf] = rows.map((r) => r[1]);
      if (a && ACCENTS.some((x) => x.id === a)) setAccentState(a);
      if (sf && SURFACES.some((x) => x.id === sf)) setSurfaceState(sf);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem('theme_mode').then((saved) => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') setModeState(saved);
    });
  }, []);

  const setMode = (m: Mode) => {
    setModeState(m);
    AsyncStorage.setItem('theme_mode', m);
  };

  const isDark = mode === 'dark' || (mode === 'system' && systemScheme === 'dark');
  const colors = useMemo(() => buildColors(isDark, accent, surface), [isDark, accent, surface]);

  const setAccent = (id: string) => { setAccentState(id); AsyncStorage.setItem('theme_accent', id).catch(() => {}); };
  const setSurface = (id: string) => { setSurfaceState(id); AsyncStorage.setItem('theme_surface', id).catch(() => {}); };
  const resetAppTheme = () => {
    setAccentState('blue'); setSurfaceState('classic');
    AsyncStorage.multiRemove(['theme_accent', 'theme_surface']).catch(() => {});
  };

  const value = useMemo(
    () => ({ colors, mode, setMode, isDark, accent, surface, setAccent, setSurface, resetAppTheme }),
    [colors, mode, isDark, accent, surface]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  return useContext(Ctx);
}
