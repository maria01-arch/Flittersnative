import { useEffect, useState } from 'react';
import { View, Image, PixelRatio, StyleSheet, TouchableOpacity, Pressable, Modal, useWindowDimensions, Alert } from 'react-native';
import Text from '@/components/AppText';
import { useVideoPlayer, VideoView } from 'expo-video';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { spacing } from '@/lib/theme';
import { useTheme } from '@/lib/ThemeContext';
import { supabase } from '@/lib/supabase';
import LinkifiedText from './LinkifiedText';
import VerifiedBadge from './VerifiedBadge';
import Avatar from './Avatar';
import ActionSheet from './ActionSheet';
import ImageViewer from './ImageViewer';
import LinkPreviewCard from './LinkPreviewCard';
import { getFirstUrl } from '@/lib/linkPreview';
import { useVideoStatus } from '@/lib/useVideoStatus';
import { useVideoWatchdog } from '@/lib/useVideoWatchdog';
import VideoPlaceholder from './VideoPlaceholder';
import { useVideoThumb } from '@/lib/videoThumb';
import { optimizedUrl, markCdnBroken, isDeadMedia } from '@/lib/imageUrl';
import { postTime } from '@/lib/timeAgo';
import { ownerNames } from '@/lib/postActions';
import * as Network from 'expo-network';
import { usePreferences } from '@/lib/PreferencesContext';
import { useFeedMuted, setFeedMuted } from '@/lib/feedAudio';
import ReportModal from './ReportModal';
import QuotedPost from './QuotedPost';
import QuoteModal from './QuoteModal';
import ShareLinkSheet from './ShareLinkSheet';
import { playSound } from '@/lib/sounds';
import AnimatedHeart from './AnimatedHeart';
import { postLink } from '@/lib/flittersLinks';
import { isPostSaved, savePost, unsavePost, subscribeSaved } from '@/lib/savedPosts';

// Renders the post image at its real aspect ratio (capped at 400) instead
// of force-cropping every image into a fixed 200px box — matches the
// webapp's `maxHeight:400, objectFit:cover` behavior. A tap behaves like
// tapping the rest of the card (opens the post); a long-press opens the
// image fullscreen instead — the two are on the same element so they can
// never both fire for one gesture.
function PostImage({ uri, maxWidth, borderColor, onOpen, onOpenFullscreen, disableOpen }: { uri: string; maxWidth: number; borderColor: string; onOpen: () => void; onOpenFullscreen: () => void; disableOpen?: boolean }) {
  const [ratio, setRatio] = useState<number | null>(null);
  // The picture is measured AND shown from the same resized copy. Before,
  // Image.getSize downloaded the full-size original just to read its shape.
  const [useOriginal, setUseOriginal] = useState(false);
  const shownUri = useOriginal ? uri : optimizedUrl(uri, Math.ceil(maxWidth * PixelRatio.get())) || uri;

  useEffect(() => {
    let cancelled = false;
    if (isDeadMedia(uri)) {
      setRatio(1);
      return;
    }
    Image.getSize(
      shownUri,
      (w, h) => {
        if (!cancelled && w > 0 && h > 0) setRatio(h / w);
      },
      (err) => {
        if (shownUri !== uri && !useOriginal) {
          markCdnBroken();
          if (!cancelled) setUseOriginal(true);
          return;
        }
        console.error('[PostCard] Image.getSize failed for', uri, err);
        if (!cancelled) setRatio(1);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [shownUri]);

  const height = ratio ? Math.min(400, maxWidth * ratio) : 200;

  return (
    <Pressable onPress={disableOpen ? undefined : onOpen} onLongPress={onOpenFullscreen}>
      <Image
        source={{ uri: shownUri }}
        style={[styles.postImage, { width: maxWidth, height, backgroundColor: borderColor }]}
        resizeMode="cover"
        onError={(e) => {
          if (shownUri !== uri && !useOriginal) {
            markCdnBroken();
            setUseOriginal(true);
            return;
          }
          console.error('[PostCard] image failed to load:', uri, e.nativeEvent.error);
        }}
      />
    </Pressable>
  );
}

export function PostVideo({ uri, maxWidth, expanded, activeInFeed, onOpen }: { uri: string; maxWidth: number; expanded?: boolean; activeInFeed?: boolean; onOpen: () => void }) {
  // In the feed: muted, looping, no controls — a quiet autoplay preview,
  // same idea as Instagram/TikTok feed videos, not a full player embedded
  // in the row. Only once you've actually opened the post (disableOpen on
  // PostCard doubles as "this is the detail view" here) does it get real
  // controls and sound.
  //
  // Autoplay is further gated by `activeInFeed` — only the one post
  // currently in view actually plays; every other video post pauses.
  //
  // Pausing alone only stops *playback* — it doesn't stop the video from
  // having been downloaded. Every previous version of this gave every
  // rendered video post (not just the active one) a real source the
  // moment it mounted, which meant every video post sitting in the list's
  // render window — several screens' worth, by default — started
  // buffering its full video immediately, whether or not it was ever
  // going to be watched. That's the actual data-usage cost, and it's not
  // fixed by pausing. Only give the player a real source when it's
  // actually the active one (or the detail view, which is always
  // deliberately watched) — everything else gets no source at all, so
  // there is nothing for it to load until it's scrolled to.
  // Autoplay in the feed only when it's allowed: the Autoplay switch is on,
  // AND the phone is on Wi-Fi (or the person allowed mobile data). Otherwise
  // the video stays a still poster with a play button and costs nothing
  // until it is opened.
  const { autoplayVideos, autoplayOnCellular } = usePreferences();
  const net = Network.useNetworkState();
  const onWifi = net.type == null || net.type === Network.NetworkStateType.WIFI || net.type === Network.NetworkStateType.ETHERNET;
  const allowAutoplay = expanded || (autoplayVideos && (onWifi || autoplayOnCellular));
  const activeNow = !!activeInFeed && allowAutoplay;
  const shouldLoad = expanded || activeNow;
  const feedMuted = useFeedMuted();
  const player = useVideoPlayer(shouldLoad ? uri : null, (p) => {
    p.loop = !expanded;
    p.muted = !expanded;
    // A feed video only needs a few seconds ahead of the playhead. The
    // default buffers far further, so scrolling past a long video after two
    // seconds had already downloaded most of the file for nothing.
    if (!expanded) {
      try {
        (p as any).bufferOptions = { preferredForwardBufferDuration: 4, minBufferForPlayback: 1, maxBufferBytes: 6 * 1024 * 1024, prioritizeTimeOverSizeThreshold: true };
      } catch {}
    }
  });

  useEffect(() => {
    try {
      player.muted = expanded ? false : feedMuted;
    } catch {}
  }, [feedMuted, expanded, player]);

  useVideoWatchdog(player, !expanded && activeNow, shouldLoad ? uri : null);

  useEffect(() => {
    if (expanded) return; // detail view drives its own playback via native controls
    try {
      if (activeNow) player.play();
      else player.pause();
    } catch {}
  }, [activeNow, expanded, player]);

  // A real still frame from the video: shown as the thumbnail whenever the
  // video isn't playing, and its width/height gives the video's true shape
  // so the card fits the video instead of forcing every video into the
  // same tall box (which zoomed and cropped anything that wasn't that
  // exact shape). Very wide or very tall videos are clamped so one video
  // can't take over the whole screen — the rest is letterboxed.
  const thumb = useVideoThumb(uri);
  const status = useVideoStatus(player);
  const showPlaceholder = !shouldLoad || status !== 'readyToPlay';
  // The video's real shape: read from the player itself once it knows (most
  // exact), else from the still frame. The box takes exactly that shape, so
  // there are no black bars. Only extreme shapes are limited (very tall:
  // 5:4 in the feed, very wide: about 2:1) and those fill the box instead of
  // leaving bars.
  const [trackRatio, setTrackRatio] = useState<number | null>(null);
  useEffect(() => {
    const read = (t: any) => {
      const sz = t?.size;
      if (sz?.width > 0 && sz?.height > 0) setTrackRatio(sz.height / sz.width);
    };
    try {
      read((player as any).videoTrack);
    } catch {}
    let sub: any;
    try {
      sub = (player as any).addListener?.('videoTrackChange', (e: any) => read(e?.videoTrack));
    } catch {}
    return () => {
      try {
        sub?.remove?.();
      } catch {}
    };
  }, [player]);
  const rawRatio = trackRatio || (thumb && thumb.width > 0 ? thumb.height / thumb.width : 0);
  const maxRatio = expanded ? 1.8 : 1.25;
  const minRatio = 0.52;
  const ratio = rawRatio ? Math.min(maxRatio, Math.max(minRatio, rawRatio)) : 0.75;
  const clamped = !!rawRatio && (rawRatio > maxRatio || rawRatio < minRatio);

  const video = (
    <View style={[styles.postImage, { width: maxWidth, height: maxWidth * ratio, backgroundColor: '#000' }]}>
      {/* In the feed the video must never take the touch itself: on some phones the
          native video surface swallows taps, so tapping a playing video did nothing.
          It is made touch-transparent, and a plain see-through button sits on top. */}
      <VideoView player={player} style={StyleSheet.absoluteFill} nativeControls={!!expanded} pointerEvents={expanded ? 'auto' : 'none'} contentFit={clamped && !expanded ? 'cover' : 'contain'} />
      {showPlaceholder && <VideoPlaceholder posterUri={thumb?.uri} loading fit={clamped && !expanded ? 'cover' : 'contain'} />}
      {!expanded && !!onOpen && <Pressable style={StyleSheet.absoluteFill} onPress={onOpen} />}
      {!expanded && !showPlaceholder && (
        <TouchableOpacity
          style={styles.muteBtn}
          onPress={() => setFeedMuted(!feedMuted)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.8}
        >
          <Ionicons name={feedMuted ? 'volume-mute' : 'volume-high'} size={16} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
  if (expanded) return video;
  return <Pressable onPress={onOpen}>{video}</Pressable>;
}

export default function PostCard({
  post,
  currentUserId,
  disableOpen,
  // Off unless a screen says which ONE card is playing. It used to default
  // to true, so any screen that didn't pass it (the profile) started every
  // video at once.
  active = false,
  onLike,
  onRepost,
  onQuote,
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
  // Saves a quote repost (a repost with your own text). When a screen
  // doesn't pass this, the repost button just toggles a plain repost.
  onQuote?: (post: any, text: string) => Promise<void>;
  onDelete?: (post: any) => void;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const { colors } = useTheme();
  const [fullscreenImage, setFullscreenImage] = useState(false);
  const [deleteSheetOpen, setDeleteSheetOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [repostSheetOpen, setRepostSheetOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // Save for offline reading (bookmark under the post).
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!currentUserId || !post?.id || post.pending) return;
    let alive = true;
    const check = () => isPostSaved(currentUserId, String(post.id)).then((v) => alive && setSaved(v));
    check();
    const off = subscribeSaved(check);
    return () => {
      alive = false;
      off();
    };
  }, [currentUserId, post?.id]);
  const toggleSaved = async () => {
    if (!currentUserId || post.pending) return;
    const now = !saved;
    setSaved(now);
    try {
      if (now) await savePost(currentUserId, post);
      else await unsavePost(currentUserId, String(post.id));
    } catch {
      setSaved(!now);
      Alert.alert("Couldn't save", 'Please try again.');
    }
  };
  // Co-owners can take themselves off a post (the author can't be removed this way).
  const [leftCoown, setLeftCoown] = useState(false);
  const isCoowner = !leftCoown && !!currentUserId && (post.coowners || []).some((c: any) => c.user?.id === currentUserId);
  const leaveCoown = () => {
    Alert.alert('Remove yourself?', 'This post will no longer be shared with you, and it will disappear from your profile.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove me',
        style: 'destructive',
        onPress: async () => {
          const { data, error } = await supabase.from('post_coowners').delete().eq('post_id', post.id).eq('user_id', currentUserId).select('post_id');
          if (error || !data?.length) {
            Alert.alert("Couldn't remove you", error?.message || 'Please try again.');
            return;
          }
          setLeftCoown(true);
        },
      },
    ]);
  };
  const isQuote = !!post.isRepost && !!post.quoteContent;
  const openPost = () => {
    if (disableOpen) return;
    router.push(`/post/${post.id}`);
  };
  const openPostForComment = () => router.push({ pathname: '/post/[id]', params: { id: post.id, focusComment: '1' } });
  const isMine = post.author?.id === currentUserId;
  // Only shown when there's no image/video attached, matching the webapp —
  // an attached image already tells the visual story, a bare preview card
  // would just be clutter underneath it.
  const previewUrl = !post.image_url && !post.video_url && post.content ? getFirstUrl(post.content) : null;
  // Once the card is really showing, the raw link is hidden from the text (the card replaces it).
  const [previewOk, setPreviewOk] = useState(false);
  const shownContent = previewUrl && previewOk && post.content ? post.content.replace(previewUrl, '').replace(/[ \t]+\n/g, '\n').trim() : post.content;

  const doDelete = async () => {
    setDeleteSheetOpen(false);
    // .select() makes the database report which rows it actually removed. A
    // delete that matches nothing (or is blocked by a permission rule) comes
    // back as "success, 0 rows" — which used to look like it worked on this
    // phone while the post stayed on the server.
    const { data: removed, error } = await supabase.from('posts').delete().eq('id', post.id).eq('user_id', currentUserId).select('id');
    if (error) {
      console.error('[PostCard] delete failed:', error.message, error);
      Alert.alert("Couldn't delete", error.message);
      return;
    }
    if (!removed || removed.length === 0) {
      Alert.alert("Couldn't delete", 'The server did not remove this post. Please try again.');
      return;
    }
    // Things created ALONGSIDE the post, which would otherwise be left behind
    // (the webapp shows them as ordinary posts / reels): the rest of a
    // thread, and the Reels copy of a video post.
    if (post.thread_id) {
      await supabase.from('posts').delete().eq('thread_id', post.thread_id).eq('user_id', currentUserId);
    }
    if (post.video_url) {
      await supabase.from('reels').delete().eq('user_id', currentUserId).eq('video_url', post.video_url);
    }
    onDelete?.(post);
  };

  const submitReport = async (reason: string, details: string) => {
    if (!currentUserId) return;
    const { error } = await supabase.from('reports').insert({ reporter_id: currentUserId, reported_post_id: post.id, reported_user_id: post.author?.id || post.user_id || null, reason, details: details || null });
    if (error) throw error;
  };

  // row padding (spacing.lg each side) + avatar width + its marginRight —
  // inside a repost card there's also the card's own border+padding to
  // subtract.
  const imageMaxWidth = windowWidth - spacing.lg * 2 - 44 - 12 - (post.isRepost ? 28 : 0);

  const actionsRow = (
    <View style={styles.actions}>
      <TouchableOpacity style={styles.actionItem} onPress={openPostForComment}>
        <Ionicons name="chatbubble-outline" size={17} color={colors.faint} />
        <Text style={[styles.actionText, { color: colors.subtext }]}>{post.comments_count || 0}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.actionItem} onPress={() => (onQuote ? setRepostSheetOpen(true) : onRepost && onRepost(post))}>
        <Ionicons name="repeat" size={18} color={post.reposted_by_me ? colors.repost : colors.faint} />
        <Text style={[styles.actionText, { color: colors.subtext }, post.reposted_by_me && { color: colors.repost }]}>{post.reposts_count || 0}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.actionItem} onPress={() => { if (!post.liked_by_me) playSound('like'); onLike && onLike(post); }}>
        <AnimatedHeart liked={!!post.liked_by_me} size={17} color={colors.like} offColor={colors.faint} />
        <Text style={[styles.actionText, { color: colors.subtext }, post.liked_by_me && { color: colors.like }]}>{post.likes_count || 0}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.actionItem} onPress={() => setShareOpen(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="share-outline" size={18} color={colors.faint} />
      </TouchableOpacity>
      {!!currentUserId && (
        <TouchableOpacity style={styles.actionItem} onPress={toggleSaved} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={17} color={saved ? colors.primary : colors.faint} />
        </TouchableOpacity>
      )}
    </View>
  );

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
            <Text style={[styles.displayName, { color: colors.text }, post.isRepost && styles.displayNameSmall]}>{ownerNames(leftCoown ? { ...post, coowners: (post.coowners || []).filter((c: any) => c.user?.id !== currentUserId) } : post)}</Text>
            <VerifiedBadge verified={post.author?.verified} isAuthentic={post.author?.is_authentic} plan={post.author?.verified_plan} size={post.isRepost ? 12 : 13} />
          </TouchableOpacity>
          {isMine ? (
            <TouchableOpacity onPress={() => setDeleteSheetOpen(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="trash-outline" size={16} color={colors.faint} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => setReportOpen(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="flag-outline" size={16} color={colors.faint} />
            </TouchableOpacity>
          )}
        </View>
        {!post.isRepost && <Text style={[styles.username, { color: colors.subtext }]}>@{post.author?.username || 'unknown'} · {postTime(post.created_at)}</Text>}
          {!post.isRepost && isCoowner && (
            <TouchableOpacity onPress={leaveCoown} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700', marginTop: 2 }}>Remove me as co-owner</Text>
            </TouchableOpacity>
          )}
        <Pressable onPress={disableOpen ? undefined : openPost}>
          {!!shownContent && <LinkifiedText text={shownContent} style={[styles.content, { color: colors.text }]} linkColor={colors.primary} />}
          {post.video_url ? (
            <PostVideo uri={post.video_url} maxWidth={imageMaxWidth} expanded={disableOpen} activeInFeed={active} onOpen={openPost} />
          ) : post.image_url && !isDeadMedia(post.image_url) ? (
            <PostImage uri={post.image_url} maxWidth={imageMaxWidth} borderColor={colors.border} onOpen={openPost} onOpenFullscreen={() => setFullscreenImage(true)} disableOpen={disableOpen} />
          ) : null}
          {previewUrl && <LinkPreviewCard url={previewUrl} onResult={setPreviewOk} />}
        </Pressable>
        {actionsRow}
      </View>
    </View>
  );

  return (
    <View style={[styles.row, { borderBottomColor: colors.border, backgroundColor: colors.bg }]}>
      {isQuote ? (
        // The flex:1 wrapper matters: without it this block is sized by its
        // content inside the row, the text column gets zero width, and every
        // letter wraps onto its own line — the tall blank card in the report.
        <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row' }}>
          <TouchableOpacity style={{ marginRight: 12 }} onPress={() => post.reposter?.id && router.push(`/user/${post.reposter.id}`)}>
            <Avatar uri={post.reposter?.avatar_url} size={44} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={styles.headerRow}>
              <TouchableOpacity style={styles.header} onPress={() => post.reposter?.id && router.push(`/user/${post.reposter.id}`)}>
                <Text style={[styles.displayName, { color: colors.text }]}>{post.reposter?.display_name || 'Someone'}</Text>
                <VerifiedBadge verified={post.reposter?.verified} isAuthentic={post.reposter?.is_authentic} plan={post.reposter?.verified_plan} size={13} />
                <Ionicons name="repeat" size={14} color={colors.subtext} />
              </TouchableOpacity>
              {post.reposter?.id === currentUserId ? (
                <TouchableOpacity onPress={() => onRepost && onRepost(post)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="trash-outline" size={16} color={colors.faint} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => setReportOpen(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="flag-outline" size={16} color={colors.faint} />
                </TouchableOpacity>
              )}
            </View>
            <Text style={[styles.username, { color: colors.subtext }]}>@{post.reposter?.username || 'unknown'} · {postTime(post.sortTime)}</Text>
            <Pressable onPress={disableOpen ? undefined : openPost}>
              <LinkifiedText text={post.quoteContent} style={[styles.content, { color: colors.text }]} linkColor={colors.primary} />
            </Pressable>
            <QuotedPost post={post} onPress={disableOpen ? undefined : openPost} />
            {actionsRow}
          </View>
        </View>
        </View>
      ) : post.isRepost ? (
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
              <VerifiedBadge verified={post.reposter?.verified} isAuthentic={post.reposter?.is_authentic} plan={post.reposter?.verified_plan} size={11} />
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
        <ImageViewer uri={fullscreenImage ? post.image_url : null} onClose={() => setFullscreenImage(false)} />
      )}

      <ActionSheet
        visible={deleteSheetOpen}
        title="Delete post?"
        onClose={() => setDeleteSheetOpen(false)}
        options={[{ label: "Delete — this can't be undone", icon: 'trash-outline', destructive: true, onPress: doDelete }]}
      />
      <ActionSheet
        visible={repostSheetOpen}
        onClose={() => setRepostSheetOpen(false)}
        options={
          post.reposted_by_me
            ? [{ label: 'Undo repost', icon: 'repeat', destructive: true, onPress: () => onRepost && onRepost(post) }]
            : [
                { label: 'Repost', icon: 'repeat', onPress: () => onRepost && onRepost(post) },
                { label: 'Quote', icon: 'create-outline', onPress: () => setQuoteOpen(true) },
              ]
        }
      />
      <QuoteModal
        visible={quoteOpen}
        post={post}
        onClose={() => setQuoteOpen(false)}
        onSubmit={async (text) => {
          if (onQuote) await onQuote(post, text);
          setQuoteOpen(false);
        }}
      />
      <ShareLinkSheet visible={shareOpen} url={postLink(post.id)} title="Share post" userId={currentUserId} videoUrl={post.video_url} imageUrl={post.image_url} post={post} onClose={() => setShareOpen(false)} />
      <ReportModal visible={reportOpen} onClose={() => setReportOpen(false)} onSubmit={submitReport} />
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
  postImage: { borderRadius: 12, marginTop: 10, overflow: 'hidden' },
  dlBtn: { position: 'absolute', right: 10, top: 10, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  muteBtn: { position: 'absolute', right: 10, bottom: 10, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', marginTop: 10, gap: 28 },
  actionItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { fontSize: 13, fontWeight: '500' },
  repostHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, paddingLeft: 2 },
  repostLabel: { fontSize: 13, fontWeight: '600' },
  repostCard: { borderWidth: 1, borderRadius: 16, padding: 14 },
  fullscreenBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  fullscreenImage: { width: '100%', height: '100%' },
});
