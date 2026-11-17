import { useSyncExternalStore } from 'react';
import { getCallState, subscribeCall, type CallState } from './callManager';

export function useCall(): CallState {
  return useSyncExternalStore(subscribeCall, getCallState, getCallState);
}
