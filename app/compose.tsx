import { useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { uploadImage } from '@/lib/upload';
import { colors, spacing } from '@/lib/theme';

export default function ComposeScreen() {
  const { session } = useAuth();
  const [text, setText] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled && result.assets?.[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  const submit = async () => {
    if ((!text.trim() && !imageUri) || !session?.user?.id) return;
    setPosting(true);
    let imageUrl: string | null = null;
    if (imageUri) {
      imageUrl = await uploadImage(imageUri, `posts/${session.user.id}`);
    }
    const { error } = await supabase.from('posts').insert({
      user_id: session.user.id,
      content: text.trim(),
      image_url: imageUrl,
    });
    setPosting(false);
    if (!error) router.back();
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.postButton, !text.trim() && !imageUri && styles.postButtonDisabled]}
          onPress={submit}
          disabled={(!text.trim() && !imageUri) || posting}
        >
          {posting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.postButtonText}>Post</Text>}
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.input}
        placeholder="What's happening?"
        placeholderTextColor={colors.faint}
        multiline
        autoFocus
        value={text}
        onChangeText={setText}
      />
      {imageUri && (
        <View style={styles.previewWrap}>
          <Image source={{ uri: imageUri }} style={styles.preview} />
          <TouchableOpacity style={styles.removeImage} onPress={() => setImageUri(null)}>
            <Ionicons name="close-circle" size={26} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
      <TouchableOpacity style={styles.imageButton} onPress={pickImage}>
        <Ionicons name="image-outline" size={24} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 50 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: 12 },
  cancel: { color: colors.subtext, fontSize: 16 },
  postButton: { backgroundColor: colors.primary, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 20 },
  postButtonDisabled: { opacity: 0.5 },
  postButtonText: { color: '#fff', fontWeight: '700' },
  input: { fontSize: 18, padding: spacing.lg, minHeight: 100, textAlignVertical: 'top', color: colors.text },
  previewWrap: { marginHorizontal: spacing.lg, position: 'relative' },
  preview: { width: '100%', height: 220, borderRadius: 12, backgroundColor: colors.border },
  removeImage: { position: 'absolute', top: 8, right: 8 },
  imageButton: { padding: spacing.lg },
});
