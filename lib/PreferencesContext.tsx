import { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type PrefsContextValue = {
  autoplayVideos: boolean;
  setAutoplayVideos: (v: boolean) => void;
};

const Ctx = createContext<PrefsContextValue>({ autoplayVideos: true, setAutoplayVideos: () => {} });

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [autoplayVideos, setAutoplayState] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem('autoplay_videos').then((v) => {
      if (v === 'false') setAutoplayState(false);
    });
  }, []);

  const setAutoplayVideos = (v: boolean) => {
    setAutoplayState(v);
    AsyncStorage.setItem('autoplay_videos', v ? 'true' : 'false');
  };

  return <Ctx.Provider value={{ autoplayVideos, setAutoplayVideos }}>{children}</Ctx.Provider>;
}

export function usePreferences() {
  return useContext(Ctx);
}
