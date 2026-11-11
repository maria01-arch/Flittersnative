import { useEffect, useState } from 'react';
import * as VideoThumbnails from 'expo-video-thumbnails';

export type VideoThumb = { uri: string; width: number; height: number };

// One still frame per video URL, remembered for the whole session so
// scrolling back up never re-downloads it. Only two are generated at a time
// — a feed with several video posts would otherwise start a pile of
// simultaneous downloads and slow down everything else on screen.
const cache = new Map<string, VideoThumb>();
const failed = new Set<string>();
const inflight = new Map<string, Promise<VideoThumb | null>>();
let running = 0;
const waiting: Array<() => void> = [];

function schedule<T>(job: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const start = () => {
      running++;
      job()
        .then(resolve, reject)
        .finally(() => {
          running--;
          const next = waiting.shift();
          if (next) next();
        });
    };
    if (running < 2) start();
    else waiting.push(start);
  });
}

function loadThumb(uri: string): Promise<VideoThumb | null> {
  const existing = inflight.get(uri);
  if (existing) return existing;
  const p = schedule(async () => {
    try {
      const t = await VideoThumbnails.getThumbnailAsync(uri, { time: 500 });
      return { uri: t.uri, width: t.width, height: t.height } as VideoThumb;
    } catch {
      try {
        const t = await VideoThumbnails.getThumbnailAsync(uri, { time: 0 });
        return { uri: t.uri, width: t.width, height: t.height } as VideoThumb;
      } catch {
        return null;
      }
    }
  }).then((t) => {
    if (t) cache.set(uri, t);
    else failed.add(uri);
    inflight.delete(uri);
    return t;
  });
  inflight.set(uri, p);
  return p;
}

// Returns the still frame (and the video's real width/height, so a card can
// match the video's shape instead of forcing a fixed one). null until ready.
export function useVideoThumb(uri?: string | null): VideoThumb | null {
  const [thumb, setThumb] = useState<VideoThumb | null>(uri ? cache.get(uri) || null : null);
  useEffect(() => {
    if (!uri) return;
    const hit = cache.get(uri);
    if (hit) {
      setThumb(hit);
      return;
    }
    if (failed.has(uri)) return;
    let cancelled = false;
    // Wait a beat before touching the network: when someone flings through
    // the feed, most video posts are gone again within a fraction of a
    // second, and starting a download for each would waste data on videos
    // nobody ever looked at.
    const timer = setTimeout(() => {
      loadThumb(uri).then((t) => {
        if (!cancelled && t) setThumb(t);
      });
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [uri]);
  return thumb;
}
