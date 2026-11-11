import { useEffect, useState } from 'react';
import { View, Image, TextInput, TouchableOpacity, StyleSheet, Dimensions, Pressable, ActivityIndicator } from 'react-native';
import { requestOpenReel } from '@/lib/reelOpen';
import Text from '@/components/AppText';
import { useVideoPlayer, VideoView } from 'expo-video';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { usePreferences } from '@/lib/PreferencesContext';
import { useVideoStatus } from '@/lib/useVideoStatus';
import { useVideoWatchdog } from '@/lib/useVideoWatchdog';
import AnimatedHeart from './AnimatedHeart';
import { useAuth } from '@/lib/AuthContext';
import { saveVideoIfAllowed } from '@/lib/download';
import { supabase } from '@/lib/supabase';
import ReelCommentsSheet from './ReelCommentsSheet';
import Avatar from './Avatar';
import VerifiedBadge from './VerifiedBadge';
import FollowButton from './FollowButton';

const { height: SCREEN_H } = Dimensions.get('window');

export default function ReelItem({
  reel,
  active,
  shouldLoad,
  isMine,
  height,
  onLike,
  onRepost,
  onDelete,
  onCommentPosted,
}: {
  reel: any;
  active: boolean;
  // Distinct from `active` on purpose: `active` means "this is the one
  // playing right now", but by the time a reel becomes active, its video
  // hasn't even started downloading yet if that's also the moment it
  // starts loading — a swipe would show a blank screen for however long
  // that takes. `shouldLoad` covers a small neighborhood around the
  // active index (see reels.tsx) so the next swipe or two already has
  // something buffered, without going anywhere near "load everything the
  // list happens to have rendered", which is what was actually driving
  // data usage: every rendered reel — not just the visible one — was
  // downloading its full video regardless of whether anyone would ever
  // swipe to it.
  shouldLoad: boolean;
  isMine?: boolean;
  height?: number;
  onLike: (reel: any) => void;
  onRepost?: (reel: any) => void;
  onDelete?: (reel: any) => void;
  onCommentPosted?: (reel: any) => void;
}) {
  const { autoplayVideos } = usePreferences();
  const { session } = useAuth();
  const [userPaused, setUserPaused] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [quickComment, setQuickComment] = useState('');
  const [sendingQuick, setSendingQuick] = useState(false);
  const player = useVideoPlayer(shouldLoad ? reel.video_url : null, (p) => {
    p.loop = true;
    // Don't let the player pull a whole video ahead of time — see PostVideo.
    try {
      (p as any).bufferOptions = { preferredForwardBufferDuration: 6, minBufferForPlayback: 1, maxBufferBytes: 10 * 1024 * 1024, prioritizeTimeOverSizeThreshold: true };
    } catch {}
  });

  useEffect(() => {
    try {
      const shouldPlay = active && !userPaused && autoplayVideos;
      if (shouldPlay) player.play();
      else player.pause();
    } catch {}
  }, [active, userPaused, autoplayVideos, player]);

  useVideoWatchdog(player, active && !userPaused && autoplayVideos, shouldLoad ? reel.video_url : null);

  useEffect(() => {
    if (!active) setUserPaused(false);
  }, [active]);

  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch {}
    };
  }, [player]);

  const togglePlay = () => setUserPaused((p) => !p);

  // A quick-post box directly under the reel, so leaving a comment doesn't
  // require opening the full sheet first — the sheet (opened from the
  // comment icon) is still there for reading existing ones.
  const sendQuickComment = async () => {
    const content = quickComment.trim();
    if (!content || !session?.user?.id) return;
    setSendingQuick(true);
    // A video post's comments live on the post, so they show there too.
    const { error } = await supabase.from('comments').insert(reel.post_id ? { post_id: reel.post_id, user_id: session.user.id, content } : { reel_id: reel.id, user_id: session.user.id, content });
    setSendingQuick(false);
    if (error) {
      console.error('[ReelItem] quick comment failed:', error.message, error);
      return;
    }
    setQuickComment('');
    onCommentPosted?.(reel);
  };

  // Not loaded yet (outside the shouldLoad neighborhood) or loaded but no
  // frame decoded yet both read the same way to whoever's looking: reuse
  // the same play-icon overlay already used for "paused" rather than
  // adding a second, different-looking empty state.
  const videoStatus = useVideoStatus(player);
  const notReady = !shouldLoad || videoStatus !== 'readyToPlay';

  return (
    <View style={[styles.container, height ? { height } : null]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={togglePlay}>
        <VideoView player={player} style={styles.video} contentFit="contain" nativeControls={false} />
        {(userPaused || !autoplayVideos || notReady) && (
          // Paused, autoplay off, or just not loaded/ready yet — same overlay either way.
          <View style={styles.pausedOverlay}>
            <Ionicons name="play" size={56} color="rgba(255,255,255,0.9)" />
          </View>
        )}
      </Pressable>
      {!!reel.post_id && (
        <TouchableOpacity
          style={styles.viewPost}
          activeOpacity={0.8}
          onPress={() => router.push({ pathname: '/post/[id]', params: { id: reel.post_id, fromReels: '1' } })}
        >
          <Ionicons name="document-text-outline" size={14} color="#fff" />
          <Text style={styles.viewPostText}>View post</Text>
          <Ionicons name="chevron-forward" size={14} color="#fff" />
        </TouchableOpacity>
      )}
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.bottomInfo}>
          <TouchableOpacity style={styles.authorRow} onPress={() => reel.author?.id && router.push(`/user/${reel.author.id}`)}>
            <Avatar uri={reel.author?.avatar_url} size={32} />
            <Text style={styles.authorName}>{reel.author?.display_name}</Text>
            <VerifiedBadge verified={reel.author?.verified} isAuthentic={reel.author?.is_authentic} plan={reel.author?.verified_plan} size={13} />
            <FollowButton userId={reel.author?.id || reel.user_id} />
          </TouchableOpacity>
          {!!reel.reply_to_comment_id && (
            <TouchableOpacity
              disabled={!reel.reply_to_reel_id}
              onPress={() => reel.reply_to_reel_id && requestOpenReel(String(reel.reply_to_reel_id))}
              style={styles.replyChip}
            >
              <Ionicons name="return-down-forward" size={14} color="#fff" />
              <Text style={styles.replyChipText} numberOfLines={1}>
                Replying to {reel.reply_to_name ? '@' + reel.reply_to_name : 'a comment'}{reel.reply_to_text ? ': ' + reel.reply_to_text : ''}
              </Text>
            </TouchableOpacity>
          )}
          {!!reel.caption && <Text style={styles.caption} numberOfLines={2}>{reel.caption}</Text>}
        </View>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => onLike(reel)}>
            <AnimatedHeart liked={!!reel.liked_by_me} size={30} color="#F91880" offColor="#fff" />
            <Text style={styles.actionText}>{reel.likes_count || 0}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setCommentsOpen(true)}>
            <Ionicons name="chatbubble-outline" size={27} color="#fff" />
            <Text style={styles.actionText}>{reel.comments_count || 0}</Text>
          </TouchableOpacity>
          {!!reel.post_id && (
            <TouchableOpacity style={styles.actionBtn} onPress={() => onRepost && onRepost(reel)}>
              <Ionicons name="repeat" size={29} color={reel.reposted_by_me ? '#00BA7C' : '#fff'} />
              <Text style={styles.actionText}>{reel.reposts_count || 0}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.actionBtn} onPress={() => saveVideoIfAllowed(session?.user?.id, reel.video_url)}>
            <Ionicons name="download-outline" size={27} color="#fff" />
          </TouchableOpacity>
          {isMine && (
            <TouchableOpacity style={styles.actionBtn} onPress={() => onDelete && onDelete(reel)}>
              <Ionicons name="trash-outline" size={28} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>
      <View style={styles.quickCommentBar} pointerEvents="box-none">
        <TextInput
          style={styles.quickCommentInput}
          placeholder="Add a comment..."
          placeholderTextColor="rgba(255,255,255,0.6)"
          value={quickComment}
          onChangeText={setQuickComment}
          onFocus={() => setUserPaused(true)}
        />
        <TouchableOpacity onPress={sendQuickComment} disabled={sendingQuick || !quickComment.trim()}>
          {sendingQuick ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={20} color={quickComment.trim() ? '#fff' : 'rgba(255,255,255,0.5)'} />
          )}
        </TouchableOpacity>
      </View>
      <ReelCommentsSheet
        reelId={reel.id}
        postId={reel.post_id || null}
        notifyUserId={reel.user_id}
        visible={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        onCommentPosted={() => onCommentPosted?.(reel)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', height: SCREEN_H, backgroundColor: '#000' },
  video: { width: '100%', height: '100%' },
  viewPost: { position: 'absolute', top: 58, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  viewPostText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  pausedOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'flex-end', padding: 16, paddingBottom: 110 },
  bottomInfo: { flex: 1, paddingRight: 60 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: '#fff' },
  authorName: { color: '#fff', fontWeight: '700', fontSize: 15 },
  replyChip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', maxWidth: '92%', marginTop: 8, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.22)' },
  replyChipText: { color: '#fff', fontSize: 12, fontWeight: '600', flexShrink: 1 },
  caption: { color: '#fff', fontSize: 14, marginTop: 8, lineHeight: 19 },
  actions: { alignItems: 'center', gap: 22 },
  actionBtn: { alignItems: 'center', gap: 4 },
  actionText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  quickCommentBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 22,
    paddingLeft: 16,
    paddingRight: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  quickCommentInput: { flex: 1, color: '#fff', fontSize: 14, paddingVertical: 8 },
});
