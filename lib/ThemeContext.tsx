import { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';
import { lightColors, darkColors } from './theme';

type Mode = 'light' | 'dark' | 'system';
type ThemeColors = typeof lightColors;

type ThemeContextValue = {
  colors: ThemeColors;
  mode: Mode;
  setMode: (m: Mode) => void;
  isDark: boolean;
};

const defaultValue: ThemeContextValue = {
  colors: lightColors,
  mode: 'system',
  setMode: () => {},
  isDark: false,
};

const Ctx = createContext<ThemeContextValue>(defaultValue);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<Mode>('system');

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
  const colors = isDark ? darkColors : lightColors;

  return <Ctx.Provider value={{ colors, mode, setMode, isDark }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  return useContext(Ctx);
}
