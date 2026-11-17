import { Platform } from 'react-native';

// react-native-webrtc is loaded only if it is installed in this build, so the rest of the app keeps
// working (and the call button explains itself) on a build made before calls were added.
let mod: any = null;
try {
  mod = require('react-native-webrtc');
} catch {
  mod = null;
}

export const getWebRTC = () => mod;
export const callsSupported = () => Platform.OS === 'android' && !!mod && !!mod.RTCPeerConnection;
