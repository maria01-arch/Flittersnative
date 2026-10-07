import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import { uploadImage } from '@/lib/upload';

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
    setSaving(false);
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
  avatarWrap: { alignItems: 'center', marginBottom: 20, marginTop: 8 },
  avatar: { width: 100, height: 100, borderRadius: 50 },
  changePhoto: { marginTop: 10, fontWeight: '600' },
  field: { paddingHorizontal: 16, marginBottom: 16 },
  label: { fontSize: 13, marginBottom: 6, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
});
