import { useEffect, useRef, useState } from 'react';
import { Modal, View, Image, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView } from 'react-native';
import Text from '@/components/AppText';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { captureRef } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from './Avatar';
import VerifiedBadge from './VerifiedBadge';
import { saveLocalImage } from '@/lib/download';
import { SITE_HOST } from '@/lib/siteConfig';

// Optional: sharing a picture straight to other apps needs `expo-sharing`
// inside the installed app. Without it, the card can still be saved to the gallery.
let Sharing: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Sharing = require('expo-sharing');
} catch {
  Sharing = null;
}

// A post as a branded picture: the post on a Flitters-coloured card with the
// Flitters name and logo, so every share outside the app advertises Flitters.
export default function ShareImageModal({ visible, post, onClose }: { visible: boolean; post: any; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const cardRef = useRef<View>(null);
  const [loaded, setLoaded] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const [busy, setBusy] = useState(false);

  const pic: string | null = post?.image_url || post?.thumbnail_url || null;
  const isVideo = !!post?.video_url;
  const needed = pic ? 1 : 0;
  const ready = loaded >= needed || timedOut;

  useEffect(() => {
    if (!visible) return;
    setLoaded(0);
    setTimedOut(false);
    const t = setTimeout(() => setTimedOut(true), 4000);
    return () => clearTimeout(t);
  }, [visible, post?.id]);

  const capture = async (): Promise<string | null> => {
    try {
      return await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
    } catch {
      return null;
    }
  };

  const doShare = async () => {
    if (busy) return;
    setBusy(true);
    const uri = await capture();
    if (!uri) {
      setBusy(false);
      return Alert.alert("Couldn't make the picture", 'Please try again.');
    }
    try {
      if (Sharing && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share post' });
      } else {
        const r = await saveLocalImage(uri);
        if (r === 'ok') Alert.alert('Saved', 'The picture is in your gallery. Open any app and share it from there.');
        else if (r === 'denied') Alert.alert('Permission needed', 'Allow Flitters to save to your gallery in the phone settings, then try again.');
        else Alert.alert('Update needed', 'Sharing a picture needs the latest Flitters from Google Play.');
      }
    } catch {
      Alert.alert("Couldn't share", 'Please try again.');
    }
    setBusy(false);
  };

  const doSave = async () => {
    if (busy) return;
    setBusy(true);
    const uri = await capture();
    if (!uri) {
      setBusy(false);
      return Alert.alert("Couldn't make the picture", 'Please try again.');
    }
    const r = await saveLocalImage(uri);
    setBusy(false);
    if (r === 'ok') Alert.alert('Saved', 'The picture is in your gallery.');
    else if (r === 'denied') Alert.alert('Permission needed', 'Allow Flitters to save to your gallery in the phone settings, then try again.');
    else if (r === 'unavailable') Alert.alert('Update needed', 'Saving needs the latest Flitters from Google Play.');
    else Alert.alert("Couldn't save", 'Please try again.');
  };

  if (!post) return null;
  const a = post.author || {};

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.top}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Share as picture</Text>
          <View style={{ width: 26 }} />
        </View>

        <ScrollView contentContainerStyle={{ alignItems: 'center', paddingVertical: 12 }}>
          <View ref={cardRef} collapsable={false}>
            <LinearGradient colors={['#1D8FEA', '#6A5CFF', '#C54BE8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.frame}>
              <View style={styles.card}>
                <View style={styles.authorRow}>
                  <Avatar uri={a.avatar_url} size={44} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={styles.name} numberOfLines={1}>{a.display_name || 'Flitters user'}</Text>
                      <VerifiedBadge verified={a.verified} isAuthentic={a.is_authentic} plan={a.verified_plan} size={14} />
                    </View>
                    {!!a.username && <Text style={styles.handle} numberOfLines={1}>@{a.username}</Text>}
                  </View>
                </View>
                {!!post.content && <Text style={styles.body} numberOfLines={10}>{post.content}</Text>}
                {!!pic && (
                  <View style={styles.picWrap}>
                    <Image source={{ uri: pic }} style={styles.pic} resizeMode="cover" onLoad={() => setLoaded((n) => n + 1)} onError={() => setLoaded((n) => n + 1)} />
                    {isVideo && (
                      <View style={styles.play}>
                        <Ionicons name="play" size={30} color="#fff" />
                      </View>
                    )}
                  </View>
                )}
              </View>
              <View style={styles.footer}>
                <Image source={require('@/assets/images/flitters-logo.png')} style={styles.logo} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.brand}>Flitters</Text>
                  <Text style={styles.tag} numberOfLines={1}>Get the app on Google Play · {SITE_HOST}</Text>
                </View>
              </View>
            </LinearGradient>
          </View>
        </ScrollView>

        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.btnMain, !ready && { opacity: 0.5 }]} onPress={doShare} disabled={!ready || busy}>
            {busy ? <ActivityIndicator color="#1D8FEA" /> : <Ionicons name="share-social" size={20} color="#1D8FEA" />}
            <Text style={styles.btnMainText}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnGhost, !ready && { opacity: 0.5 }]} onPress={doSave} disabled={!ready || busy}>
            <Ionicons name="download-outline" size={20} color="#fff" />
            <Text style={styles.btnGhostText}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0E14', paddingHorizontal: 16 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  frame: { width: 340, padding: 16, borderRadius: 24 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 14 },
  authorRow: { flexDirection: 'row', alignItems: 'center' },
  name: { color: '#0F1419', fontSize: 16, fontWeight: '800', flexShrink: 1 },
  handle: { color: '#6B7280', fontSize: 13, marginTop: 1 },
  body: { color: '#0F1419', fontSize: 16, lineHeight: 22, marginTop: 12 },
  picWrap: { marginTop: 12, borderRadius: 12, overflow: 'hidden', backgroundColor: '#E5E7EB' },
  pic: { width: '100%', height: 240 },
  play: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 10 },
  logo: { width: 38, height: 38, borderRadius: 10 },
  brand: { color: '#fff', fontSize: 20, fontWeight: '900' },
  tag: { color: 'rgba(255,255,255,0.9)', fontSize: 11.5, marginTop: 1 },
  actions: { flexDirection: 'row', gap: 12 },
  btn: { flex: 1, height: 50, borderRadius: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnMain: { backgroundColor: '#fff' },
  btnMainText: { color: '#1D8FEA', fontWeight: '800', fontSize: 16 },
  btnGhost: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)' },
  btnGhostText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
