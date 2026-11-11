import React, { createContext, useContext } from 'react';

// Receiving things shared FROM other apps (Gallery, Chrome, Files...) into
// Flitters. Uses the expo-share-intent package, which needs the installed app
// (EAS build). In Expo Go, or in a build made before the package was added,
// every function here quietly does nothing.
export type SharedItem = { text?: string | null; webUrl?: string | null; files?: { path: string; mimeType?: string; fileName?: string }[] | null };
type Ctx = { hasShareIntent: boolean; shareIntent: SharedItem; resetShareIntent: () => void };

const empty: Ctx = { hasShareIntent: false, shareIntent: {}, resetShareIntent: () => {} };
const ShareCtx = createContext<Ctx>(empty);

let Provider: any = null;
let useInner: any = null;
try {
  // Only use the package when its native part is really in this build.
  const core = require('expo-modules-core');
  const native = core?.requireOptionalNativeModule ? core.requireOptionalNativeModule('ExpoShareIntentModule') : null;
  if (native) {
    const mod = require('expo-share-intent');
    Provider = mod?.ShareIntentProvider || null;
    useInner = mod?.useShareIntentContext || null;
  }
} catch {
  Provider = null;
  useInner = null;
}

function Bridge({ children }: { children: React.ReactNode }) {
  const v = useInner();
  return <ShareCtx.Provider value={{ hasShareIntent: !!v.hasShareIntent, shareIntent: v.shareIntent || {}, resetShareIntent: () => v.resetShareIntent() }}>{children}</ShareCtx.Provider>;
}

export function ShareProvider({ children }: { children: React.ReactNode }) {
  if (!Provider || !useInner) return <>{children}</>;
  return (
    <Provider>
      <Bridge>{children}</Bridge>
    </Provider>
  );
}

export function useIncomingShare(): Ctx {
  return useContext(ShareCtx);
}
