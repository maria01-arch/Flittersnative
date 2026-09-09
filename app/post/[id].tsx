import { useEffect, useState } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '@/lib/supabase';
import { colors, spacing } from '@/lib/theme';
import { useAuth } from '@/lib/AuthContext';
import PostCard from '@/components/PostCard';
import CommentCard from '@/components/CommentCard';
import { loadCommentTree } from '@/lib/comments';

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams();
  const { session } = useAuth();
  const [post, setPost] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const load = async () => {
    const [{ data: postData }, { all }] = await Promise.all([
      supabase.from('posts').select('*,author:profiles(*),likes(user_id),reposts(user_id),comments(id)').eq('id', id).single(),
      loadCommentTree(id as string, session?.user?.id),
    ]);
    if (postData) {
      setPost({
        ...postData,
        likes_count: postData.likes?.length || 0,
        reposts_count: postData.reposts?.length || 0,
        comments_count: postData.comments?.length || 0,
        liked_by_me: postData.likes?.some((l: any) => l.user_id === session?.user?.id) || false,
      });
    }
    setComments(all.filter((c: any) => !c.reply_to_comment_id));
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [id]);

  const toggleLike = async () => {
    if (!session?.user?.id || !post) return;
    const wasLiked = post.liked_by_me;
    setPost((p: any) => ({ ...p, liked_by_me: !wasLiked, likes_count: wasLiked ? p.likes_count - 1 : p.likes_count + 1 }));
    if (wasLiked) {
      await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', session.user.id);
    } else {
      await supabase.from('likes').insert({ post_id: post.id, user_id: session.user.id });
    }
  };

  const toggleCommentLike = async (c: any) => {
    if (!session?.user?.id) return;
    setComments((prev) => prev.map((x) => (x.id === c.id ? { ...x, liked_by_me: !x.liked_by_me, likes_count: x.liked_by_me ? x.likes_count - 1 : x.likes_count + 1 } : x)));
    if (c.liked_by_me) {
      await supabase.from('comment_likes').delete().eq('comment_id', c.id).eq('user_id', session.user.id);
    } else {
      await supabase.from('comment_likes').insert({ comment_id: c.id, user_id: session.user.id });
    }
  };

  const toggleCommentRepost = async (c: any) => {
    if (!session?.user?.id) return;
    setComments((prev) => prev.map((x) => (x.id === c.id ? { ...x, reposted_by_me: !x.reposted_by_me, reposts_count: x.reposted_by_me ? x.reposts_count - 1 : x.reposts_count + 1 } : x)));
    if (c.reposted_by_me) {
      await supabase.from('comment_reposts').delete().eq('comment_id', c.id).eq('user_id', session.user.id);
    } else {
      await supabase.from('comment_reposts').insert({ comment_id: c.id, user_id: session.user.id });
    }
  };

  const submitComment = async () => {
    if (!text.trim() || !session?.user?.id) return;
    setSending(true);
    await supabase.from('comments').insert({ post_id: id, user_id: session.user.id, content: text.trim() });
    if (post?.user_id && post.user_id !== session.user.id) {
      await supabase.from('notifications').insert({ user_id: post.user_id, actor_id: session.user.id, type: 'comment', post_id: id });
    }
    setText('');
    await load();
    setSending(false);
  };

  if (loading || !post) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1DA1F2" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Post</Text>
        <View style={{ width: 24 }} />
      </View>
      <FlatList
        data={comments}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={<PostCard post={post} onLike={toggleLike} />}
        renderItem={({ item }) => (
          <CommentCard comment={item} postId={id as string} onLike={toggleCommentLike} onRepost={toggleCommentRepost} />
        )}
        ListEmptyComponent={<Text style={styles.empty}>No comments yet. Say something!</Text>}
      />
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder="Write a comment..."
          placeholderTextColor="#888"
          value={text}
          onChangeText={setText}
        />
        <TouchableOpacity onPress={submitComment} disabled={sending || !text.trim()}>
          <Ionicons name="send" size={22} color={text.trim() ? '#1DA1F2' : '#ccc'} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 50, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  topBarTitle: { fontSize: 17, fontWeight: 'bold' },
  empty: { textAlign: 'center', marginTop: 30, color: colors.subtext },
  inputBar: { flexDirection: 'row', alignItems: 'center', padding: 10, borderTopWidth: 1, borderTopColor: colors.border, gap: 10, backgroundColor: colors.card },
  input: { flex: 1, backgroundColor: '#F3F4F6', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14 },
});
