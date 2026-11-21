import { PlusButton, ActionTray } from '@/components/ComposerActions';
import { useEffect, useRef, useState } from 'react';
import { deleteLast } from '@/lib/emojiSplit';
import { Animated, ScrollView } from 'react-native';
import PasteTextInput from '@/components/PasteTextInput';
import { useClipboardImage } from '@/lib/clipboardImage';
import PasteImageChip from '@/components/PasteImageChip';
import StickerTray from '@/components/StickerTray';
import StickerMedia from '@/components/StickerMedia';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, Image, useWindowDimensions, Keyboard } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '@/lib/supabase';
import { spacing } from '@/lib/theme';
import { useTheme } from '@/lib/ThemeContext';
import { useAuth } from '@/lib/AuthContext';
import PostCard, { PostVideo } from '@/components/PostCard';
import OptImage from '@/components/OptImage';
import CommentCard from '@/components/CommentCard';
import { loadCommentTree, pickCommentImage } from '@/lib/comments';
import { uploadImage } from '@/lib/upload';
import { canPerform, permissionDeniedMessage } from '@/lib/permissions';
import MentionSuggest from '@/components/MentionSuggest';
import PollCreateSheet from '@/components/PollCreateSheet';
import { pollContent } from '@/lib/polls';
import { notifyMentions, notifyOnce, createQuoteRepost, applyCounts, fetchMyFlags, coownersEmbed } from '@/lib/postActions';
import { PostSkeleton, ListSkeleton } from '@/components/Skeleton';
import VideoPostPlayer from '@/components/VideoPostPlayer';
import GlassButton from '@/components/GlassButton';
import GlassPill from '@/components/GlassPill';
import KeyboardWrap from '@/components/KeyboardWrap';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ActionSheet from '@/components/ActionSheet';
import QuoteModal from '@/components/QuoteModal';
import ShareLinkSheet from '@/components/ShareLinkSheet';
import Avatar from '@/components/Avatar';
import VerifiedBadge from '@/components/VerifiedBadge';
import FollowButton from '@/components/FollowButton';
import { postLink } from '@/lib/flittersLinks';
import { playSound } from '@/lib/sounds';
import GiftSheet from '@/components/GiftSheet';

export default function PostDetailScreen() {
  const { id, focusComment, fromReels } = useLocalSearchParams();
  const { session } = useAuth();
  const { colors } = useTheme();
  const [post, setPost] = useState<any>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  // Video posts: the video box is big until you open the comments, then it
  // slides smaller at the top (and keeps playing) while comments fill the rest.
  const [commentsOpen, setCommentsOpen] = useState(focusComment === '1');
  const [repostSheetOpen, setRepostSheetOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const [kbOpen, setKbOpen] = useState(false);
  useEffect(() => {
    const a = Keyboard.addListener('keyboardDidShow', () => setKbOpen(true));
    const b = Keyboard.addListener('keyboardDidHide', () => setKbOpen(false));
    return () => { a.remove(); b.remove(); };
  }, []);
  const rootHRef = useRef(0);
  const [rootH, setRootH] = useState(0);
  const fullH = rootH || windowHeight;
  const smallH = Math.min(windowHeight * 0.28, windowWidth * 0.6) + insets.top;
  const videoH = useRef(new Animated.Value(focusComment === '1' ? Math.min(windowHeight * 0.28, windowWidth * 0.6) + insets.top : windowHeight)).current;
  const onRootLayout = (h: number) => {
    // Only grow: the keyboard shrinks this view and must not shrink the video.
    if (h > rootHRef.current) {
      rootHRef.current = h;
      setRootH(h);
      if (!commentsOpen) videoH.setValue(h);
    }
  };
  const openComments = (open: boolean) => {
    setCommentsOpen(open);
    Animated.timing(videoH, { toValue: open ? smallH : fullH, duration: 320, useNativeDriver: false }).start();
  };
  const [threadPosts, setThreadPosts] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  // Opened with "comment": bring the keyboard up. autoFocus alone is not
  // reliable on Android during the screen animation, so focus is also asked
  // for again a moment later (and once more if it still has not taken).
  const commentInputRef = useRef<any>(null);
  useEffect(() => {
    if (focusComment !== '1' || loading || !post || post.video_url) return;
    const timers = [250, 700, 1400].map((ms) =>
      setTimeout(() => {
        const r = commentInputRef.current;
        try {
          if (r && !r.isFocused?.()) r.focus();
        } catch {}
      }, ms)
    );
    return () => timers.forEach(clearTimeout);
  }, [loading, post?.id]);
  const [commentImage, setCommentImage] = useState<string | null>(null);
  const [showTray, setShowTray] = useState(false);
  const [pendingSticker, setPendingSticker] = useState<string | null>(null);
  const clip = useClipboardImage();
  // Guards against a fast double-tap firing the same like/repost mutation
  // twice before the first one's state update has settled — that was
  // producing two `notifications` rows (and could fire two conflicting
  // like inserts) for one tap.
  const mutationInFlight = useRef(false);

  const load = async () => {
    const [{ data: postData }, { all }] = await Promise.all([
      supabase.from('posts').select(`*,author:profiles(id,display_name,username,avatar_url,verified,is_authentic,verified_plan,who_can_repost,who_can_comment),likes(count),reposts(count),comments(count)${coownersEmbed()}`).eq('id', id).single(),
      loadCommentTree(id as string, session?.user?.id),
    ]);
    if (postData) {
      const flags = await fetchMyFlags([postData.id], session?.user?.id);
      setPost({ ...postData, ...applyCounts(postData, flags) });
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

  // Opening a post counts as a view for the creator's stats (once per person
  // per post; the feed already does the same). Your own posts don't count.
  const viewLogged = useRef<string | null>(null);
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid || !post?.id || post.user_id === uid || viewLogged.current === post.id) return;
    viewLogged.current = post.id;
    supabase.from('post_views').upsert({ user_id: uid, post_id: String(post.id), seen_at: new Date().toISOString() }, { onConflict: 'user_id,post_id' }).then(() => {}, () => {});
  }, [post?.id, post?.user_id, session?.user?.id]);

  const toggleLike = async () => {
    if (!session?.user?.id || !post || mutationInFlight.current) return;
    mutationInFlight.current = true;
    const wasLiked = post.liked_by_me;
    setPost((p: any) => ({ ...p, liked_by_me: !wasLiked, likes_count: wasLiked ? p.likes_count - 1 : p.likes_count + 1 }));
    if (!wasLiked) playSound('like');
    try {
      const { error } = wasLiked
        ? await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', session.user.id)
        : await supabase.from('likes').insert({ post_id: post.id, user_id: session.user.id });
      if (error && !/duplicate/i.test(error.message)) throw error;
    } catch {
      // Not saved: put the heart and the count back.
      setPost((p: any) => ({ ...p, liked_by_me: wasLiked, likes_count: post.likes_count }));
    } finally {
      mutationInFlight.current = false;
    }
  };

  const quoteRepost = async (_p: any, text: string) => {
    if (!session?.user?.id || !post) return;
    const { error } = await createQuoteRepost(post, text, session.user.id);
    if (error) {
      Alert.alert("Can't quote", error);
      throw new Error(error);
    }
    setPost((p: any) => ({ ...p, reposted_by_me: true, reposts_count: (p.reposts_count || 0) + 1 }));
  };

  const toggleRepost = async () => {
    if (!session?.user?.id || !post || mutationInFlight.current) return;
    const wasReposted = post.reposted_by_me;
    if (!wasReposted) {
      const allowed = await canPerform(post.author?.who_can_repost, post.user_id, session.user.id);
      if (!allowed) {
        Alert.alert("Can't repost", permissionDeniedMessage('who can repost their posts', post.author?.who_can_repost));
        return;
      }
    }
    mutationInFlight.current = true;
    setPost((p: any) => ({ ...p, reposted_by_me: !wasReposted, reposts_count: wasReposted ? p.reposts_count - 1 : p.reposts_count + 1 }));
    if (wasReposted) {
      await supabase.from('reposts').delete().eq('post_id', post.id).eq('user_id', session.user.id);
    } else {
      await supabase.from('reposts').insert({ post_id: post.id, user_id: session.user.id });
      await notifyOnce({ userId: post.user_id, actorId: session.user.id, type: 'repost', postId: post.id });
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

  const [pollOpen, setPollOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  // A poll posted as a comment.
  const postPollComment = async (pollId: string, question: string) => {
    if (!session?.user?.id) return;
    const { error } = await supabase.from('comments').insert({ post_id: id, user_id: session.user.id, content: pollContent(question), poll_id: pollId });
    if (error) {
      Alert.alert("Couldn't post", 'Check your connection and try again.');
      return;
    }
    // The post owner is notified by the database (notify_on_comment).
    await load();
  };

  const submitCommentInFlight = useRef(false);
  const submitComment = async () => {
    if ((!text.trim() && !commentImage && !pendingSticker) || !session?.user?.id || !post || submitCommentInFlight.current) return;
    const allowed = await canPerform(post.author?.who_can_comment, post.user_id, session.user.id);
    if (!allowed) {
      Alert.alert("Can't comment", permissionDeniedMessage('who can comment on their posts', post.author?.who_can_comment));
      return;
    }
    submitCommentInFlight.current = true;
    setSending(true);
    let imageUrl: string | null = null;
    if (commentImage) {
      imageUrl = await uploadImage(commentImage, `posts/${session.user.id}`);
      if (!imageUrl) {
        Alert.alert("Couldn't upload the picture", 'Check your connection and try again.');
        setSending(false);
        submitCommentInFlight.current = false;
        return;
      }
    }
    const { error: cErr } = await supabase.from('comments').insert({ post_id: id, user_id: session.user.id, content: text.trim(), ...(imageUrl ? { image_url: imageUrl } : {}), ...(pendingSticker ? { sticker_url: pendingSticker } : {}) });
    if (cErr) {
      Alert.alert("Couldn't post", cErr.message);
      setSending(false);
      submitCommentInFlight.current = false;
      return;
    }
    // The post owner is notified by the database (notify_on_comment).
    // People tagged with @username in the comment get a notification.
    notifyMentions([text.trim()], String(id), session.user.id, post?.user_id ? [post.user_id] : []).catch(() => {});
    setText('');
    setCommentImage(null);
    setPendingSticker(null);
    await load();
    setSending(false);
    submitCommentInFlight.current = false;
  };

  if (loading || !post) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: 60 }}>
        <PostSkeleton withMedia />
        <View style={{ marginTop: 16 }}>
          <ListSkeleton count={4} />
        </View>
      </View>
    );
  }

  const inputArea = (
    <>
      {commentImage && (
        <View style={[styles.imgPreviewBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <Image source={{ uri: commentImage }} style={styles.imgPreview} />
          <TouchableOpacity onPress={() => setCommentImage(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={22} color={colors.subtext} />
          </TouchableOpacity>
        </View>
      )}
      {!!pendingSticker && (
        <View style={[styles.imgPreviewBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <StickerMedia url={pendingSticker} size={64} />
          <TouchableOpacity onPress={() => setPendingSticker(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={22} color={colors.subtext} />
          </TouchableOpacity>
        </View>
      )}
      {clip.has && !commentImage && (
        <PasteImageChip
          onPaste={async () => {
            const u = await clip.take();
            if (u) setCommentImage(u);
          }}
          onDismiss={clip.dismiss}
        />
      )}
      <MentionSuggest text={text} onChange={setText} />
      <ActionTray
        open={plusOpen}
        onClose={() => setPlusOpen(false)}
        actions={[
          { key: 'media', icon: 'image-outline', label: 'Photo', onPress: async () => { const u = await pickCommentImage(); if (u) { setCommentImage(u); setPendingSticker(null); } } },
          { key: 'sticker', icon: 'happy-outline', label: 'Stickers', onPress: () => { Keyboard.dismiss(); setShowTray(true); } },
          { key: 'poll', icon: 'stats-chart-outline', label: 'Poll', onPress: () => { Keyboard.dismiss(); setPollOpen(true); } },
          ...(post.user_id && post.user_id !== session?.user?.id ? [{ key: 'gift', icon: 'gift-outline', label: 'Gift', onPress: () => { Keyboard.dismiss(); setGiftOpen(true); } }] : []),
        ]}
      />
      <GiftSheet visible={giftOpen} onClose={() => setGiftOpen(false)} toUserId={post.user_id} toName={post.author?.display_name} context="comment" postId={post.id} onSent={() => { load(); }} />
      <PollCreateSheet visible={pollOpen} onClose={() => setPollOpen(false)} onCreated={postPollComment} />
      <View style={[styles.inputBar, { borderTopColor: colors.border, backgroundColor: colors.card }]}>
        <PlusButton open={plusOpen} onPress={() => setPlusOpen((v) => !v)} />
        <PasteTextInput
              onPasteImage={(u) => setCommentImage(u)}
          style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text }]}
          placeholder={commentImage || pendingSticker ? 'Add a caption...' : 'Write a comment...'}
          placeholderTextColor={colors.faint}
          value={text}
          onChangeText={setText}
          ref={commentInputRef}
          onFocus={() => setShowTray(false)}
          autoFocus={focusComment === '1' && !post.video_url}
        />
        <TouchableOpacity onPress={submitComment} disabled={sending || (!text.trim() && !commentImage && !pendingSticker)}>
          {sending ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="send" size={24} color={text.trim() || commentImage || pendingSticker ? colors.primary : colors.faint} />}
        </TouchableOpacity>
      </View>
      {showTray && !!session?.user?.id && (
        <StickerTray userId={session.user.id} onSelectEmoji={(e) => setText((t) => t + e)} onBackspace={() => setText((t) => deleteLast(t))} onSend={submitComment} canSend={!!(text.trim() || commentImage || pendingSticker)} onCancel={() => setShowTray(false)} onSelectSticker={(u) => { setPendingSticker(u); setCommentImage(null); setShowTray(false); }} onClose={() => setShowTray(false)} />
      )}
    </>
  );

  const goBackToReels = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/reels' as any);
  };

  if (post.video_url) {
    const ico = (name: any, color = '#fff') => <Ionicons name={name} size={17} color={color} />;
    const actionRow = (
      <View style={styles.actionRow}>
        <GlassPill label={post.comments_count ?? comments.length} onPress={() => openComments(!commentsOpen)} active={commentsOpen} activeColor="#4da3ff" icon={ico('chatbubble-outline')} />
        <GlassPill active={!!post.reposted_by_me} activeColor="#2ecc71" label={post.reposts_count || 0} onPress={() => setRepostSheetOpen(true)} icon={ico('repeat', post.reposted_by_me ? '#2ecc71' : '#fff')} />
        <GlassPill active={!!post.liked_by_me} activeColor="#ff3b6b" label={post.likes_count || 0} onPress={toggleLike} icon={ico(post.liked_by_me ? 'heart' : 'heart-outline', post.liked_by_me ? '#ff3b6b' : '#fff')} />
        <GlassPill onPress={() => setShareOpen(true)} icon={ico('paper-plane-outline')} />
      </View>
    );
    const padV = videoH.interpolate({ inputRange: [smallH, Math.max(smallH + 1, fullH)], outputRange: [insets.top, 0], extrapolate: 'clamp' });
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: '#000' }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
        onLayout={(e) => onRootLayout(e.nativeEvent.layout.height)}
      >
        <VideoPostPlayer
          uri={post.video_url}
          height={videoH}
          compact={commentsOpen}
          topInset={insets.top}
          bottomInset={insets.bottom}
          topPad={padV}
          topLeft={<GlassButton size={38} onPress={() => router.back()} icon={<Ionicons name="arrow-back" size={20} color="#fff" />} />}
          topRight={
            fromReels === '1' ? (
              <TouchableOpacity onPress={goBackToReels} activeOpacity={0.8} style={styles.reelsPill}>
                <Ionicons name="film-outline" size={14} color="#fff" />
                <Text style={styles.reelsPillText}>Back to reels</Text>
              </TouchableOpacity>
            ) : null
          }
          bottomOverlay={
            <View style={{ marginBottom: 6 }}>
              <TouchableOpacity style={styles.authorRow} onPress={() => post.author?.id && router.push(`/user/${post.author.id}` as any)} activeOpacity={0.8}>
                <Avatar uri={post.author?.avatar_url} size={40} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Text style={[styles.authorNameDark, { flexShrink: 1 }]} numberOfLines={1}>{post.author?.display_name || post.author?.username}</Text>
                    <VerifiedBadge verified={post.author?.verified} isAuthentic={post.author?.is_authentic} plan={post.author?.verified_plan} size={13} />
                  </View>
                  {!!post.author?.username && <Text style={styles.authorHandleDark}>@{post.author.username}</Text>}
                </View>
                <FollowButton userId={post.author?.id || post.user_id} />
              </TouchableOpacity>
              {!!post.content && <Text style={styles.captionDark} numberOfLines={3}>{post.content}</Text>}
              {actionRow}
            </View>
          }
        />
        {commentsOpen && (
          <>
            <View style={{ backgroundColor: '#000', paddingHorizontal: 14, paddingBottom: 10 }}>{actionRow}</View>
            <View style={{ flex: 1, backgroundColor: colors.bg }}>
              <FlatList
                style={{ flex: 1 }}
                data={comments}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <CommentCard comment={item} postId={id as string} currentUserId={session?.user?.id} onLike={toggleCommentLike} onRepost={toggleCommentRepost} onDelete={deleteComment} />
                )}
                ListEmptyComponent={<Text style={[styles.empty, { color: colors.subtext }]}>No comments yet. Say something!</Text>}
              />
              <View style={{ backgroundColor: colors.card, paddingBottom: kbOpen ? 0 : insets.bottom }}>{inputArea}</View>
            </View>
          </>
        )}
        <ActionSheet
          visible={repostSheetOpen}
          onClose={() => setRepostSheetOpen(false)}
          options={
            post.reposted_by_me
              ? [{ label: 'Undo repost', icon: 'repeat', destructive: true, onPress: toggleRepost }]
              : [
                  { label: 'Repost', icon: 'repeat', onPress: toggleRepost },
                  { label: 'Quote', icon: 'create-outline', onPress: () => setQuoteOpen(true) },
                ]
          }
        />
        <QuoteModal
          visible={quoteOpen}
          post={post}
          onClose={() => setQuoteOpen(false)}
          onSubmit={async (t: string) => {
            await quoteRepost(post, t);
            setQuoteOpen(false);
          }}
        />
        <ShareLinkSheet visible={shareOpen} url={postLink(post.id)} title="Share post" userId={session?.user?.id} videoUrl={post.video_url} imageUrl={post.image_url} post={post} onClose={() => setShareOpen(false)} />
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardWrap style={{ flex: 1, backgroundColor: colors.bg }}>
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
            <PostCard post={post} currentUserId={session?.user?.id} disableOpen onLike={toggleLike} onRepost={toggleRepost} onQuote={quoteRepost} onDelete={() => router.back()} />
            {/* The thread list includes the post being viewed (thread_order 0), which
                PostCard already shows above — skip it here, or its text appears twice. */}
            {threadPosts.filter((t) => t.id !== post?.id).map((t) => (
              <View key={t.id} style={[styles.threadItem, { borderBottomColor: colors.border }]}>
                {!!t.content && <Text style={[styles.threadContent, { color: colors.text }]}>{t.content}</Text>}
                {!!t.image_url && <OptImage dp={windowWidth - 56} source={{ uri: t.image_url }} style={[styles.threadImage, { backgroundColor: colors.border }]} resizeMode="cover" />}
                {!!t.video_url && <PostVideo uri={t.video_url} maxWidth={windowWidth - 56 - spacing.lg * 2} expanded />}
              </View>
            ))}
          </>
        }
        renderItem={({ item }) => (
          <CommentCard comment={item} postId={id as string} currentUserId={session?.user?.id} onLike={toggleCommentLike} onRepost={toggleCommentRepost} onDelete={deleteComment} />
        )}
        ListEmptyComponent={<Text style={[styles.empty, { color: colors.subtext }]}>No comments yet. Say something!</Text>}
      />
      {inputArea}
    </KeyboardWrap>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 50, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  topBarTitle: { fontSize: 17, fontWeight: 'bold' },
  reelsPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  reelsPillText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 0 },
  authorNameDark: { color: '#fff', fontSize: 15, fontWeight: '700' },
  authorHandleDark: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  captionDark: { color: '#fff', fontSize: 15, lineHeight: 21, marginTop: 8 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  authorName: { fontSize: 15, fontWeight: '700' },
  openComments: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 14, marginTop: 16, marginBottom: 8 },
  empty: { textAlign: 'center', marginTop: 30 },
  threadItem: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, marginLeft: 56 },
  threadContent: { fontSize: 15, lineHeight: 21 },
  threadImage: { width: '100%', height: 240, borderRadius: 12, marginTop: 10 },
  imgPreviewBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1 },
  imgPreview: { width: 64, height: 64, borderRadius: 10 },
  inputBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, borderTopWidth: 1, gap: 12 },
  input: { flex: 1, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 11, fontSize: 16, minHeight: 44, maxHeight: 120 },
});
