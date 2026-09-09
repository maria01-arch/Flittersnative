import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { uploadImage } from '@/lib/upload';

export default function EditProfileScreen() {
  const { session } = useAuth();
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
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1DA1F2" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Edit Profile</Text>
        <TouchableOpacity onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator size="small" color="#1DA1F2" /> : <Text style={styles.save}>Save</Text>}
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.avatarWrap} onPress={pickAvatar}>
        <Image
          source={{ uri: newAvatarUri || avatarUrl || 'https://placehold.co/120x120/1DA1F2/fff?text=' + (displayName?.[0] || '?') }}
          style={styles.avatar}
        />
        <Text style={styles.changePhoto}>Change photo</Text>
      </TouchableOpacity>

      <View style={styles.field}>
        <Text style={styles.label}>Display Name</Text>
        <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} placeholder="Your name" placeholderTextColor="#888" />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Bio</Text>
        <TextInput style={[styles.input, styles.multiline]} value={bio} onChangeText={setBio} placeholder="Tell people about yourself" placeholderTextColor="#888" multiline />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Location</Text>
        <TextInput style={styles.input} value={location} onChangeText={setLocation} placeholder="e.g. Lagos, Nigeria" placeholderTextColor="#888" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingHorizontal: 16, paddingBottom: 16 },
  cancel: { color: '#888', fontSize: 16 },
  title: { fontSize: 16, fontWeight: 'bold' },
  save: { color: '#1DA1F2', fontSize: 16, fontWeight: 'bold' },
  avatarWrap: { alignItems: 'center', marginBottom: 20 },
  avatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#ddd' },
  changePhoto: { color: '#1DA1F2', marginTop: 10, fontWeight: '600' },
  field: { paddingHorizontal: 16, marginBottom: 16 },
  label: { fontSize: 13, color: '#888', marginBottom: 6, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 15 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
});
