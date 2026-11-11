import { useEffect } from 'react';

// Safety net for videos that freeze and never start again (a network blip or
// the player giving up). While a video SHOULD be playing, check every 2.5s:
//  - ready but not playing  -> press play again
//  - frozen (time not moving) for ~5s -> press play again
//  - frozen for ~10s, or in "error" -> reload the same video at the same spot
// A video that is simply still loading on a slow network is left alone.
export function useVideoWatchdog(player: any, shouldPlay: boolean, uri: string | null | undefined) {
  useEffect(() => {
    if (!player || !shouldPlay || !uri) return;
    let lastTime = -1;
    let stuck = 0;
    let reloads = 0;
    const timer = setInterval(() => {
      try {
        const status = player.status;
        const t = Number(player.currentTime) || 0;
        if (status === 'error') {
          if (reloads < 3) {
            reloads++;
            reload(player, uri, t);
          }
          return;
        }
        if (status !== 'readyToPlay') {
          stuck = 0;
          lastTime = t;
          return;
        }
        if (!player.playing) {
          player.play();
          stuck = 0;
          lastTime = t;
          return;
        }
        if (Math.abs(t - lastTime) < 0.05) stuck++;
        else stuck = 0;
        lastTime = t;
        if (stuck === 2) player.play();
        if (stuck >= 4 && reloads < 3) {
          reloads++;
          stuck = 0;
          reload(player, uri, t);
        }
      } catch {}
    }, 2500);
    return () => clearInterval(timer);
  }, [player, shouldPlay, uri]);
}

function reload(player: any, uri: string, at: number) {
  try {
    const done = () => {
      try {
        if (at > 0) player.currentTime = at;
        player.play();
      } catch {}
    };
    if (typeof player.replaceAsync === 'function') player.replaceAsync(uri).then(done).catch(() => {});
    else {
      player.replace(uri);
      setTimeout(done, 400);
    }
  } catch {}
}
