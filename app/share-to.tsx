import { useMemo, useState } from 'react';
import { View, Alert } from 'react-native';
import Text from '@/components/AppText';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import ChatPickerSheet from '@/components/ChatPickerSheet';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import { useIncomingShare } from '@/lib/shareIntent';
import { uploadImage, uploadVideo } from '@/lib/upload';
import { forwardTo, ForwardTarget, ForwardPayload } from '@/lib/forward';

// Opens when something is shared INTO Flitters from another app. It can only
// be sent to people in a direct message (not posted).
export default function ShareTo() {
  const router = useRouter();
  const { session } = useAuth();
  const { colors } = useTheme();
  const { shareIntent, resetShareIntent } = useIncomingShare();
  const [busy, setBusy] = useState(false);

  const text = (shareIntent.text || shareIntent.webUrl || '').trim();
  const files = useMemo(() => (shareIntent.files || []).filter((f) => /^(image|video)\//.test(f.mimeType || '')).slice(0, 5), [shareIntent.files]);
  const skipped = (shareIntent.files || []).length - files.length;

  const close = () => {
    resetShareIntent();
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const send = async (targets: ForwardTarget[]) => {
    const me = session?.user?.id;
    if (!me || busy) return;
    setBusy(true);
    try {
      // Upload each file once, then send the same links to every chosen person.
      const payloads: ForwardPayload[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const isVideo = (f.mimeType || '').startsWith('video/');
        const url = isVideo ? await uploadVideo(f.path, `messages/${me}`) : await uploadImage(f.path, `messages/${me}`);
        if (!url) throw new Error('upload');
        payloads.push({ content: i === 0 ? text : '', ...(isVideo ? { video_url: url } : { image_url: url }) });
      }
      if (!payloads.length) {
        if (!text) {
          Alert.alert('Nothing to send', "Flitters can send text, links, photos and videos.");
          setBusy(false);
          return;
        }
        payloads.push({ content: text });
      }
      let failed = 0;
      for (const p of payloads) {
        const r = await forwardTo(targets, me, p);
        failed += r.failed;
      }
      setBusy(false);
      if (failed) Alert.alert('Not everything was sent', 'Some messages could not be sent. Please try again.');
      close();
    } catch {
      setBusy(false);
      Alert.alert("Couldn't send", 'The upload failed. Check your connection and try again.');
    }
  };

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      {files[0] && (files[0].mimeType || '').startsWith('image/') ? (
        <Image source={{ uri: files[0].path }} style={{ width: 52, height: 52, borderRadius: 10 }} contentFit="cover" />
      ) : (
        <View style={{ width: 52, height: 52, borderRadius: 10, backgroundColor: colors.inputBg, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={files[0] ? 'videocam' : 'link'} size={22} color={colors.subtext} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={2}>
          {files.length ? `${files.length} ${files.length === 1 ? 'file' : 'files'}${text ? ' + text' : ''}` : text || 'Nothing to share'}
        </Text>
        {skipped > 0 && <Text style={{ color: colors.subtext, fontSize: 12 }}>{skipped} unsupported file skipped</Text>}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ChatPickerSheet visible userId={session?.user?.id} title="Send in message" dmOnly busy={busy} header={header} onClose={close} onSend={send} />
    </View>
  );
}
