import { useCallback, useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Text from '@/components/AppText';
import Constants from 'expo-constants';
import { useTheme } from '@/lib/ThemeContext';
import { useAppForeground } from '@/lib/useAppForeground';

// Uses Google Play's own "in-app update" (the same one big apps use).
//   - A new version on Play starts downloading quietly while the person keeps
//     using the app; when it is ready a small bar says "Restart to update".
//   - If the update is marked urgent (priority 4 or 5 on Play) or has been
//     waiting 14+ days, Play shows its full-screen "Update" page instead and
//     the app cannot be used until it is done.
// Needs the package `sp-react-native-in-app-updates` inside a real Play build.
// In Expo Go, development builds, or an older build without that package, this
// does nothing at all (it never crashes).
let Lib: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Lib = require('sp-react-native-in-app-updates');
} catch {
  Lib = null;
}

const DOWNLOADED = 11; // Play's "downloaded, ready to install" status

export default function UpdateGate() {
  const { colors } = useTheme();
  const [ready, setReady] = useState(false);
  const lastCheck = useRef(0);
  const client = useRef<any>(null);
  const started = useRef(false);

  const check = useCallback(async () => {
    if (Platform.OS !== 'android' || !Lib || __DEV__ || (Constants as any).appOwnership === 'expo') return;
    if (started.current || Date.now() - lastCheck.current < 10 * 60 * 1000) return;
    lastCheck.current = Date.now();
    try {
      const Ctor = Lib.default || Lib;
      const kinds = Lib.IAUUpdateKind || { FLEXIBLE: 0, IMMEDIATE: 1 };
      if (!client.current) {
        client.current = new Ctor(false);
        client.current.addStatusUpdateListener?.((ev: any) => {
          if (ev?.status === DOWNLOADED) setReady(true);
        });
      }
      const res = await client.current.checkNeedsUpdate({ curVersion: String((Constants as any).nativeBuildVersion || '0') });
      if (!res?.shouldUpdate) return;
      const other = res.other || {};
      const priority = Number(other.updatePriority || 0);
      const stale = Number(other.clientVersionStalenessDays || 0);
      const urgent = priority >= 4 || stale >= 14;
      started.current = true;
      await client.current.startUpdate({ updateType: urgent ? kinds.IMMEDIATE : kinds.FLEXIBLE });
    } catch {
      started.current = false; // offline, not from Play, or no package: try again later
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(check, 4000); // let the app open first
    return () => clearTimeout(t);
  }, [check]);
  useAppForeground(check);

  if (!ready) return null;
  return (
    <View style={[styles.bar, { backgroundColor: colors.card, borderColor: colors.border }]} pointerEvents="box-none">
      <Text style={[styles.txt, { color: colors.text }]}>Update downloaded</Text>
      <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={() => client.current?.installUpdate?.()} activeOpacity={0.85}>
        <Text style={styles.btnTxt}>Restart</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 16, right: 16, bottom: 90, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 10, paddingLeft: 16, paddingRight: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', elevation: 8 },
  txt: { fontSize: 15, fontWeight: '700' },
  btn: { borderRadius: 12, paddingVertical: 9, paddingHorizontal: 18 },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
