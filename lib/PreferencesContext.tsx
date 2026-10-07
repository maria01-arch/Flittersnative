import { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type FeedInterest = 'foryou' | 'following';
export type BrowserEngine = 'in-app' | 'external';

type PrefsContextValue = {
  autoplayVideos: boolean;
  setAutoplayVideos: (v: boolean) => void;
  // "Content and media"
  showReposts: boolean;
  setShowReposts: (v: boolean) => void;
  feedInterest: FeedInterest;
  setFeedInterest: (v: FeedInterest) => void;
  // Default true (data-saving) — only the active video, plus one
  // neighbor on each side in Reels, is ever preloaded. Turning it off
  // widens that preload window for a faster-feeling scroll, at the cost
  // of more data used per session. See reels.tsx for exactly how the
  // window size changes.
  dataSaverMode: boolean;
  setDataSaverMode: (v: boolean) => void;
  // "Links and Preview" (was "Accessibility")
  showLinkPreviews: boolean;
  setShowLinkPreviews: (v: boolean) => void;
  browserEngine: BrowserEngine;
  setBrowserEngine: (v: BrowserEngine) => void;
};

const defaults: PrefsContextValue = {
  autoplayVideos: true,
  setAutoplayVideos: () => {},
  showReposts: true,
  setShowReposts: () => {},
  feedInterest: 'foryou',
  setFeedInterest: () => {},
  dataSaverMode: true,
  setDataSaverMode: () => {},
  showLinkPreviews: true,
  setShowLinkPreviews: () => {},
  browserEngine: 'in-app',
  setBrowserEngine: () => {},
};

const Ctx = createContext<PrefsContextValue>(defaults);

// Every preference here follows the same shape: a boolean or short string,
// persisted under its own AsyncStorage key, loaded once on boot. Simple on
// purpose — there's no server-side "preferences" table, these are
// per-device settings only, same as autoplayVideos already was.
export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [autoplayVideos, setAutoplayState] = useState(true);
  const [showReposts, setShowRepostsState] = useState(true);
  const [feedInterest, setFeedInterestState] = useState<FeedInterest>('foryou');
  const [dataSaverMode, setDataSaverState] = useState(true);
  const [showLinkPreviews, setShowLinkPreviewsState] = useState(true);
  const [browserEngine, setBrowserEngineState] = useState<BrowserEngine>('in-app');

  useEffect(() => {
    AsyncStorage.getItem('autoplay_videos').then((v) => {
      if (v === 'false') setAutoplayState(false);
    });
    AsyncStorage.getItem('show_reposts').then((v) => {
      if (v === 'false') setShowRepostsState(false);
    });
    AsyncStorage.getItem('feed_interest').then((v) => {
      if (v === 'following') setFeedInterestState('following');
    });
    AsyncStorage.getItem('data_saver_mode').then((v) => {
      if (v === 'false') setDataSaverState(false);
    });
    AsyncStorage.getItem('show_link_previews').then((v) => {
      if (v === 'false') setShowLinkPreviewsState(false);
    });
    AsyncStorage.getItem('browser_engine').then((v) => {
      if (v === 'external') setBrowserEngineState('external');
    });
  }, []);

  const setAutoplayVideos = (v: boolean) => {
    setAutoplayState(v);
    AsyncStorage.setItem('autoplay_videos', v ? 'true' : 'false');
  };
  const setShowReposts = (v: boolean) => {
    setShowRepostsState(v);
    AsyncStorage.setItem('show_reposts', v ? 'true' : 'false');
  };
  const setFeedInterest = (v: FeedInterest) => {
    setFeedInterestState(v);
    AsyncStorage.setItem('feed_interest', v);
  };
  const setDataSaverMode = (v: boolean) => {
    setDataSaverState(v);
    AsyncStorage.setItem('data_saver_mode', v ? 'true' : 'false');
  };
  const setShowLinkPreviews = (v: boolean) => {
    setShowLinkPreviewsState(v);
    AsyncStorage.setItem('show_link_previews', v ? 'true' : 'false');
  };
  const setBrowserEngine = (v: BrowserEngine) => {
    setBrowserEngineState(v);
    AsyncStorage.setItem('browser_engine', v);
  };

  return (
    <Ctx.Provider
      value={{
        autoplayVideos,
        setAutoplayVideos,
        showReposts,
        setShowReposts,
        feedInterest,
        setFeedInterest,
        dataSaverMode,
        setDataSaverMode,
        showLinkPreviews,
        setShowLinkPreviews,
        browserEngine,
        setBrowserEngine,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function usePreferences() {
  return useContext(Ctx);
}
