import { useEffect, useState } from 'react';
import { View, TextInput, TouchableOpacity, Image, StyleSheet, ActivityIndicator, ScrollView, Alert } from 'react-native';
import Text from '@/components/AppText';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import { uploadImage, uploadVideo } from '@/lib/upload';
import * as VideoThumbnails from 'expo-video-thumbnails';
import * as FileSystem from 'expo-file-system/legacy';
import VideoTrimmer from '@/components/VideoTrimmer';

const LIVE_COVER_SECONDS = 6;
const LIVE_COVER_MAX_BYTES = 12 * 1024 * 1024;

// This screen predated the theme system — every color was hardcoded
// (white background, black text, gray borders), so it looked broken
// against dark mode. It now reads from useTheme() like every other
// screen does.
export default function EditProfileScreen() {
  const { session } = useAuth();
  const { colors } = useTheme();
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [newAvatarUri, setNewAvatarUri] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [newCoverUri, setNewCoverUri] = useState<string | null>(null);
  const [coverVideoUrl, setCoverVideoUrl] = useState<string | null>(null);
  const [newCoverVideoUri, setNewCoverVideoUri] = useState<string | null>(null);
  const [removeLive, setRemoveLive] = useState(false);
  const [isBlue, setIsBlue] = useState(false);
  const [trimmer, setTrimmer] = useState<{ uri: string; duration: number | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) return;
    supabase.from('profiles').select('*').eq('id', session.user.id).single().then(({ data }) => {
      if (data) {
        setDisplayName(data.display_name || '');
        setBio(data.bio || '');
        setLocation(data.location || '');
        setAvatarUrl(data.avatar_url || null);
        setCoverUrl(data.cover_url || null);
        setCoverVideoUrl(data.cover_video_url || null);
        setIsBlue(!!(data.verified || data.is_authentic));
      }
      setLoading(false);
    });
  }, [session]);

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [1, 1] });
    if (!result.canceled && result.assets?.[0]) {
      setNewAvatarUri(result.assets[0].uri);
    }
  };

  const pickCover = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: true, aspect: [3, 1] });
    if (!result.canceled && result.assets?.[0]) setNewCoverUri(result.assets[0].uri);
  };

  const pickLiveCover = async () => {
    if (!isBlue) {
      Alert.alert('Blue badge only', 'A live cover is a feature of verified accounts.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Get verified', onPress: () => router.push('/get-verified') },
      ]);
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 1 });
    const a: any = !result.canceled ? result.assets?.[0] : null;
    if (!a) return;
    setTrimmer({ uri: a.uri, duration: a.duration ? (a.duration > 1000 ? a.duration / 1000 : a.duration) : null });
  };

  const liveCoverPicked = async (uri: string) => {
    setTrimmer(null);
    try {
      const info: any = await FileSystem.getInfoAsync(uri);
      if (info?.size && info.size > LIVE_COVER_MAX_BYTES) {
        Alert.alert('Video too big', 'A live cover has to stay under 12 MB so your profile opens fast. Pick a shorter or lower-quality video.');
        return;
      }
    } catch {}
    setNewCoverVideoUri(uri);
    setRemoveLive(false);
    // Nothing to show before the video starts? Use its first picture as the still cover.
    if (!coverUrl && !newCoverUri) {
      try {
        const t = await VideoThumbnails.getThumbnailAsync(uri, { time: 300 });
        setNewCoverUri(t.uri);
      } catch {}
    }
  };

  const save = async () => {
    if (!session?.user?.id) return;
    setSaving(true);
    let finalAvatarUrl = avatarUrl;
    if (newAvatarUri) {
      const uploaded = await uploadImage(newAvatarUri, `avatars/${session.user.id}`);
      if (uploaded) finalAvatarUrl = uploaded;
    }
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName, bio, location, avatar_url: finalAvatarUrl })
      .eq('id', session.user.id);
    // The cover is saved on its own, so a missing cover_url column (see the
    // SQL in the chat) can never stop the rest of the profile from saving.
    let coverError: string | null = null;
    if (!error && newCoverUri) {
      const uploadedCover = await uploadImage(newCoverUri, `posts/${session.user.id}`);
      if (!uploadedCover) coverError = "The cover picture didn't upload. Check your connection and try again.";
      else {
        const { error: cErr } = await supabase.from('profiles').update({ cover_url: uploadedCover }).eq('id', session.user.id);
        if (cErr) coverError = "Couldn't save the cover: " + cErr.message;
      }
    }
    if (!error && !coverError && removeLive && coverVideoUrl && !newCoverVideoUri) {
      const { error: rErr } = await supabase.from('profiles').update({ cover_video_url: null }).eq('id', session.user.id);
      if (rErr) coverError = "Couldn't remove the live cover: " + rErr.message;
    }
    if (!error && !coverError && newCoverVideoUri) {
      // Same folder the cover picture uses: the upload server only accepts its known folders.
      const up = await uploadVideo(newCoverVideoUri, `posts/${session.user.id}`);
      if (!up) coverError = "The live cover didn't upload. Check your connection and try again.";
      else {
        const { error: vErr } = await supabase.from('profiles').update({ cover_video_url: up }).eq('id', session.user.id);
        if (vErr) coverError = "Couldn't save the live cover: " + vErr.message;
      }
    }
    setSaving(false);
    if (coverError) {
      Alert.alert('Profile saved, cover not', coverError);
      return;
    }
    if (!error) router.back();
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.cancel, { color: colors.subtext }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Edit Profile</Text>
        <TouchableOpacity onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={[styles.save, { color: colors.primary }]}>Save</Text>}
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={[styles.coverBox, { backgroundColor: colors.inputBg }]} onPress={pickCover} activeOpacity={0.85}>
        {newCoverUri || coverUrl ? <Image source={{ uri: (newCoverUri || coverUrl) as string }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
        <View style={styles.coverBadge}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{newCoverUri || coverUrl ? 'Change cover' : 'Add cover photo'}</Text>
        </View>
      </TouchableOpacity>

      <View style={{ marginHorizontal: 16, marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <TouchableOpacity onPress={pickLiveCover} activeOpacity={0.8}>
          <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 14 }}>
            {newCoverVideoUri || (coverVideoUrl && !removeLive) ? 'Change live cover' : isBlue ? 'Add live cover (up to 6s)' : 'Add live cover (blue badge)'}
          </Text>
        </TouchableOpacity>
        {newCoverVideoUri || (coverVideoUrl && !removeLive) ? (
          <TouchableOpacity onPress={() => { setNewCoverVideoUri(null); setRemoveLive(true); }}>
            <Text style={{ color: colors.subtext, fontWeight: '600', fontSize: 13 }}>Remove</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {newCoverVideoUri ? <Text style={{ color: colors.subtext, fontSize: 12, marginHorizontal: 16, marginTop: 2 }}>Live cover ready. Tap Save to upload it.</Text> : null}
      <VideoTrimmer
        visible={!!trimmer}
        uri={trimmer?.uri || null}
        durationSeconds={trimmer?.duration}
        maxSeconds={LIVE_COVER_SECONDS}
        onCancel={() => setTrimmer(null)}
        onDone={(u) => liveCoverPicked(u)}
      />

      <TouchableOpacity style={styles.avatarWrap} onPress={pickAvatar}>
        <Image
          source={{ uri: newAvatarUri || avatarUrl || 'https://placehold.co/120x120/1DA1F2/fff?text=' + (displayName?.[0] || '?') }}
          style={[styles.avatar, { backgroundColor: colors.inputBg }]}
        />
        <Text style={[styles.changePhoto, { color: colors.primary }]}>Change photo</Text>
      </TouchableOpacity>

      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.subtext }]}>Display Name</Text>
        <TextInput
          style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Your name"
          placeholderTextColor={colors.faint}
        />
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.subtext }]}>Bio</Text>
        <TextInput
          style={[styles.input, styles.multiline, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
          value={bio}
          onChangeText={setBio}
          placeholder="Tell people about yourself"
          placeholderTextColor={colors.faint}
          multiline
          submitBehavior="newline"
          returnKeyType="default"
        />
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.subtext }]}>Location</Text>
        <TextInput
          style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
          value={location}
          onChangeText={setLocation}
          placeholder="e.g. Lagos, Nigeria"
          placeholderTextColor={colors.faint}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1 },
  cancel: { fontSize: 16 },
  title: { fontSize: 16, fontWeight: 'bold' },
  save: { fontSize: 16, fontWeight: 'bold' },
  coverBox: { height: 110, marginHorizontal: 16, marginTop: 12, borderRadius: 14, overflow: 'hidden', justifyContent: 'flex-end', alignItems: 'flex-end' },
  coverBadge: { backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, margin: 8 },
  avatarWrap: { alignItems: 'center', marginBottom: 20, marginTop: 8 },
  avatar: { width: 100, height: 100, borderRadius: 50 },
  changePhoto: { marginTop: 10, fontWeight: '600' },
  field: { paddingHorizontal: 16, marginBottom: 16 },
  label: { fontSize: 13, marginBottom: 6, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
});
