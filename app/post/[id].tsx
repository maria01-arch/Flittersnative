import { useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '@/lib/supabase';
import { spacing } from '@/lib/theme';
import { useTheme } from '@/lib/ThemeContext';
import { useAuth } from '@/lib/AuthContext';
import PostCard from '@/components/PostCard';
import CommentCard from '@/components/CommentCard';
import { loadCommentTree } from '@/lib/comments';

export default function PostDetailScreen() {
  const { id, focusComment } = useLocalSearchParams();
  const { session } = useAuth();
  const { colors } = useTheme();
  const [post, setPost] = useState<any>(null);
  const [threadPosts, setThreadPosts] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  // Guards against a fast double-tap firing the same like/repost mutation
  // twice before the first one's state update has settled — that was
  // producing two `notifications` rows (and could fire two conflicting
  // like inserts) for one tap.
  const mutationInFlight = useRef(false);

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
      if (postData.thread_id) {
        const { data: thread } = await supabase
          .from('posts')
          .select('id,content,image_url,video_url,thread_order,created_at')
          .eq('thread_id', postData.thread_id)
          .neq('id', postData.id)
          .order('thread_order', { ascending: true });
        setThreadPosts(thread || []);
      } else {
        setThreadPosts([]);
      }
    }
    setComments(all.filter((c: any) => !c.reply_to_comment_id));
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [id]);

  const toggleLike = async () => {
    if (!session?.user?.id || !post || mutationInFlight.current) return;
    mutationInFlight.current = true;
    const wasLiked = post.liked_by_me;
    setPost((p: any) => ({ ...p, liked_by_me: !wasLiked, likes_count: wasLiked ? p.likes_count - 1 : p.likes_count + 1 }));
    if (wasLiked) {
      await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', session.user.id);
    } else {
      await supabase.from('likes').insert({ post_id: post.id, user_id: session.user.id });
    }
    mutationInFlight.current = false;
  };

  const toggleRepost = async () => {
    if (!session?.user?.id || !post || mutationInFlight.current) return;
    mutationInFlight.current = true;
    const wasReposted = post.reposted_by_me;
    setPost((p: any) => ({ ...p, reposted_by_me: !wasReposted, reposts_count: wasReposted ? p.reposts_count - 1 : p.reposts_count + 1 }));
    if (wasReposted) {
      await supabase.from('reposts').delete().eq('post_id', post.id).eq('user_id', session.user.id);
    } else {
      await supabase.from('reposts').insert({ post_id: post.id, user_id: session.user.id });
    }
    mutationInFlight.current = false;
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

  const deleteComment = (c: any) => {
    setComments((prev) => prev.filter((x) => x.id !== c.id));
  };

  const submitCommentInFlight = useRef(false);
  const submitComment = async () => {
    if (!text.trim() || !session?.user?.id || submitCommentInFlight.current) return;
    submitCommentInFlight.current = true;
    setSending(true);
    await supabase.from('comments').insert({ post_id: id, user_id: session.user.id, content: text.trim() });
    if (post?.user_id && post.user_id !== session.user.id) {
      await supabase.from('notifications').insert({ user_id: post.user_id, actor_id: session.user.id, type: 'comment', post_id: id });
    }
    setText('');
    await load();
    setSending(false);
    submitCommentInFlight.current = false;
  };

  if (loading || !post) {
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
        <Text style={[styles.topBarTitle, { color: colors.text }]}>Post</Text>
        <View style={{ width: 24 }} />
      </View>
      <FlatList
        data={comments}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <>
            <PostCard post={post} currentUserId={session?.user?.id} disableOpen onLike={toggleLike} onRepost={toggleRepost} onDelete={() => router.back()} />
            {threadPosts.map((t) => (
              <View key={t.id} style={[styles.threadItem, { borderBottomColor: colors.border }]}>
                {!!t.content && <Text style={[styles.threadContent, { color: colors.text }]}>{t.content}</Text>}
              </View>
            ))}
          </>
        }
        renderItem={({ item }) => (
          <CommentCard comment={item} postId={id as string} currentUserId={session?.user?.id} onLike={toggleCommentLike} onRepost={toggleCommentRepost} onDelete={deleteComment} />
        )}
        ListEmptyComponent={<Text style={[styles.empty, { color: colors.subtext }]}>No comments yet. Say something!</Text>}
      />
      <View style={[styles.inputBar, { borderTopColor: colors.border, backgroundColor: colors.card }]}>
        <TextInput
          style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text }]}
          placeholder="Write a comment..."
          placeholderTextColor={colors.faint}
          value={text}
          onChangeText={setText}
          autoFocus={focusComment === '1'}
        />
        <TouchableOpacity onPress={submitComment} disabled={sending || !text.trim()}>
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
  threadItem: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, marginLeft: 56 },
  threadContent: { fontSize: 15, lineHeight: 21 },
  inputBar: { flexDirection: 'row', alignItems: 'center', padding: 10, borderTopWidth: 1, gap: 10 },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14 },
});
