import { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Linking, Platform } from 'react-native';
import Text from '@/components/AppText';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/ThemeContext';
import { flittersPathFromScan } from '@/lib/scanLink';

// The camera comes from "expo-camera". If it isn't installed yet this
// screen says so instead of crashing the app.
let CameraView: any = null;
let useCameraPermissions: any = null;
try {
  const cam = require('expo-camera');
  CameraView = cam.CameraView;
  useCameraPermissions = cam.useCameraPermissions;
} catch {
  CameraView = null;
}

// Hook-safe stand-in when the package is missing.
const noPermissions = () => [null, async () => null] as const;

// Scan a Flitters QR code (someone's profile, a post, a group invite) and
// jump straight to it.
export default function ScanScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = (useCameraPermissions || noPermissions)() as any;
  const [torch, setTorch] = useState(false);
  const [message, setMessage] = useState('');
  const handled = useRef(false);
  const msgTimer = useRef<any>(null);

  useEffect(() => () => clearTimeout(msgTimer.current), []);

  const onScanned = ({ data }: { data: string }) => {
    if (handled.current) return;
    handled.current = true;
    const path = flittersPathFromScan(data);
    if (path) {
      // replace, so Back from the opened screen doesn't return to the camera.
      router.replace(path as any);
      return;
    }
    setMessage("That isn't a Flitters code.");
    clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => {
      setMessage('');
      handled.current = false;
    }, 1800);
  };

  const top = (
    <TouchableOpacity style={[styles.close, { top: insets.top + 10 }]} onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
      <Ionicons name="close" size={26} color="#fff" />
    </TouchableOpacity>
  );

  if (!CameraView) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        {top}
        <Text style={[styles.title, { color: colors.text }]}>Scanner not ready</Text>
        <Text style={[styles.sub, { color: colors.subtext }]}>This app version doesn't have the camera package yet.</Text>
      </View>
    );
  }

  if (!permission) {
    return <View style={[styles.center, { backgroundColor: colors.bg }]}>{top}</View>;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        {top}
        <Ionicons name="qr-code-outline" size={54} color={colors.primary} />
        <Text style={[styles.title, { color: colors.text }]}>Allow the camera</Text>
        <Text style={[styles.sub, { color: colors.subtext }]}>Flitters uses the camera only to read QR codes. Nothing is recorded or saved.</Text>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.primary }]}
          onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
        >
          <Text style={styles.btnText}>{permission.canAskAgain ? 'Allow camera' : 'Open settings'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.full}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={onScanned}
      />
      {top}
      <View style={styles.frameWrap} pointerEvents="none">
        <View style={styles.frame} />
        <Text style={styles.hint}>{message || 'Point at a Flitters QR code'}</Text>
      </View>
      <TouchableOpacity
        style={[styles.torch, { bottom: insets.bottom + 30, backgroundColor: torch ? colors.primary : 'rgba(0,0,0,0.5)' }]}
        onPress={() => setTorch((v) => !v)}
      >
        <Ionicons name={torch ? 'flash' : 'flash-outline'} size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  full: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  close: { position: 'absolute', left: 16, zIndex: 5, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800', marginTop: 16 },
  sub: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  btn: { marginTop: 22, borderRadius: 24, paddingVertical: 13, paddingHorizontal: 28 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  frameWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  frame: { width: 240, height: 240, borderRadius: 24, borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)' },
  hint: { color: '#fff', fontWeight: '700', marginTop: 18, fontSize: 14, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6 },
  torch: { position: 'absolute', alignSelf: 'center', width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
});
