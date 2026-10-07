import { useEffect, useState } from 'react';

// expo-video's player exposes .status ('idle' | 'loading' | 'readyToPlay'
// | 'error') but it isn't itself reactive — this subscribes to its
// statusChange event so a component can actually re-render when a video
// goes from "nothing to show yet" to "here's a real frame". Used to know
// when to stop showing a placeholder card and let the real video show
// through, instead of a jarring pop once decoding finishes.
export function useVideoStatus(player: any): string {
  const [status, setStatus] = useState<string>(player?.status || 'idle');

  useEffect(() => {
    if (!player) return;
    setStatus(player.status);
    const sub = player.addListener('statusChange', (event: any) => setStatus(event?.status ?? player.status));
    return () => sub.remove();
  }, [player]);

  return status;
}
