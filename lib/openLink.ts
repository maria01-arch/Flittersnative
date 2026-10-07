import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { BrowserEngine } from './PreferencesContext';

// Used everywhere a link gets tapped (post/message text, link preview
// cards, bio links) so the "browser engine" setting under Links and
// Preview actually controls all of them consistently, not just one spot.
export async function openLink(url: string, engine: BrowserEngine) {
  if (engine === 'external') {
    Linking.openURL(url).catch(() => {});
    return;
  }
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    // If the in-app browser ever fails to open (bad URL scheme, etc.),
    // falling back to the OS still gets the person to their link.
    Linking.openURL(url).catch(() => {});
  }
}
