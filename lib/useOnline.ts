import * as Network from 'expo-network';

// true unless the phone says it has no connection / no internet.
export function useOnline(): boolean {
  const net = Network.useNetworkState();
  return !(net.isConnected === false || net.isInternetReachable === false);
}
