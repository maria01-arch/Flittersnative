import { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import { spacing } from '@/lib/theme';
import Avatar from './Avatar';

export default function ReelCommentsSheet({
  reelId,
  visible,
  onClose,
  onCommentPosted,
}: {
  reelId: string | null;
  visible: boolean;
  onClose: () => void;
  onCommentPosted?: () => void;
}) {
  const { session } = useAuth();
  const { colors } = useTheme();
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!visible || !reelId) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from('comments')
      .select('*,author:profiles!comments_user_id_fkey(id,display_name,username,avatar_url)')
      .eq('reel_id', reelId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error('[ReelCommentsSheet] load failed:', error.message, error);
        setComments(data || []);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, reelId]);

  const send = async () => {
    if (!text.trim() || !session?.user?.id || !reelId) return;
    setSending(true);
    const { data, error } = await supabase
      .from('comments')
      .insert({ reel_id: reelId, user_id: session.user.id, content: text.trim() })
      .select('*,author:profiles!comments_user_id_fkey(id,display_name,username,avatar_url)')
      .single();
    setSending(false);
    if (error || !data) {
      console.error('[ReelCommentsSheet] send failed:', error?.message, error);
      return;
    }
    setText('');
    setComments((prev) => [...prev, data]);
    onCommentPosted?.();
  };

  const openProfile = (userId?: string) => {
    if (!userId) return;
    onClose();
    router.push(`/user/${userId}`);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropTap} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.sheet, { backgroundColor: colors.card }]}
        >
          <View style={styles.handle} />
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Comments</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.subtext} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator style={{ marginTop: 30 }} color={colors.primary} />
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(item) => item.id}
              style={styles.list}
              ListEmptyComponent={
                <Text style={[styles.empty, { color: colors.subtext }]}>No comments yet. Say something!</Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.row} onPress={() => openProfile(item.author?.id)} activeOpacity={0.7}>
                  <Avatar uri={item.author?.avatar_url} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: colors.text }]}>{item.author?.display_name || 'Unknown'}</Text>
                    <Text style={[styles.content, { color: colors.text }]}>{item.content}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}

          <View style={[styles.inputBar, { borderTopColor: colors.border }]}>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text }]}
              placeholder="Add a comment..."
              placeholderTextColor={colors.faint}
              value={text}
              onChangeText={setText}
            />
            <TouchableOpacity onPress={send} disabled={sending || !text.trim()}>
              {sending ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="send" size={22} color={text.trim() ? colors.primary : colors.faint} />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  backdropTap: { flex: 1 },
  sheet: { height: '65%', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(150,150,150,0.4)', alignSelf: 'center', marginTop: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1 },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  list: { flex: 1 },
  empty: { textAlign: 'center', marginTop: 40 },
  row: { flexDirection: 'row', gap: 10, padding: spacing.lg, paddingVertical: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  name: { fontWeight: '700', fontSize: 13.5 },
  content: { fontSize: 14, marginTop: 2, lineHeight: 19 },
  inputBar: { flexDirection: 'row', alignItems: 'center', padding: 10, borderTopWidth: 1, gap: 10 },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14 },
});
