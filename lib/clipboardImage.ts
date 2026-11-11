import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';

// Lets the message/comment bars take a picture that was copied (a
// screenshot, an image copied from a browser, ...). The phone's own paste
// menu can't put a picture into a text box, so a small "Paste image" chip
// shows above the bar whenever the clipboard holds one.
//
// It only looks while the app is open on screen (never in the background),
// and only asks "is there an image?" — the picture itself is read only when
// the chip is tapped.
export function useClipboardImage() {
  const [has, setHas] = useState(false);
  const used = useRef(false); // this copy was already used or dismissed

  const check = useCallback(async () => {
    if (used.current) return;
    try {
      setHas(await Clipboard.hasImageAsync());
    } catch {
      setHas(false);
    }
  }, []);

  useEffect(() => {
    check();
    let sub: { remove: () => void } | null = null;
    try {
      // The clipboard changed: it is a new copy, so offer it again.
      sub = Clipboard.addClipboardListener(() => {
        used.current = false;
        check();
      });
    } catch {}
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => {
      try {
        sub?.remove();
      } catch {}
      app.remove();
    };
  }, [check]);

  const dismiss = useCallback(() => {
    used.current = true;
    setHas(false);
  }, []);

  // Saves the copied picture to a temporary file and returns its path, the
  // same kind of path the gallery picker gives.
  const take = useCallback(async (): Promise<string | null> => {
    try {
      const img = await Clipboard.getImageAsync({ format: 'jpeg', jpegQuality: 0.9 });
      const raw = img?.data;
      if (!raw) {
        dismiss();
        return null;
      }
      const b64 = raw.includes(',') ? raw.split(',')[1] : raw;
      const path = `${FileSystem.cacheDirectory}pasted-${Date.now()}.jpg`;
      await FileSystem.writeAsStringAsync(path, b64, { encoding: FileSystem.EncodingType.Base64 });
      dismiss();
      return path;
    } catch (err) {
      console.warn('[clipboardImage] could not read the copied picture', err);
      dismiss();
      return null;
    }
  }, [dismiss]);

  return { has, take, dismiss };
}
