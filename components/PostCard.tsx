import { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Pressable, Modal, useWindowDimensions, Alert } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { spacing } from '@/lib/theme';
import { useTheme } from '@/lib/ThemeContext';
import { supabase } from '@/lib/supabase';
import LinkifiedText from './LinkifiedText';
import VerifiedBadge from './VerifiedBadge';
import Avatar from './Avatar';

// Renders the post image at its real aspect ratio (capped at 400) instead
// of force-cropping every image into a fixed 200px box — matches the
// webapp's `maxHeight:400, objectFit:cover` behavior. A tap behaves like
// tapping the rest of the card (opens the post); a long-press opens the
// image fullscreen instead — the two are on the same element so they can
// never both fire for one gesture.
function PostImage({ uri, maxWidth, borderColor, onOpen, onOpenFullscreen, disableOpen }: { uri: string; maxWidth: number; borderColor: string; onOpen: () => void; onOpenFullscreen: () => void; disableOpen?: boolean }) {
  const [ratio, setRatio] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    Image.getSize(
      uri,
      (w, h) => {
        if (!cancelled && w > 0 && h > 0) setRatio(h / w);
      },
      (err) => {
        console.error('[PostCard] Image.getSize failed for', uri, err);
        if (!cancelled) setRatio(1);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [uri]);

  const height = ratio ? Math.min(400, maxWidth * ratio) : 200;

  return (
    <Pressable onPress={disableOpen ? undefined : onOpen} onLongPress={onOpenFullscreen}>
      <Image
        source={{ uri }}
        style={[styles.postImage, { width: maxWidth, height, backgroundColor: borderColor }]}
        resizeMode="cover"
        onError={(e) => console.error('[PostCard] image failed to load:', uri, e.nativeEvent.error)}
      />
    </Pressable>
  );
}

function PostVideo({ uri, maxWidth, expanded, activeInFeed, onOpen }: { uri: string; maxWidth: number; expanded?: boolean; activeInFeed?: boolean; onOpen: () => void }) {
  // In the feed: muted, looping, no controls — a quiet autoplay preview,
  // same idea as Instagram/TikTok feed videos, not a full player embedded
  // in the row. Only once you've actually opened the post (disableOpen on
  // PostCard doubles as "this is the detail view" here) does it get real
  // controls and sound.
  //
  // Autoplay is further gated by `activeInFeed` — only the one post
  // currently in view actually plays; every other video post pauses.
  // Without this, scrolling past several video posts mounts that many
  // simultaneous decoders at once, which is exactly what froze the UI for
  // the reel-preview row earlier — same root cause, same fix here.
  const player = useVideoPlayer(uri, (p) => {
    p.loop = !expanded;
    p.muted = !expanded;
  });

  useEffect(() => {
    if (expanded) return; // detail view drives its own playback via native controls
    try {
      if (activeInFeed) player.play();
      else player.pause();
    } catch {}
  }, [activeInFeed, expanded, player]);

  const video = (
    <VideoView
      player={player}
      style={[styles.postImage, { width: maxWidth, height: maxWidth * 1.15 }]}
      nativeControls={!!expanded}
      contentFit="cover"
    />
  );
  if (expanded) return video;
  return <Pressable onPress={onOpen}>{video}</Pressable>;
}

export default function PostCard({
  post,
  currentUserId,
  disableOpen,
  active = true,
  onLike,
  onRepost,
  onDelete,
}: {
  post: any;
  currentUserId?: string;
  // Set true when the PostCard is already the focal point of the current
  // screen (post detail's own header) — without this, tapping the post
  // there would push *another* identical post/[id] onto the stack, so
  // repeated taps piled up duplicate screens you had to back out of one
  // at a time. Everything else (avatar, name, image long-press, actions)
  // still works; only "tap the body to open the post" is disabled.
  disableOpen?: boolean;
  // Whether this specific post is the one currently in view — controls
  // whether an attached video actually autoplays (see PostVideo above).
  // Defaults to true so screens that don't bother with viewability
  // tracking (post detail, a profile's small post list) still autoplay
  // normally; only screens with many video posts scrolling past need to
  // pass this explicitly.
  active?: boolean;
  onLike?: (post: any) => void;
  onRepost?: (post: any) => void;
  onDelete?: (post: any) => void;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const { colors } = useTheme();
  const [fullscreenImage, setFullscreenImage] = useState(false);
  const openPost = () => {
    if (disableOpen) return;
    router.push(`/post/${post.id}`);
  };
  const openPostForComment = () => router.push({ pathname: '/post/[id]', params: { id: post.id, focusComment: '1' } });
  const isMine = post.author?.id === currentUserId;

  const confirmDelete = () => {
    Alert.alert('Delete post?', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('posts').delete().eq('id', post.id).eq('user_id', currentUserId);
          if (error) {
            console.error('[PostCard] delete failed:', error.message, error);
            Alert.alert("Couldn't delete", error.message);
            return;
          }
          onDelete?.(post);
        },
      },
    ]);
  };

  // row padding (spacing.lg each side) + avatar width + its marginRight —
  // inside a repost card there's also the card's own border+padding to
  // subtract.
  const imageMaxWidth = windowWidth - spacing.lg * 2 - 44 - 12 - (post.isRepost ? 28 : 0);

  const cardInner = (
    <View style={{ flexDirection: 'row' }}>
      <TouchableOpacity
        style={{ marginRight: post.isRepost ? 8 : 12 }}
        onPress={() => post.author?.id && router.push(`/user/${post.author.id}`)}
      >
        <Avatar uri={post.author?.avatar_url} size={post.isRepost ? 34 : 44} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.header} onPress={() => post.author?.id && router.push(`/user/${post.author.id}`)}>
            <Text style={[styles.displayName, { color: colors.text }, post.isRepost && styles.displayNameSmall]}>{post.author?.display_name || 'Unknown'}</Text>
            <VerifiedBadge verified={post.author?.verified} isAuthentic={post.author?.is_authentic} size={post.isRepost ? 12 : 13} />
          </TouchableOpacity>
          {isMine && (
            <TouchableOpacity onPress={confirmDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="trash-outline" size={16} color={colors.faint} />
            </TouchableOpacity>
          )}
        </View>
        {!post.isRepost && <Text style={[styles.username, { color: colors.subtext }]}>@{post.author?.username || 'unknown'}</Text>}
        <Pressable onPress={disableOpen ? undefined : openPost}>
          {!!post.content && <LinkifiedText text={post.content} style={[styles.content, { color: colors.text }]} linkColor={colors.primary} />}
          {post.video_url ? (
            <PostVideo uri={post.video_url} maxWidth={imageMaxWidth} expanded={disableOpen} activeInFeed={active} onOpen={openPost} />
          ) : post.image_url ? (
            <PostImage uri={post.image_url} maxWidth={imageMaxWidth} borderColor={colors.border} onOpen={openPost} onOpenFullscreen={() => setFullscreenImage(true)} disableOpen={disableOpen} />
          ) : null}
        </Pressable>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionItem} onPress={openPostForComment}>
            <Ionicons name="chatbubble-outline" size={17} color={colors.faint} />
            <Text style={[styles.actionText, { color: colors.subtext }]}>{post.comments_count || 0}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionItem} onPress={() => onRepost && onRepost(post)}>
            <Ionicons name="repeat" size={18} color={post.reposted_by_me ? colors.repost : colors.faint} />
            <Text style={[styles.actionText, { color: colors.subtext }, post.reposted_by_me && { color: colors.repost }]}>{post.reposts_count || 0}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionItem} onPress={() => onLike && onLike(post)}>
            <Ionicons name={post.liked_by_me ? 'heart' : 'heart-outline'} size={17} color={post.liked_by_me ? colors.like : colors.faint} />
            <Text style={[styles.actionText, { color: colors.subtext }, post.liked_by_me && { color: colors.like }]}>{post.likes_count || 0}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.row, { borderBottomColor: colors.border, backgroundColor: colors.bg }]}>
      {post.isRepost ? (
        <View style={{ flex: 1 }}>
          {/* Reposter header sits outside the bordered card — matches the
              webapp: repost icon, reposter's name + badges, time, and (only
              for your own reposts) a way to undo it. */}
          <View style={styles.repostHeader}>
            <Ionicons name="repeat" size={15} color={colors.subtext} />
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 }}
              onPress={() => post.reposter?.id && router.push(`/user/${post.reposter.id}`)}
            >
              <Text style={[styles.repostLabel, { color: colors.subtext }]}>{post.reposter?.display_name || 'Someone'}</Text>
              <VerifiedBadge verified={post.reposter?.verified} isAuthentic={post.reposter?.is_authentic} size={11} />
            </TouchableOpacity>
            {post.reposter?.id === currentUserId && (
              <TouchableOpacity onPress={() => onRepost && onRepost(post)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="trash-outline" size={16} color={colors.faint} />
              </TouchableOpacity>
            )}
          </View>
          <View style={[styles.repostCard, { borderColor: colors.border }]}>{cardInner}</View>
        </View>
      ) : (
        <View style={{ flex: 1 }}>{cardInner}</View>
      )}

      {post.image_url && (
        <Modal visible={fullscreenImage} transparent animationType="fade" onRequestClose={() => setFullscreenImage(false)}>
          <Pressable style={styles.fullscreenBackdrop} onPress={() => setFullscreenImage(false)}>
            <Image source={{ uri: post.image_url }} style={styles.fullscreenImage} resizeMode="contain" />
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flexShrink: 1 },
  displayName: { fontWeight: '700', fontSize: 15 },
  displayNameSmall: { fontSize: 13.5 },
  username: { fontSize: 14, marginTop: 1 },
  content: { fontSize: 15, marginTop: 10, lineHeight: 21 },
  postImage: { borderRadius: 12, marginTop: 10 },
  actions: { flexDirection: 'row', marginTop: 10, gap: 28 },
  actionItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { fontSize: 13, fontWeight: '500' },
  repostHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, paddingLeft: 2 },
  repostLabel: { fontSize: 13, fontWeight: '600' },
  repostCard: { borderWidth: 1, borderRadius: 16, padding: 14 },
  fullscreenBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  fullscreenImage: { width: '100%', height: '100%' },
});
