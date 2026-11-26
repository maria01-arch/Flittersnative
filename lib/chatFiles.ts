import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert, Linking } from 'react-native';

export function fileSizeText(bytes?: number | null): string {
  const n = Number(bytes) || 0;
  if (n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// Downloads the file to the phone's cache and opens the share/open sheet.
export async function openFile(url?: string | null, name?: string | null) {
  if (!url) return;
  try {
    const safe = (name || 'file').replace(/[^\w.\- ]+/g, '_');
    const dest = FileSystem.cacheDirectory + safe;
    const res = await FileSystem.downloadAsync(url, dest);
    if (res.status >= 200 && res.status < 300 && (await Sharing.isAvailableAsync())) {
      await Sharing.shareAsync(res.uri, { dialogTitle: safe });
      return;
    }
  } catch (e) {
    console.warn('[openFile] failed', e);
  }
  Linking.openURL(url).catch(() => Alert.alert('Could not open file'));
}

// Picks any document. Needs the expo-document-picker package.
export async function pickDocument(): Promise<{ uri: string; name: string; size: number } | null> {
  const DocumentPicker = require('expo-document-picker');
  const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  return { uri: a.uri, name: a.name || 'file', size: a.size || 0 };
}
