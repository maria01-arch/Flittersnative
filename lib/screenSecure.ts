import { useEffect } from 'react';

// Blocks screenshots and screen recording while `active` is true (Android: the
// capture comes out black; iPhone: recordings are blanked). It needs the package
// `expo-screen-capture` inside the installed app; without it nothing is blocked
// but nothing breaks either.
let SC: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  SC = require('expo-screen-capture');
} catch {
  SC = null;
}

export function useScreenSecure(active: boolean, key = 'flitters-secure') {
  useEffect(() => {
    if (!active || !SC) return;
    try {
      SC.preventScreenCaptureAsync?.(key)?.catch?.(() => {});
    } catch {}
    return () => {
      try {
        SC.allowScreenCaptureAsync?.(key)?.catch?.(() => {});
      } catch {}
    };
  }, [active, key]);
}
