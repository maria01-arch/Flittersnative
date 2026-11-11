import { useState } from 'react';
import { Modal, View, TouchableOpacity, StyleSheet, Pressable, Share, Alert } from 'react-native';
import Text from '@/components/AppText';
import * as Clipboard from 'expo-clipboard';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';
import { profileLink } from '@/lib/flittersLinks';
import { router } from 'expo-router';
import Avatar from './Avatar';

// The QR drawing comes from the "react-native-qrcode-svg" package. If it is
// not installed yet the screen still works and shows the link only.
let QRCode: any = null;
try {
  QRCode = require('react-native-qrcode-svg').default;
} catch {
  QRCode = null;
}

// Your profile link and a QR code for it. Anyone who scans it (or opens the
// link) lands on your profile inside the app.
export default function ProfileQRModal({ visible, profile, onClose }: { visible: boolean; profile: any; onClose: () => void }) {
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);
  const url = profile?.username ? profileLink(profile.username) : '';

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      Alert.alert("Couldn't copy", url);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: colors.card }]} onPress={() => {}}>
          <TouchableOpacity style={styles.close} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={22} color={colors.subtext} />
          </TouchableOpacity>
          <Avatar uri={profile?.avatar_url} size={64} />
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 10 }}>{profile?.display_name}</Text>
          <Text style={{ color: colors.subtext, marginBottom: 16 }}>@{profile?.username}</Text>
          <View style={styles.qrBox}>
            {QRCode && url ? <QRCode value={url} size={200} backgroundColor="#fff" color="#000" /> : <Text style={{ color: '#333', textAlign: 'center', width: 200 }}>QR needs one package. Your link still works.</Text>}
          </View>
          <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 12 }} selectable>{url}</Text>
          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={() => Share.share({ message: `Find me on Flitters: ${url}`, url }).catch(() => {})}>
              <Ionicons name="share-social-outline" size={17} color="#fff" />
              <Text style={styles.btnText}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { backgroundColor: colors.inputBg }]} onPress={copy}>
              <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={17} color={colors.text} />
              <Text style={[styles.btnText, { color: colors.text }]}>{copied ? 'Copied' : 'Copy link'}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.scanBtn, { borderColor: colors.border }]}
            onPress={() => {
              onClose();
              router.push('/scan');
            }}
          >
            <Ionicons name="scan-outline" size={17} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 14 }}>Scan a code</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 340, borderRadius: 24, padding: 22, alignItems: 'center' },
  close: { position: 'absolute', right: 14, top: 14, zIndex: 2 },
  qrBox: { backgroundColor: '#fff', padding: 14, borderRadius: 16 },
  row: { flexDirection: 'row', gap: 10, marginTop: 16, alignSelf: 'stretch' },
  btn: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 22, paddingVertical: 12 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  scanBtn: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 22, paddingVertical: 11, marginTop: 10, alignSelf: 'stretch' },
});
