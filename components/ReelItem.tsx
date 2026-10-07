import { useEffect, useState } from 'react';
import { View, Text, Image, TextInput, TouchableOpacity, StyleSheet, Dimensions, Pressable, ActivityIndicator } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { usePreferences } from '@/lib/PreferencesContext';
import { useVideoStatus } from '@/lib/useVideoStatus';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import ReelCommentsSheet from './ReelCommentsSheet';
import Avatar from './Avatar';
import VerifiedBadge from './VerifiedBadge';

const { height: SCREEN_H } = Dimensions.get('window');

export default function ReelItem({
  reel,
  active,
  shouldLoad,
  isMine,
  height,
  onLike,
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
  });

  useEffect(() => {
    try {
      const shouldPlay = active && !userPaused && autoplayVideos;
      if (shouldPlay) player.play();
      else player.pause();
    } catch {}
  }, [active, userPaused, autoplayVideos, player]);

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
    const { error } = await supabase.from('comments').insert({ reel_id: reel.id, user_id: session.user.id, content });
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
        <VideoView player={player} style={styles.video} contentFit="cover" nativeControls={false} />
        {(userPaused || !autoplayVideos || notReady) && (
          // Paused, autoplay off, or just not loaded/ready yet — same overlay either way.
          <View style={styles.pausedOverlay}>
            <Ionicons name="play" size={56} color="rgba(255,255,255,0.9)" />
          </View>
        )}
      </Pressable>
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.bottomInfo}>
          <TouchableOpacity style={styles.authorRow} onPress={() => reel.author?.id && router.push(`/user/${reel.author.id}`)}>
            <Avatar uri={reel.author?.avatar_url} size={32} />
            <Text style={styles.authorName}>{reel.author?.display_name}</Text>
            <VerifiedBadge verified={reel.author?.verified} isAuthentic={reel.author?.is_authentic} size={13} />
          </TouchableOpacity>
          {!!reel.caption && <Text style={styles.caption} numberOfLines={2}>{reel.caption}</Text>}
        </View>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => onLike(reel)}>
            <Ionicons name={reel.liked_by_me ? 'heart' : 'heart-outline'} size={30} color={reel.liked_by_me ? '#F91880' : '#fff'} />
            <Text style={styles.actionText}>{reel.likes_count || 0}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setCommentsOpen(true)}>
            <Ionicons name="chatbubble-outline" size={27} color="#fff" />
            <Text style={styles.actionText}>{reel.comments_count || 0}</Text>
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
  pausedOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'flex-end', padding: 16, paddingBottom: 110 },
  bottomInfo: { flex: 1, paddingRight: 60 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: '#fff' },
  authorName: { color: '#fff', fontWeight: '700', fontSize: 15 },
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
