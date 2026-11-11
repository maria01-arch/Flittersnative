// Loads the closed-app notification task first, then starts the app as usual.
// Quieter app: in the store version the debug chatter is switched off
// (errors and warnings still show). Less work for the phone on every message.
if (!__DEV__) {
  const noop = () => {};
  console.log = noop;
  console.info = noop;
  console.debug = noop;
}
import './lib/pushTask';
import 'expo-router/entry';
