// Loads the closed-app notification task first
if (!__DEV__) {
  const noop = () => {};
  console.log = noop;
  console.info = noop;
  console.debug = noop;
}
import 'expo-router/entry';
import './lib/pushTask';

