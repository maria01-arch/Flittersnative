import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

export function useAppForeground(onForeground: () => void) {
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const callbackRef = useRef(onForeground);
  callbackRef.current = onForeground;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        callbackRef.current();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, []);
}
