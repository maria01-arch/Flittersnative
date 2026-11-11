import { useState } from 'react';
import { View, Image, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import Text from '@/components/AppText';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import { uploadImage, uploadVideo } from '@/lib/upload';
import VideoTrimmer from '@/components/VideoTrimmer';
import { momentsChanged } from '@/lib/momentRings';

const MAX_VIDEO_SECONDS = 15;

function Preview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />;
}

export default function NewMoment() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const [media, setMedia] = useState<{ uri: string; type: 'image' | 'video' } | null>(null);
  const [trim, setTrim] = useState<{ uri: string; duration: number | null } | null>(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = async (kind: 'images' | 'videos') => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Allow photos', 'Allow access to your photos to pick a moment.');
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: [kind], quality: 0.85 });
    const a: any = !r.canceled ? r.assets?.[0] : null;
    if (!a) return;
    if (kind === 'images') setMedia({ uri: a.uri, type: 'image' });
    else setTrim({ uri: a.uri, duration: a.duration ? (a.duration > 1000 ? a.duration / 1000 : a.duration) : null });
  };

  const post = async () => {
    const uid = session?.user?.id;
    if (!uid || !media || busy) return;
    setBusy(true);
    try {
      const url = media.type === 'video' ? await uploadVideo(media.uri, `posts/${uid}`) : await uploadImage(media.uri, `posts/${uid}`);
      if (!url) throw new Error('upload');
      const { error } = await supabase.from('moments').insert({ user_id: uid, media_url: url, media_type: media.type, caption: caption.trim() || null });
      if (error) throw error;
      momentsChanged();
      router.back();
    } catch (e: any) {
      Alert.alert('Could not post', /rate|limit|too many/i.test(String(e?.message)) ? 'You have posted a lot of moments today. Try again tomorrow.' : 'Check your internet and try again. If it keeps failing, make sure the moments update was installed.');
    }
    setBusy(false);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#000' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={StyleSheet.absoluteFill}>
        {media ? media.type === 'video' ? <Preview uri={media.uri} /> : <Image source={{ uri: media.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
      </View>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.round}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>New moment</Text>
        <View style={{ width: 40 }} />
      </View>

      {!media ? (
        <View style={styles.center}>
          <Text style={styles.hint}>Disappears after 24 hours</Text>
          <TouchableOpacity style={[styles.big, { backgroundColor: colors.primary }]} onPress={() => pick('images')}>
            <Ionicons name="image" size={22} color="#fff" />
            <Text style={styles.bigTxt}>Pick a picture</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.big, { backgroundColor: '#333' }]} onPress={() => pick('videos')}>
            <Ionicons name="videocam" size={22} color="#fff" />
            <Text style={styles.bigTxt}>Pick a video (up to {MAX_VIDEO_SECONDS}s)</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.bottom, { paddingBottom: insets.bottom + 12 }]}>
          <TextInput
            style={styles.input}
            placeholder="Add a caption…"
            placeholderTextColor="rgba(255,255,255,0.7)"
            value={caption}
            onChangeText={setCaption}
            maxLength={200}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity style={[styles.smallBtn, { backgroundColor: '#333' }]} onPress={() => setMedia(null)} disabled={busy}>
              <Text style={styles.bigTxt}>Change</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.smallBtn, { backgroundColor: colors.primary, flex: 1 }]} onPress={post} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.bigTxt}>Share moment</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <VideoTrimmer
        visible={!!trim}
        uri={trim?.uri || null}
        durationSeconds={trim?.duration}
        maxSeconds={MAX_VIDEO_SECONDS}
        onCancel={() => setTrim(null)}
        onDone={(u) => {
          setTrim(null);
          setMedia({ uri: u, type: 'video' });
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontWeight: '800', fontSize: 17 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 30 },
  hint: { color: 'rgba(255,255,255,0.75)', marginBottom: 6 },
  big: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 16, paddingVertical: 15, paddingHorizontal: 22, alignSelf: 'stretch' },
  bigTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14, gap: 12 },
  input: { backgroundColor: 'rgba(0,0,0,0.55)', color: '#fff', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15 },
  smallBtn: { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
});
