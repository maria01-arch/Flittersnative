import { useEffect, useState } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/ThemeContext';
import { useAuth } from '@/lib/AuthContext';
import CommentCard from '@/components/CommentCard';
import { loadCommentTree } from '@/lib/comments';

export default function CommentThreadScreen() {
  const { id, postId } = useLocalSearchParams();
  const { session } = useAuth();
  const { colors } = useTheme();
  const [root, setRoot] = useState<any>(null);
  const [replies, setReplies] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const load = async () => {
    const { all, byId } = await loadCommentTree(postId as string, session?.user?.id);
    setRoot(byId[id as string] || null);
    setReplies(all.filter((c: any) => c.reply_to_comment_id === id));
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [id, postId]);

  const toggleLike = async (c: any, isRoot = false) => {
    if (!session?.user?.id) return;
    const update = (x: any) => (x.id === c.id ? { ...x, liked_by_me: !x.liked_by_me, likes_count: x.liked_by_me ? x.likes_count - 1 : x.likes_count + 1 } : x);
    if (isRoot) setRoot((r: any) => update(r));
    else setReplies((prev) => prev.map(update));
    if (c.liked_by_me) {
      await supabase.from('comment_likes').delete().eq('comment_id', c.id).eq('user_id', session.user.id);
    } else {
      await supabase.from('comment_likes').insert({ comment_id: c.id, user_id: session.user.id });
    }
  };

  const toggleRepost = async (c: any, isRoot = false) => {
    if (!session?.user?.id) return;
    const update = (x: any) => (x.id === c.id ? { ...x, reposted_by_me: !x.reposted_by_me, reposts_count: x.reposted_by_me ? x.reposts_count - 1 : x.reposts_count + 1 } : x);
    if (isRoot) setRoot((r: any) => update(r));
    else setReplies((prev) => prev.map(update));
    if (c.reposted_by_me) {
      await supabase.from('comment_reposts').delete().eq('comment_id', c.id).eq('user_id', session.user.id);
    } else {
      await supabase.from('comment_reposts').insert({ comment_id: c.id, user_id: session.user.id });
    }
  };

  const submitReply = async () => {
    if (!text.trim() || !session?.user?.id || !root) return;
    setSending(true);
    await supabase.from('comments').insert({
      post_id: postId,
      user_id: session.user.id,
      content: text.trim(),
      reply_to_comment_id: root.id,
    });
    if (root.user_id && root.user_id !== session.user.id) {
      await supabase.from('notifications').insert({ user_id: root.user_id, actor_id: session.user.id, type: 'comment', post_id: postId });
    }
    setText('');
    await load();
    setSending(false);
  };

  if (loading || !root) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: colors.text }]}>Reply</Text>
        <View style={{ width: 24 }} />
      </View>
      <FlatList
        data={replies}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <CommentCard comment={root} postId={postId as string} navigable={false} onLike={(c) => toggleLike(c, true)} onRepost={(c) => toggleRepost(c, true)} />
        }
        renderItem={({ item }) => (
          <CommentCard comment={item} postId={postId as string} onLike={(c) => toggleLike(c)} onRepost={(c) => toggleRepost(c)} />
        )}
        ListEmptyComponent={<Text style={[styles.empty, { color: colors.subtext }]}>No replies yet.</Text>}
      />
      <View style={[styles.inputBar, { borderTopColor: colors.border, backgroundColor: colors.card }]}>
        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text }]}
          placeholder="Write a reply..."
          placeholderTextColor={colors.faint}
          value={text}
          onChangeText={setText}
        />
        <TouchableOpacity onPress={submitReply} disabled={sending || !text.trim()}>
          <Ionicons name="send" size={22} color={text.trim() ? colors.primary : colors.faint} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 50, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  topBarTitle: { fontSize: 17, fontWeight: 'bold' },
  empty: { textAlign: 'center', marginTop: 30 },
  inputBar: { flexDirection: 'row', alignItems: 'center', padding: 10, borderTopWidth: 1, gap: 10 },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14 },
});
