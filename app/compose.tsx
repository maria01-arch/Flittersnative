import { useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, ActivityIndicator, Image, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { uploadImage, uploadVideo } from '@/lib/upload';
import { spacing } from '@/lib/theme';
import { useTheme } from '@/lib/ThemeContext';

const MAX_LENGTH = 200;

type Segment = { key: string; text: string; imageUri: string | null; videoUri: string | null };

const emptySegment = (): Segment => ({ key: Crypto.randomUUID(), text: '', imageUri: null, videoUri: null });

export default function ComposeScreen() {
  const { session } = useAuth();
  const { colors } = useTheme();
  const [segments, setSegments] = useState<Segment[]>([emptySegment()]);
  const [posting, setPosting] = useState(false);

  const updateSegment = (key: string, patch: Partial<Segment>) => {
    setSegments((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  };

  const pickMedia = async (key: string) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.8 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (asset.type === 'video') {
      updateSegment(key, { videoUri: asset.uri, imageUri: null });
    } else {
      updateSegment(key, { imageUri: asset.uri, videoUri: null });
    }
  };

  const addThreadSegment = () => setSegments((prev) => [...prev, emptySegment()]);
  const removeSegment = (key: string) => setSegments((prev) => (prev.length > 1 ? prev.filter((s) => s.key !== key) : prev));

  const hasAnyContent = segments.some((s) => s.text.trim() || s.imageUri || s.videoUri);

  const submit = async () => {
    if (!hasAnyContent || !session?.user?.id) return;
    setPosting(true);

    const threadId = segments.length > 1 ? Crypto.randomUUID() : null;
    const rows: any[] = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (!seg.text.trim() && !seg.imageUri && !seg.videoUri) continue;
      let imageUrl: string | null = null;
      let videoUrl: string | null = null;
      if (seg.imageUri) imageUrl = await uploadImage(seg.imageUri, `posts/${session.user.id}`);
      if (seg.videoUri) videoUrl = await uploadVideo(seg.videoUri, `posts/${session.user.id}`);

      if (seg.imageUri && !imageUrl) {
        setPosting(false);
        Alert.alert("Couldn't post", 'The image failed to upload — check your connection and try again.');
        return;
      }
      if (seg.videoUri && !videoUrl) {
        setPosting(false);
        Alert.alert("Couldn't post", 'The video failed to upload — check your connection and try again. Larger videos need a stronger connection.');
        return;
      }

      rows.push({
        user_id: session.user.id,
        content: seg.text.trim(),
        image_url: imageUrl,
        video_url: videoUrl,
        thread_id: threadId,
        thread_order: threadId ? i : null,
      });
    }

    const { error } = await supabase.from('posts').insert(rows);
    setPosting(false);
    if (error) {
      console.error('[compose] post insert failed:', error.message, error);
      Alert.alert("Couldn't post", error.message);
      return;
    }
    router.back();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.cancel, { color: colors.subtext }]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.postButton, { backgroundColor: colors.primary }, !hasAnyContent && styles.postButtonDisabled]}
          onPress={submit}
          disabled={!hasAnyContent || posting}
        >
          {posting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.postButtonText}>{segments.length > 1 ? 'Post thread' : 'Post'}</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled">
        {segments.map((seg, i) => (
          <View key={seg.key} style={[styles.segment, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
            {segments.length > 1 && (
              <View style={styles.segmentHeader}>
                <Text style={{ color: colors.subtext, fontSize: 12, fontWeight: '600' }}>
                  {i === 0 ? 'Post 1 of the thread' : `Post ${i + 1}`}
                </Text>
                {i > 0 && (
                  <TouchableOpacity onPress={() => removeSegment(seg.key)}>
                    <Ionicons name="close" size={18} color={colors.faint} />
                  </TouchableOpacity>
                )}
              </View>
            )}
            <TextInput
              style={[styles.input, { color: colors.text }]}
              placeholder={i === 0 ? "What's happening?" : 'Add another post...'}
              placeholderTextColor={colors.faint}
              multiline
              autoFocus={i === 0}
              value={seg.text}
              maxLength={MAX_LENGTH}
              onChangeText={(t) => updateSegment(seg.key, { text: t })}
            />
            <Text style={[styles.counter, { color: seg.text.length >= MAX_LENGTH ? colors.danger : colors.faint }]}>
              {seg.text.length}/{MAX_LENGTH}
            </Text>

            {seg.imageUri && (
              <View style={styles.previewWrap}>
                <Image source={{ uri: seg.imageUri }} style={[styles.preview, { backgroundColor: colors.border }]} />
                <TouchableOpacity style={styles.removeMedia} onPress={() => updateSegment(seg.key, { imageUri: null })}>
                  <Ionicons name="close-circle" size={26} color="#fff" />
                </TouchableOpacity>
              </View>
            )}
            {seg.videoUri && (
              <View style={styles.previewWrap}>
                <View style={[styles.preview, styles.videoPreview, { backgroundColor: colors.border }]}>
                  <Ionicons name="videocam" size={32} color={colors.subtext} />
                  <Text style={{ color: colors.subtext, marginTop: 6, fontSize: 12 }}>Video attached</Text>
                </View>
                <TouchableOpacity style={styles.removeMedia} onPress={() => updateSegment(seg.key, { videoUri: null })}>
                  <Ionicons name="close-circle" size={26} color="#fff" />
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity style={styles.mediaButton} onPress={() => pickMedia(seg.key)}>
              <Ionicons name="image-outline" size={22} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>Photo or video</Text>
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity style={styles.addThreadButton} onPress={addThreadSegment}>
          <View style={[styles.addThreadIcon, { backgroundColor: colors.primary }]}>
            <Ionicons name="add" size={20} color="#fff" />
          </View>
          <Text style={[styles.addThreadText, { color: colors.text }]}>Add to thread</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 50 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: 12 },
  cancel: { fontSize: 16 },
  postButton: { borderRadius: 20, paddingVertical: 8, paddingHorizontal: 20 },
  postButtonDisabled: { opacity: 0.5 },
  postButtonText: { color: '#fff', fontWeight: '700' },
  segment: { paddingTop: spacing.md },
  segmentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, marginBottom: 4 },
  input: { fontSize: 18, paddingHorizontal: spacing.lg, minHeight: 70, textAlignVertical: 'top' },
  counter: { textAlign: 'right', paddingHorizontal: spacing.lg, fontSize: 12, marginTop: 2 },
  previewWrap: { marginHorizontal: spacing.lg, marginTop: 8, position: 'relative' },
  preview: { width: '100%', height: 220, borderRadius: 12 },
  videoPreview: { justifyContent: 'center', alignItems: 'center' },
  removeMedia: { position: 'absolute', top: 8, right: 8 },
  mediaButton: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: spacing.lg },
  addThreadButton: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  addThreadIcon: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  addThreadText: { fontSize: 14, fontWeight: '600' },
});
