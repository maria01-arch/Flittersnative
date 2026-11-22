import { PlusButton, ActionTray } from '@/components/ComposerActions';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, FlatList, TextInput, TouchableOpacity, StyleSheet, Platform, ActivityIndicator, Alert, Keyboard, Image } from 'react-native';
import Text from '@/components/AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { requestOpenReel } from '@/lib/reelOpen';
import MentionSuggest from './MentionSuggest';
import PollCreateSheet from './PollCreateSheet';
import { pollContent } from '@/lib/polls';
import { notifyMentions } from '@/lib/postActions';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import { postTime } from '@/lib/timeAgo';
import Avatar from './Avatar';
import ReportModal from './ReportModal';
import VerifiedBadge from './VerifiedBadge';
import ActionSheet from './ActionSheet';
import ImageViewer from './ImageViewer';
import StickerTray from './StickerTray';
import StickerMedia from './StickerMedia';
import { uploadImage } from '@/lib/upload';
import { saveStickerWithAlert } from '@/lib/stickerActions';
import { pickCommentImage } from '@/lib/comments';

const SELECT = '*,author:profiles!comments_user_id_fkey(id,display_name,username,avatar_url,verified,is_authentic,verified_plan),comment_likes(count)';
const countOf = (rel: any) => (Array.isArray(rel) ? Number(rel[0]?.count) || 0 : 0);

// Reel comments, TikTok-style: bubbles, like a comment, reply to a comment,
// and "View N replies" to open the replies under it. Replies are stored in the
// same `comments` table (reply_to_comment_id), like post comments.
export default function ReelCommentsSheet({
  reelId,
  postId,
  notifyUserId,
  visible,
  onClose,
  onCommentPosted,
}: {
  reelId: string | null;
  // When this reel is also a feed post, its comments are the post's comments too.
  postId?: string | null;
  notifyUserId?: string | null;
  visible: boolean;
  onClose: () => void;
  onCommentPosted?: () => void;
}) {
  const { session } = useAuth();
  const { colors } = useTheme();
  const me = session?.user?.id;
  const [comments, setComments] = useState<any[]>([]);
  const [pollOpen, setPollOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [reelReplies, setReelReplies] = useState<Record<string, any[]>>({});
  const insets = useSafeAreaInsets();
  // The typing box is its own floating bar, separate from the sheet: the sheet
  // never moves, only the bar rides up on the keyboard. How far to lift it is
  // measured from where the bar really is, so it sits right on the keyboard
  // whether or not the phone already moved the pop-up by itself.
  const [kbOpen, setKbOpen] = useState(false);
  const [lift, setLift] = useState(0);
  const [barH, setBarH] = useState(70);
  const barRef = useRef<View>(null);
  const liftRef = useRef(0);
  liftRef.current = lift;
  useEffect(() => {
    const a = Keyboard.addListener('keyboardDidShow', (e: any) => {
      setKbOpen(true);
      setShowTray(false);
      const kbTop = e?.endCoordinates?.screenY;
      setTimeout(() => {
        (barRef.current as any)?.measureInWindow?.((_x: number, y: number, _w: number, h: number) => {
          if (typeof kbTop !== 'number') return;
          const overlap = y + h - kbTop;
          if (overlap > 2 || liftRef.current > 0) setLift(Math.max(0, liftRef.current + overlap));
        });
      }, 80);
    });
    const b = Keyboard.addListener('keyboardDidHide', () => {
      setKbOpen(false);
      setLift(0);
    });
    return () => { a.remove(); b.remove(); };
  }, []);
  const [commentImage, setCommentImage] = useState<string | null>(null);
  const [showTray, setShowTray] = useState(false);
  const [viewUri, setViewUri] = useState<string | null>(null);
  const [pendingSticker, setPendingSticker] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<any>(null);
  const [reportFor, setReportFor] = useState<any>(null);

  const decorate = (rows: any[], likedIds: Set<string>) =>
    rows.map((c) => ({ ...c, likes_count: countOf(c.comment_likes), liked_by_me: likedIds.has(c.id) }));

  useEffect(() => {
    if (!visible || !reelId) return;
    let cancelled = false;
    setLoading(true);
    setReplyingTo(null);
    setExpanded(new Set());
    (async () => {
      const q = supabase.from('comments').select(SELECT);
      const { data, error } = await (postId ? q.or(`reel_id.eq.${reelId},post_id.eq.${postId}`) : q.eq('reel_id', reelId)).order('created_at', { ascending: true });
      if (error) console.error('[ReelCommentsSheet] load failed:', error.message, error);
      const rows = data || [];
      const liked = new Set<string>();
      if (me && rows.length) {
        const { data: mine } = await supabase.from('comment_likes').select('comment_id').eq('user_id', me).in('comment_id', rows.map((r: any) => r.id));
        (mine || []).forEach((l: any) => liked.add(l.comment_id));
      }
      if (cancelled) return;
      setComments(decorate(rows, liked));
      setLoading(false);
      // Reels people posted in answer to these comments (best-effort: needs reel_replies.sql).
      if (rows.length) {
        const { data: rr } = await supabase
          .from('reels')
          .select('id,reply_to_comment_id,thumbnail_url,author:profiles(username,display_name)')
          .in('reply_to_comment_id', rows.map((r: any) => String(r.id)));
        if (!cancelled) {
          const m: Record<string, any[]> = {};
          (rr || []).forEach((x: any) => (m[x.reply_to_comment_id] = m[x.reply_to_comment_id] || []).push(x));
          setReelReplies(m);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, reelId, postId]);

  // Top-level comments, and the replies grouped under each.
  const { topLevel, repliesOf } = useMemo(() => {
    const top: any[] = [];
    const map: Record<string, any[]> = {};
    // A reply to a reply (made on the post screen, or the web) is shown under its top-level comment too.
    const byId: Record<string, any> = {};
    comments.forEach((c) => { byId[c.id] = c; });
    const rootOf = (c: any) => {
      let cur = c; let guard = 0;
      while (cur.reply_to_comment_id && byId[cur.reply_to_comment_id] && guard++ < 50) cur = byId[cur.reply_to_comment_id];
      return cur.reply_to_comment_id && !byId[cur.reply_to_comment_id] ? cur.reply_to_comment_id : cur.id;
    };
    comments.forEach((c) => {
      if (c.reply_to_comment_id) {
        const root = rootOf(c);
        (map[root] = map[root] || []).push(c);
      } else top.push(c);
    });
    Object.values(map).forEach((list) => list.sort((x, y) => String(x.created_at).localeCompare(String(y.created_at))));
    return { topLevel: top, repliesOf: map };
  }, [comments]);

  const send = async () => {
    const stickerUrl = pendingSticker;
    if ((!stickerUrl && !text.replace(/^@\S+\s*/, '').trim() && !commentImage) || !me || !reelId || sending) return;
    setSending(true);
    let imageUrl: string | null = null;
    if (!stickerUrl && commentImage) {
      imageUrl = await uploadImage(commentImage, `posts/${me}`);
      if (!imageUrl) {
        setSending(false);
        Alert.alert("Couldn't upload the picture", 'Check your connection and try again.');
        return;
      }
    }
    const content = replyingTo ? withMention(text.trim(), replyingTo) : text.trim();
    const extra: any = stickerUrl ? { sticker_url: stickerUrl } : imageUrl ? { image_url: imageUrl } : {};
    const row: any = postId ? { post_id: postId, user_id: me, content, ...extra } : { reel_id: reelId, user_id: me, content, ...extra };
    // Replying to a reply attaches to the same top-level comment, so threads stay one level deep.
    if (replyingTo) row.reply_to_comment_id = replyingTo.reply_to_comment_id || replyingTo.id;
    const { data, error } = await supabase.from('comments').insert(row).select(SELECT).single();
    setSending(false);
    if (error || !data) {
      console.error('[ReelCommentsSheet] send failed:', error?.message, error);
      Alert.alert("Couldn't post", error?.message || 'Please try again.');
      return;
    }
    if (postId && notifyUserId && notifyUserId !== me) {
      supabase.from('notifications').insert({ user_id: notifyUserId, actor_id: me, type: 'comment', post_id: postId }).then(() => {});
    }
    if (postId) notifyMentions([content], String(postId), me, notifyUserId ? [notifyUserId] : []).catch(() => {});
    setText('');
    setCommentImage(null);
    setPendingSticker(null);
    setShowTray(false);
    setComments((prev) => [...prev, ...decorate([data], new Set())]);
    if (row.reply_to_comment_id) setExpanded((prev) => new Set(prev).add(row.reply_to_comment_id));
    setReplyingTo(null);
    onCommentPosted?.();
  };

  // Replying puts @theirusername in front of your text so everyone can tell who you answered.
  const startReply = (c: any) => {
    setReplyingTo(c);
    const u = c?.author?.username;
    if (u && c.user_id !== me) setText((t) => (t.startsWith('@') ? t : `@${u} ${t}`));
  };
  // A poll posted as a comment (or as a reply, when replying to someone).
  const postPoll = async (pollId: string, question: string) => {
    if (!me || !reelId) return;
    const row: any = postId ? { post_id: postId, user_id: me, content: pollContent(question), poll_id: pollId } : { reel_id: reelId, user_id: me, content: pollContent(question), poll_id: pollId };
    if (replyingTo) row.reply_to_comment_id = replyingTo.reply_to_comment_id || replyingTo.id;
    const { data, error } = await supabase.from('comments').insert(row).select(SELECT).single();
    if (error || !data) {
      Alert.alert("Couldn't post", 'Check your connection and try again.');
      return;
    }
    setComments((prev) => [...prev, ...decorate([data], new Set())]);
    if (row.reply_to_comment_id) setExpanded((prev) => new Set(prev).add(row.reply_to_comment_id));
    setReplyingTo(null);
    onCommentPosted?.();
  };

  // Opens the composer to record or pick a video that is posted as your own reel, linked to this comment.
  const replyWithReel = (c: any) => {
    onClose();
    setTimeout(() => {
      router.push({
        pathname: '/compose',
        params: {
          replyReelId: String(reelId),
          replyCommentId: String(c.id),
          replyName: c.author?.username || c.author?.display_name || '',
          replyText: String(c.content || (c.image_url ? '📷 Photo' : c.sticker_url ? 'Sticker' : '')).slice(0, 140),
        },
      });
    }, 250);
  };
  const withMention = (t: string, c: any) => {
    const u = c?.author?.username;
    return u && c.user_id !== me && !t.startsWith('@') ? `@${u} ${t}` : t;
  };

  const toggleLike = async (c: any) => {
    if (!me) return;
    setComments((prev) => prev.map((x) => (x.id === c.id ? { ...x, liked_by_me: !x.liked_by_me, likes_count: x.likes_count + (x.liked_by_me ? -1 : 1) } : x)));
    if (c.liked_by_me) await supabase.from('comment_likes').delete().eq('comment_id', c.id).eq('user_id', me);
    else await supabase.from('comment_likes').insert({ comment_id: c.id, user_id: me });
  };

  const deleteComment = async (c: any) => {
    const { data, error } = await supabase.from('comments').delete().eq('id', c.id).eq('user_id', me!).select('id');
    if (error || !data?.length) {
      Alert.alert("Couldn't delete", error?.message || "The database didn't allow this delete. See the SQL fix in the chat.");
      return;
    }
    // Replies under a deleted comment go with it.
    await supabase.from('comments').delete().eq('reply_to_comment_id', c.id);
    setComments((prev) => prev.filter((x) => x.id !== c.id && x.reply_to_comment_id !== c.id));
    onCommentPosted?.();
  };

  const submitReport = async (reason: string, details: string) => {
    if (!me || !reportFor) return;
    const { error } = await supabase.from('reports').insert({
      reporter_id: me,
      // A comment under a reel (reel_id set) is a reel comment; one that belongs to a post is a post comment.
      ...(reportFor.reel_id ? { reported_reel_comment_id: reportFor.id } : { reported_comment_id: reportFor.id }),
      reported_user_id: reportFor.author?.id || reportFor.user_id || null,
      reason,
      details: details || null,
    });
    if (error) throw error;
  };

  const openProfile = (userId?: string) => {
    if (!userId) return;
    onClose();
    router.push(`/user/${userId}`);
  };

  const renderComment = (c: any, isReply: boolean) => (
    <View key={c.id} style={[styles.row, isReply && { marginLeft: 44 }]}>
      <TouchableOpacity onPress={() => openProfile(c.author?.id)}>
        <Avatar uri={c.author?.avatar_url} size={isReply ? 28 : 36} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <TouchableOpacity activeOpacity={0.8} onLongPress={() => setMenuFor(c)} style={{ backgroundColor: colors.inputBg, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start', maxWidth: '100%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text style={[styles.name, { color: colors.text, marginBottom: 0, flexShrink: 1 }]} numberOfLines={1}>{c.author?.display_name || 'Unknown'}</Text>
            <VerifiedBadge verified={c.author?.verified} isAuthentic={c.author?.is_authentic} plan={c.author?.verified_plan} size={12} />
          </View>
          {!!c.content && <Text style={[styles.content, { color: colors.text }]}>{c.content}</Text>}
          {!!c.image_url && (
            <TouchableOpacity activeOpacity={0.9} onPress={() => setViewUri(c.image_url)} onLongPress={() => setMenuFor(c)}>
              <Image source={{ uri: c.image_url }} style={[styles.commentImage, { backgroundColor: colors.border }]} resizeMode="cover" />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
        {!!c.sticker_url && (
          <TouchableOpacity activeOpacity={0.9} onPress={() => setMenuFor(c)} onLongPress={() => setMenuFor(c)} style={{ marginTop: 4, alignSelf: 'flex-start' }}>
            <StickerMedia url={c.sticker_url} size={110} />
          </TouchableOpacity>
        )}
        <View style={styles.meta}>
          <Text style={{ color: colors.faint, fontSize: 12 }}>{postTime(c.created_at)}</Text>
          <TouchableOpacity onPress={() => startReply(c)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ color: colors.subtext, fontSize: 12, fontWeight: '700' }}>Reply</Text>
          </TouchableOpacity>
          {!!reelId && !!me && (
            <TouchableOpacity onPress={() => replyWithReel(c)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Reply with reel</Text>
            </TouchableOpacity>
          )}
        </View>
        {(reelReplies[String(c.id)] || []).map((rr: any) => (
          <TouchableOpacity
            key={rr.id}
            onPress={() => {
              onClose();
              setTimeout(() => {
                requestOpenReel(String(rr.id));
                router.push('/(tabs)/reels');
              }, 250);
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, alignSelf: 'flex-start', padding: 6, paddingRight: 12, borderRadius: 12, backgroundColor: colors.border }}
          >
            {rr.thumbnail_url ? (
              <Image source={{ uri: rr.thumbnail_url }} style={{ width: 34, height: 46, borderRadius: 6 }} />
            ) : (
              <View style={{ width: 34, height: 46, borderRadius: 6, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="play" size={16} color="#fff" />
              </View>
            )}
            <View>
              <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>Reel reply</Text>
              <Text style={{ color: colors.subtext, fontSize: 12 }}>by @{rr.author?.username || rr.author?.display_name || 'someone'}</Text>
            </View>
          </TouchableOpacity>
        ))}
        {!isReply && (repliesOf[c.id]?.length || 0) > 0 && (
          <TouchableOpacity
            onPress={() =>
              setExpanded((prev) => {
                const n = new Set(prev);
                if (n.has(c.id)) n.delete(c.id);
                else n.add(c.id);
                return n;
              })
            }
            style={{ marginTop: 6 }}
          >
            <Text style={{ color: colors.subtext, fontSize: 12, fontWeight: '700' }}>
              {expanded.has(c.id) ? 'Hide replies' : `View ${repliesOf[c.id].length} ${repliesOf[c.id].length === 1 ? 'reply' : 'replies'}`}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <TouchableOpacity onPress={() => setMenuFor(c)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="ellipsis-horizontal" size={16} color={colors.faint} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => toggleLike(c)} style={{ alignItems: 'center' }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Ionicons name={c.liked_by_me ? 'heart' : 'heart-outline'} size={18} color={c.liked_by_me ? '#EF4444' : colors.faint} />
          {c.likes_count > 0 && <Text style={{ color: colors.subtext, fontSize: 11 }}>{c.likes_count}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );

  const canSend = !!text.trim() || !!commentImage || !!pendingSticker;
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropTap} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
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
              data={topLevel}
              keyExtractor={(item) => item.id}
              style={styles.list}
              contentContainerStyle={{ paddingBottom: barH + 16 }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={[styles.empty, { color: colors.subtext }]}>No comments yet. Say something!</Text>}
              renderItem={({ item }) => (
                <View>
                  {renderComment(item, false)}
                  {expanded.has(item.id) && (repliesOf[item.id] || []).map((r) => renderComment(r, true))}
                </View>
              )}
            />
          )}
        </View>

        {/* The typing bar: not part of the sheet. It stays at the bottom, and
            rides up on the keyboard by itself. */}
        <View
          ref={barRef}
          collapsable={false}
          onLayout={(e) => setBarH(e.nativeEvent.layout.height)}
          style={[styles.bar, { backgroundColor: colors.card, borderTopColor: colors.border, bottom: lift }]}
        >
          {replyingTo && (
            <View style={[styles.replyBar, { backgroundColor: colors.inputBg, borderTopColor: colors.border }]}>
              <Text style={{ color: colors.subtext, flex: 1 }} numberOfLines={1}>
                Replying to <Text style={{ fontWeight: '700', color: colors.text }}>{replyingTo.author?.display_name || 'comment'}</Text>
              </Text>
              <TouchableOpacity onPress={() => setReplyingTo(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={18} color={colors.subtext} />
              </TouchableOpacity>
            </View>
          )}
          {!!commentImage && (
            <View style={styles.imgPreviewRow}>
              <Image source={{ uri: commentImage }} style={styles.imgPreview} />
              <TouchableOpacity onPress={() => setCommentImage(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={22} color={colors.subtext} />
              </TouchableOpacity>
            </View>
          )}
          {!!pendingSticker && (
            <View style={styles.imgPreviewRow}>
              <StickerMedia url={pendingSticker} size={64} />
              <TouchableOpacity onPress={() => setPendingSticker(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={22} color={colors.subtext} />
              </TouchableOpacity>
            </View>
          )}
          <MentionSuggest text={text} onChange={setText} />
          <ActionTray
            open={plusOpen}
            onClose={() => setPlusOpen(false)}
            actions={[
              { key: 'media', icon: 'image-outline', label: 'Photo', onPress: async () => { const u = await pickCommentImage(); if (u) { setCommentImage(u); setPendingSticker(null); } } },
              { key: 'sticker', icon: 'happy-outline', label: 'Stickers', onPress: () => { Keyboard.dismiss(); setShowTray(true); } },
              { key: 'poll', icon: 'stats-chart-outline', label: 'Poll', onPress: () => { Keyboard.dismiss(); setPollOpen(true); } },
            ]}
          />
          <PollCreateSheet visible={pollOpen} onClose={() => setPollOpen(false)} onCreated={postPoll} />
          <View style={[styles.inputBar, { paddingBottom: 10 + (kbOpen || showTray ? 0 : insets.bottom) }]}>
            <PlusButton open={plusOpen} onPress={() => setPlusOpen((v) => !v)} size={26} />
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, color: colors.text }]}
              placeholder={commentImage || pendingSticker ? 'Add a caption...' : replyingTo ? 'Write a reply...' : 'Add a comment...'}
              placeholderTextColor={colors.faint}
              value={text}
              onChangeText={setText}
              onFocus={() => setShowTray(false)}
            />
            <TouchableOpacity onPress={send} disabled={sending || !canSend}>
              {sending ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="send" size={22} color={canSend ? colors.primary : colors.faint} />}
            </TouchableOpacity>
          </View>
          {showTray && !!me && (
            <StickerTray userId={me} onSelectEmoji={(e) => setText((t) => t + e)} onSelectSticker={(url) => {
                setPendingSticker(url);
                setCommentImage(null);
                setShowTray(false);
              }} onClose={() => setShowTray(false)} />
          )}
        </View>

        <ActionSheet
          visible={!!menuFor}
          onClose={() => setMenuFor(null)}
          options={
            menuFor
              ? [
                  ...(menuFor.sticker_url && me
                    ? [{ label: 'Save to my stickers', icon: 'add-circle-outline' as const, onPress: () => { saveStickerWithAlert(me, menuFor.sticker_url); } }]
                    : []),
                  ...(menuFor.author?.id === me
                    ? [{ label: 'Delete comment', icon: 'trash-outline' as const, destructive: true, onPress: () => deleteComment(menuFor) }]
                    : [{ label: 'Report comment', icon: 'flag-outline' as const, onPress: () => setReportFor(menuFor) }]),
                ]
              : []
          }
        />
        <ImageViewer uri={viewUri} onClose={() => setViewUri(null)} />
      <ReportModal visible={!!reportFor} onClose={() => setReportFor(null)} onSubmit={submitReport} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  backdropTap: { flex: 1 },
  sheet: { height: '70%', borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  bar: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1 },
  commentImage: { width: 190, height: 150, borderRadius: 10, marginTop: 6 },
  imgPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 8 },
  imgPreview: { width: 54, height: 54, borderRadius: 8 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(128,128,128,0.4)', marginTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 16, fontWeight: '800' },
  list: { flex: 1 },
  empty: { textAlign: 'center', marginTop: 40 },
  row: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 8 },
  name: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  content: { fontSize: 14, lineHeight: 20 },
  meta: { flexDirection: 'row', gap: 14, marginTop: 4, paddingLeft: 6 },
  replyBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1 },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12, borderTopWidth: 1 },
  input: { flex: 1, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 11, fontSize: 16, minHeight: 44, maxHeight: 120 },
});
