import { PlusButton, ActionTray } from '@/components/ComposerActions';
import { useEffect, useRef, useState } from 'react';
import { View, FlatList, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, Image } from 'react-native';
import Text from '@/components/AppText';
import PasteTextInput from '@/components/PasteTextInput';
import { useClipboardImage } from '@/lib/clipboardImage';
import PasteImageChip from '@/components/PasteImageChip';
import { useLocalSearchParams, router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/ThemeContext';
import { useAuth } from '@/lib/AuthContext';
import KeyboardWrap from '@/components/KeyboardWrap';
import CommentCard from '@/components/CommentCard';
import { loadCommentTree, pickCommentImage } from '@/lib/comments';
import { uploadImage } from '@/lib/upload';
import { canPerform, permissionDeniedMessage } from '@/lib/permissions';
import MentionSuggest from '@/components/MentionSuggest';
import PollCreateSheet from '@/components/PollCreateSheet';
import { pollContent } from '@/lib/polls';
import { notifyMentions } from '@/lib/postActions';
import { Keyboard } from 'react-native';

export default function CommentThreadScreen() {
  const { id, postId } = useLocalSearchParams();
  const { session } = useAuth();
  const { colors } = useTheme();
  const [root, setRoot] = useState<any>(null);
  const [replies, setReplies] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [replyImage, setReplyImage] = useState<string | null>(null);
  // Who the next reply is for. null = the top comment's author. Pick another person with their Reply button.
  const [target, setTarget] = useState<{ id: string; username: string } | null>(null);
  const clip = useClipboardImage();

  const load = async () => {
    const { all, byId } = await loadCommentTree(postId as string, session?.user?.id);
    let r = byId[id as string] || null;
    // Opened a reply (from a link or a notification)? Show its top comment, with the reply's author as who you answer.
    if (r?.reply_to_comment_id && byId[r.reply_to_comment_id]) {
      const picked = r;
      r = byId[r.reply_to_comment_id];
      if (picked.author?.id && picked.author.id !== session?.user?.id) setTarget({ id: picked.author.id, username: picked.author.username });
    }
    setRoot(r);
    setReplies(r ? all.filter((c: any) => c.reply_to_comment_id === r.id) : []);
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

  const [pollOpen, setPollOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const postPollReply = async (pollId: string, question: string) => {
    if (!session?.user?.id || !root) return;
    const { error } = await supabase.from('comments').insert({ post_id: postId, user_id: session.user.id, content: pollContent(question), reply_to_comment_id: root.id, poll_id: pollId });
    if (error) {
      Alert.alert("Couldn't post", 'Check your connection and try again.');
      return;
    }
    await load();
  };

  const submitReply = async () => {
    if ((!text.trim() && !replyImage) || !session?.user?.id || !root) return;
    // A reply is still a comment on the original post, so it's gated by
    // that post's who_can_comment — fetched here rather than on every
    // screen load, since replying is the only moment it matters.
    const { data: post } = await supabase.from('posts').select('user_id,author:profiles!user_id(who_can_comment)').eq('id', postId).single();
    const allowed = await canPerform((post?.author as any)?.who_can_comment, post?.user_id, session.user.id);
    if (!allowed) {
      Alert.alert("Can't comment", permissionDeniedMessage('who can comment on their posts', (post?.author as any)?.who_can_comment));
      return;
    }
    setSending(true);
    let imageUrl: string | null = null;
    if (replyImage) {
      imageUrl = await uploadImage(replyImage, `posts/${session.user.id}`);
      if (!imageUrl) {
        Alert.alert("Couldn't upload the picture", 'Check your connection and try again.');
        setSending(false);
        return;
      }
    }
    const { error: rErr } = await supabase.from('comments').insert({
      post_id: postId,
      user_id: session.user.id,
      content: text.trim(),
      reply_to_comment_id: root.id,
      ...(target && target.id !== root.user_id ? { reply_to_user_id: target.id } : {}),
      ...(imageUrl ? { image_url: imageUrl } : {}),
    });
    if (rErr) {
      Alert.alert("Couldn't post", rErr.message);
      setSending(false);
      return;
    }
    // The person the reply is for gets a notification (and the top comment's author, if that is someone else).
    const notify = Array.from(new Set([root.user_id, target?.id].filter((u) => u && u !== session.user.id))) as string[];
    for (const u of notify) {
      await supabase.from('notifications').insert({ user_id: u, actor_id: session.user.id, type: 'comment', post_id: postId });
    }
    // People tagged with @username in the reply get a notification (the people replied to already got one).
    notifyMentions([text.trim()], String(postId), session.user.id, notify).catch(() => {});
    setText('');
    setReplyImage(null);
    setTarget(null);
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
    <KeyboardWrap style={{ flex: 1, backgroundColor: colors.bg }}>
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
          <CommentCard
            comment={root}
            postId={postId as string}
            currentUserId={session?.user?.id}
            navigable={false}
            onReply={() => setTarget(null)}
            onLike={(c) => toggleLike(c, true)}
            onRepost={(c) => toggleRepost(c, true)}
            // Deleting the root comment of this thread leaves nothing left
            // to show here — the post's own comment list (one screen back)
            // is what actually reflects the deletion.
            onDelete={() => router.back()}
          />
        }
        renderItem={({ item }) => (
          <CommentCard
            comment={item}
            postId={postId as string}
            currentUserId={session?.user?.id}
            navigable={false}
            onReply={(c) => c.author?.id && c.author.id !== session?.user?.id && setTarget({ id: c.author.id, username: c.author.username })}
            onLike={(c) => toggleLike(c)}
            onRepost={(c) => toggleRepost(c)}
            onDelete={(c) => setReplies((prev) => prev.filter((x) => x.id !== c.id))}
          />
        )}
        ListEmptyComponent={<Text style={[styles.empty, { color: colors.subtext }]}>No replies yet.</Text>}
      />
      {replyImage && (
        <View style={[styles.imgPreviewBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <Image source={{ uri: replyImage }} style={styles.imgPreview} />
          <TouchableOpacity onPress={() => setReplyImage(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={22} color={colors.subtext} />
          </TouchableOpacity>
        </View>
      )}
      {clip.has && !replyImage && (
        <PasteImageChip
          onPaste={async () => {
            const u = await clip.take();
            if (u) setReplyImage(u);
          }}
          onDismiss={clip.dismiss}
        />
      )}
      {target ? (
        <View style={[styles.imgPreviewBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <Text style={{ color: colors.subtext }}>Replying to <Text style={{ color: colors.primary, fontWeight: '700' }}>@{target.username}</Text></Text>
          <TouchableOpacity onPress={() => setTarget(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={20} color={colors.subtext} />
          </TouchableOpacity>
        </View>
      ) : null}
      <MentionSuggest text={text} onChange={setText} />
      <ActionTray
        open={plusOpen}
        onClose={() => setPlusOpen(false)}
        actions={[
          { key: 'media', icon: 'image-outline', label: 'Photo', onPress: async () => { const u = await pickCommentImage(); if (u) setReplyImage(u); } },
          { key: 'poll', icon: 'stats-chart-outline', label: 'Poll', onPress: () => { Keyboard.dismiss(); setPollOpen(true); } },
        ]}
      />
      <PollCreateSheet visible={pollOpen} onClose={() => setPollOpen(false)} onCreated={postPollReply} />
      <View style={[styles.inputBar, { borderTopColor: colors.border, backgroundColor: colors.card }]}>
        <PlusButton open={plusOpen} onPress={() => setPlusOpen((v) => !v)} />
        <PasteTextInput
              onPasteImage={(u) => setReplyImage(u)}
          style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text }]}
          placeholder={replyImage ? 'Add a caption...' : 'Write a reply...'}
          placeholderTextColor={colors.faint}
          value={text}
          onChangeText={setText}
        />
        <TouchableOpacity onPress={submitReply} disabled={sending || (!text.trim() && !replyImage)}>
          {sending ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="send" size={24} color={text.trim() || replyImage ? colors.primary : colors.faint} />}
        </TouchableOpacity>
      </View>
    </KeyboardWrap>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 50, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  topBarTitle: { fontSize: 17, fontWeight: 'bold' },
  empty: { textAlign: 'center', marginTop: 30 },
  imgPreviewBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1 },
  imgPreview: { width: 64, height: 64, borderRadius: 10 },
  inputBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, borderTopWidth: 1, gap: 12 },
  input: { flex: 1, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 11, fontSize: 16, minHeight: 44, maxHeight: 120 },
});
