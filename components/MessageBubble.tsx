import { useEffect, useRef, useState } from 'react';
import { openFile, fileSizeText } from '@/lib/chatFiles';
import { View, StyleSheet, Animated, PanResponder, Image, Modal, Pressable, PixelRatio, useWindowDimensions, Keyboard } from 'react-native';
import TouchableOpacity from './PressScale';
import Text from '@/components/AppText';
import { optimizedUrl, markCdnBroken } from '@/lib/imageUrl';
import OptImage from './OptImage';
import Emoji from './Emoji';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';
import FullTextModal from './FullTextModal';
import ImageViewer from './ImageViewer';
import StickerPackCard from './StickerPackCard';
import MessageActionOverlay, { MenuAction, MenuRect } from './MessageActionOverlay';
import { isSingleEmoji } from '@/lib/emojiOnly';
import { STICKER_LABEL } from '@/lib/pins';
import { formatMessageTime } from '@/lib/formatTime';
import LinkifiedText from './LinkifiedText';
import LinkPreviewCard from './LinkPreviewCard';
import { getFirstUrl } from '@/lib/linkPreview';
import VoiceMessagePlayer from './VoiceMessagePlayer';
import StickerMedia from './StickerMedia';
import { router } from 'expo-router';
import { parseMomentReply } from '@/lib/momentReply';
import MessageVideoPlayer from './MessageVideoPlayer';
import { saveVideoIfAllowed } from '@/lib/download';
import PollCard from './PollCard';
import { LinearGradient } from 'expo-linear-gradient';
import { DEFAULT_BUBBLE_COLOR } from '@/lib/chatTheme';

// A picture in a chat bubble: edge to edge (no padding, no frame) and shaped
// like the picture itself instead of a fixed square. Very wide / very tall
// pictures are limited so one image can't fill the whole screen. It measures
// and shows the same resized copy (see lib/imageUrl.ts).
function BubbleImage({ uri, previewUri, onPress, onLongPress, radius, captioned, children }: { uri: string; previewUri?: string; onPress: () => void; onLongPress: () => void; radius: number; captioned?: boolean; children?: any }) {
  const { width: screenW } = useWindowDimensions();
  // A picture with a caption is as wide as a normal chat bubble (260) so the picture and the
  // caption read as one bubble; a picture alone keeps its own shape.
  const boxW = captioned ? Math.min(260, Math.round(screenW * 0.7)) - 6 : Math.min(240, Math.round(screenW * 0.62));
  const [useOriginal, setUseOriginal] = useState(false);
  const remote = useOriginal ? uri : optimizedUrl(uri, Math.ceil(boxW * PixelRatio.get())) || uri;
  // Until the uploaded picture is downloaded, keep showing the local one the
  // sender just picked, so there's no blank flash when the upload finishes.
  // readyFor remembers WHICH address has finished downloading. When the picture's address changes (the upload
  // finished and it now points at the uploaded copy), the local picture stays on screen until the new one is
  // downloaded, so nothing blinks.
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const remoteReady = !previewUri || readyFor === remote;
  useEffect(() => {
    if (!previewUri) return;
    let cancelled = false;
    Image.prefetch(remote).then(() => !cancelled && setReadyFor(remote)).catch(() => !cancelled && setReadyFor(remote));
    return () => {
      cancelled = true;
    };
  }, [remote, previewUri]);
  const shown = previewUri && !remoteReady ? previewUri : remote;
  const [ratio, setRatio] = useState(1);
  useEffect(() => {
    let cancelled = false;
    Image.getSize(
      shown,
      (w, h) => {
        if (!cancelled && w > 0) setRatio(Math.min(3, Math.max(0.3, h / w)));
      },
      () => {
        if (shown !== uri && !useOriginal) {
          markCdnBroken();
          if (!cancelled) setUseOriginal(true);
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [shown]);
  // Fit inside a box while keeping the picture's own shape: a 9:16 photo stays
  // tall and narrow, a square stays square, a wide one stays wide.
  // With a caption the width is fixed and a tall picture is simply cropped ("half cut"),
  // so the caption below always lines up with the picture.
  const MAX_H = captioned ? 300 : 340;
  let shownW = boxW;
  let shownH = boxW * ratio;
  if (shownH > MAX_H) {
    shownH = MAX_H;
    if (!captioned) shownW = MAX_H / ratio;
  }
  const r = captioned ? { borderTopLeftRadius: 14, borderTopRightRadius: 14, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 } : { borderRadius: radius };
  return (
    // The whole thing (picture + caption) is exactly as wide as the picture.
    <View style={{ width: shownW }}>
      <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={220}>
        <Image
          source={{ uri: shown }}
          style={[{ width: shownW, height: shownH, backgroundColor: 'rgba(0,0,0,0.08)' }, r]}
          resizeMode="cover"
          onError={() => {
            if (shown !== uri && !useOriginal) {
              markCdnBroken();
              setUseOriginal(true);
            }
          }}
        />
      </Pressable>
      {children}
    </View>
  );
}

export default function MessageBubble({
  message,
  isMine,
  currentUserId,
  senderAvatar,
  senderName,
  senderId,
  showSender,
  isPinned,
  isRead,
  showTimestamp = true,
  tightTop = false,
  onReply,
  onPressReply,
  onStickerPress,
  highlighted,
  myBubbleColor,
  myBubbleGradient,
  onCopy,
  onEdit,
  onDelete,
  onReact,
  onPin,
  onRetry,
  onReport,
  onShowReactors,
  onShowSeenBy,
  onForward,
  compactReactions = false,
  replySticker,
  replyThumb,
  replyHeader,
  viewOnceOpened,
  onOpenViewOnce,
}: {
  message: any;
  isMine: boolean;
  currentUserId?: string;
  senderAvatar?: string;
  senderName?: string;
  // Group chats: tapping the sender's picture or name opens their profile.
  senderId?: string;
  showSender?: boolean;
  isPinned?: boolean;
  isRead?: boolean;
  showTimestamp?: boolean;
  tightTop?: boolean;
  onReply: (m: any) => void;
  // Tapping the quoted text jumps to the original message.
  onPressReply?: () => void;
  onStickerPress?: (m: any) => void;
  highlighted?: boolean;
  // Chosen chat theme colour for MY bubbles (verified members only).
  myBubbleColor?: string;
  // Two or more colours: my bubbles are painted as a gradient.
  myBubbleGradient?: string[];
  onCopy: (m: any) => void;
  onEdit: (m: any) => void;
  onDelete: (m: any) => void;
  onReact: (m: any, emoji: string) => void;
  onPin: (m: any) => void;
  onRetry?: (m: any) => void;
  onReport?: (m: any) => void;
  // Group only: long-press a reaction to see who reacted / long-press a message to see who saw it.
  onShowReactors?: (m: any) => void;
  onShowSeenBy?: (m: any) => void;
  // Send this message (text / picture / video / sticker / voice) to other chats.
  onForward?: (m: any) => void;
  // Tighter space under the bubble (groups).
  compactReactions?: boolean;
  // Picture of the sticker this message replies to (shown small in the quote).
  replySticker?: string;
  // A small picture of the message being replied to (when it was a photo).
  replyThumb?: string;
  // Groups: "replied to you" / "replied to <name>" shown above a reply.
  replyHeader?: string;
  // "View once" pictures/videos: has this phone already opened it, and open it now.
  viewOnceOpened?: boolean;
  onOpenViewOnce?: (m: any) => void;
}) {
  const { colors } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [menuRect, setMenuRect] = useState<MenuRect | null>(null);
  const [fullscreenImage, setFullscreenImage] = useState(false);
  const [readFull, setReadFull] = useState(false);
  // Long messages show the first 15 lines, then "See more". The limit is
  // applied right away (no flash of the whole text); a hidden copy of the
  // text, laid out with no limit, counts the real number of lines, because
  // Android only reports the lines that are shown when a limit is set.
  const [textOpen, setTextOpen] = useState(false);
  const [textLines, setTextLines] = useState<number | null>(null);
  const TEXT_LINES = 15;
  useEffect(() => {
    setTextLines(null);
    setTextOpen(false);
  }, [message.content]);
  const textLongish = String(message.content || '').length > 150;
  // Clearly long text (lots of characters or line breaks) gets "See more" at
  // once; the hidden measurer only decides the in-between cases. Before, the
  // button could wait for that measurement and only appear after a long press.
  const rawText = String(message.content || '');
  const textSure = rawText.length > 520 || (rawText.match(/\n/g) || []).length >= TEXT_LINES;
  const textLong = textSure || (textLines !== null && textLines > TEXT_LINES);
  const textLimit = textLongish && !textOpen && (textLines === null || textLong) ? TEXT_LINES : undefined;
  const textBase = isMine ? styles.myText : [styles.theirText, { color: colors.text }];
  const textMeasurer =
    textLongish && textLines === null ? (
      <LinkifiedText
        text={message.content}
        style={[textBase, { position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 }] as any}
        linkColor="transparent"
        onTextLayout={(e: any) => setTextLines(e.nativeEvent.lines.length)}
      />
    ) : null;
  const translateX = useRef(new Animated.Value(0)).current;
  const bodyRef = useRef<View>(null);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => {
        if (g.dx > 0) translateX.setValue(Math.min(g.dx, 70));
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx > 50) onReply(message);
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  const reactions: any[] = message.reactions || [];
  const grouped: Record<string, number> = {};
  reactions.forEach((r) => {
    grouped[r.emoji] = (grouped[r.emoji] || 0) + 1;
  });
  const myReaction = reactions.find((r) => r.user_id === currentUserId)?.emoji;
  // At most 4 different emojis are drawn. Everything beyond that is added up in
  // one "+N" pill, so the row never grows wider than the bubble. Your own
  // reaction is always kept visible.
  const sortedReactions = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
  let shownReactions = sortedReactions.slice(0, 4);
  if (myReaction && !shownReactions.some(([e]) => e === myReaction) && grouped[myReaction]) {
    shownReactions = [...shownReactions.slice(0, 3), [myReaction, grouped[myReaction]]];
  }
  const hiddenReactionCount = sortedReactions.filter(([e]) => !shownReactions.some(([s]) => s === e)).reduce((sum, [, c]) => sum + c, 0);
  // Groups: all reactions live in ONE small bubble (up to 3 different emojis, then the total).
  let bubbleEmojis = sortedReactions.slice(0, 3).map(([e]) => e);
  if (myReaction && !bubbleEmojis.includes(myReaction)) bubbleEmojis = [...bubbleEmojis.slice(0, 2), myReaction];
  const isVoice = !!(message.is_voice && message.voice_url);
  const isSticker = !!(message.is_sticker && message.sticker_url);
  const isPack = !!message.shared_pack_id;
  const isViewOnce = !!(message.view_once && (message.image_url || message.video_url) && !isVoice && !isSticker);
  const isPoll = !!message.poll_id && !isVoice && !isSticker;
  const isFile = !!(message.file_url && !isVoice && !isSticker);
  const isVideo = !!(message.video_url && !isVoice && !isSticker && !isViewOnce);
  const isImage = !!(message.image_url && !isVoice && !isSticker && !isVideo && !isViewOnce);
  const isPending = !!message._pending;
  const isFailed = !!message._failed;
  // One emoji and nothing else: shown big, with no bubble.
  const isEmojiOnly = !isVoice && !isSticker && !isVideo && !isImage && !isViewOnce && !isPoll && !message.reply_to && isSingleEmoji(message.content);
  const momentRef = parseMomentReply(message.reply_to);
  const stickerQuote = !!replySticker && !/\.(webm|mp4|mov|m4v)($|\?)/i.test(replySticker);

  // Long press: measure where the message sits on the screen, then open the menu there.
  const openMenuNow = () => {
    const node: any = bodyRef.current;
    if (node?.measureInWindow) {
      node.measureInWindow((x: number, y: number, w: number, h: number) => {
        setMenuRect({ x, y, w, h });
        setSheetOpen(true);
      });
    } else {
      setMenuRect({ x: 12, y: 200, w: 240, h: 60 });
      setSheetOpen(true);
    }
  };
  // With the keyboard open, the chat moves when the keyboard closes (opening the
  // menu closes it), so the message was measured at the wrong place. Close the
  // keyboard first, wait for the chat to settle, then measure.
  const openMenu = () => {
    let kbVisible = false;
    try {
      kbVisible = !!Keyboard.isVisible?.();
    } catch {}
    if (!kbVisible) {
      openMenuNow();
      return;
    }
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      sub.remove();
      clearTimeout(fallback);
      setTimeout(openMenuNow, 140);
    };
    const sub = Keyboard.addListener('keyboardDidHide', go);
    const fallback = setTimeout(go, 600);
    Keyboard.dismiss();
  };
  const closeMenu = () => setSheetOpen(false);
  const doAfterClose = (fn: () => void) => () => {
    setSheetOpen(false);
    fn();
  };

  const linkUrl = !isSticker && !isVoice && !isVideo && !isImage && !isEmojiOnly && message.content ? getFirstUrl(String(message.content)) : null;
  const canEdit = isMine && !isVoice && !isSticker && !isPack && !isVideo && !isViewOnce && !isPoll && !isPending && !isFailed;
  const actions: MenuAction[] = [
    { key: 'reply', label: 'Reply', icon: 'arrow-undo-outline', onPress: doAfterClose(() => onReply(message)) },
    ...(message.content && String(message.content).trim() && !isVoice && !isSticker && !isPack
      ? [{ key: 'copy', label: 'Copy', icon: 'copy-outline', onPress: doAfterClose(() => onCopy(message)) }]
      : []),
    ...(rawText.trim().length > 150 && !isVoice && !isSticker && !isPack
      ? [{ key: 'readfull', label: 'Read in full', icon: 'reader-outline', onPress: doAfterClose(() => setTimeout(() => setReadFull(true), 250)) }]
      : []),
    ...(message.video_url && !isPending && !isFailed && !isViewOnce
      ? [{ key: 'savevideo', label: 'Save video', icon: 'download-outline', onPress: doAfterClose(() => saveVideoIfAllowed(currentUserId, message.video_url)) }]
      : []),
    ...(onForward && !isPending && !isFailed && !isViewOnce
      ? [{ key: 'forward', label: 'Forward', icon: 'arrow-redo-outline', onPress: doAfterClose(() => onForward(message)) }]
      : []),
    ...(!isPending && !isFailed
      ? [{ key: 'pin', label: isPinned ? 'Unpin' : 'Pin', icon: isPinned ? 'pin' : 'pin-outline', onPress: doAfterClose(() => onPin(message)) }]
      : []),
    ...(onShowSeenBy && isMine && !isPending && !isFailed
      ? [{ key: 'seen', label: 'Seen by', icon: 'eye-outline', onPress: doAfterClose(() => onShowSeenBy(message)) }]
      : []),
    ...(canEdit ? [{ key: 'edit', label: 'Edit', icon: 'create-outline', onPress: doAfterClose(() => onEdit(message)) }] : []),
    { key: 'delete', label: 'Delete', icon: 'trash-outline', danger: true, onPress: doAfterClose(() => onDelete(message)) },
    ...(!isMine && onReport ? [{ key: 'report', label: 'Report', icon: 'flag-outline', danger: true, onPress: doAfterClose(() => onReport(message)) }] : []),
  ];

  // The message itself (name, bubble, reactions, time). It is drawn twice: in the
  // chat, and again (preview = true, no touches) inside the long-press menu.
  const renderBody = (preview: boolean) => (
    <>
      {!isMine && showSender && senderName && !tightTop && (
        <TouchableOpacity disabled={preview || !senderId} onPress={() => senderId && router.push(`/user/${senderId}`)} style={{ alignSelf: 'flex-start' }}>
          <Text style={[styles.senderName, { color: colors.subtext }]}>{senderName}</Text>
        </TouchableOpacity>
      )}
      {isPinned && (
        <View style={[styles.pinRow, isMine ? { justifyContent: 'flex-end' } : { justifyContent: 'flex-start' }]}>
          <Ionicons name="pin" size={11} color={colors.faint} />
          <Text style={[styles.pinLabel, { color: colors.faint }]}>Pinned</Text>
        </View>
      )}
      {!!replyHeader && !momentRef && (
        <View style={[styles.pinRow, { maxWidth: 250 }, isMine ? { justifyContent: 'flex-end' } : { justifyContent: 'flex-start' }]}>
          <Ionicons name="arrow-undo" size={14} color={replyHeader === 'replied to you' ? colors.primary : colors.subtext} />
          <Text numberOfLines={1} ellipsizeMode="tail" style={{ flexShrink: 1, fontSize: 14, fontWeight: '700', color: replyHeader === 'replied to you' ? colors.primary : colors.subtext }}>{replyHeader}</Text>
        </View>
      )}
      {!!message.is_forwarded && (
        <View style={[styles.pinRow, isMine ? { justifyContent: 'flex-end' } : { justifyContent: 'flex-start' }]}>
          <Ionicons name="arrow-redo" size={11} color={colors.faint} />
          <Text style={[styles.pinLabel, { color: colors.faint, fontStyle: 'italic' }]}>Forwarded</Text>
        </View>
      )}
      <View
        style={[
          !isSticker && !isPack && styles.bubble,
          isPoll && { width: 260 },
          // A reply keeps a little room so a short message under a quote is not squeezed to nothing.
          !!message.reply_to && !isSticker && !isPack && { minWidth: 120 },
          !isSticker && !isPack && (isMine ? { backgroundColor: myBubbleColor || DEFAULT_BUBBLE_COLOR, ...(myBubbleGradient ? { overflow: 'hidden' as const } : {}) } : { backgroundColor: colors.bubbleTheirs }),
          isVoice && styles.voiceBubble,
          (isImage || isVideo) && styles.imageBubble,
          isVideo && !!message.content && { paddingHorizontal: 2, paddingVertical: 2, borderRadius: 17, overflow: 'hidden' },
          // A picture on its own has no bubble at all; with a caption it gets a
          // thin one (4px) around picture + text.
          isImage && !message.content && { backgroundColor: 'transparent' },
          isImage && !!message.content && { paddingHorizontal: 2, paddingVertical: 2, borderRadius: 17, overflow: 'hidden' },
          // A single emoji: big, no bubble.
          isEmojiOnly && { backgroundColor: 'transparent', paddingHorizontal: 2, paddingVertical: 0, alignSelf: isMine ? 'flex-end' : 'flex-start' },
        ]}
      >
        {isMine && !!myBubbleGradient && !isSticker && !isPack && !isEmojiOnly && !(isImage && !message.content) && (
          <LinearGradient colors={myBubbleGradient as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
        )}
        {message.reply_to ? (
          <TouchableOpacity
            activeOpacity={0.7}
            disabled={preview}
            onPress={momentRef ? () => router.push({ pathname: '/moment/[uid]', params: { uid: momentRef.ownerId, at: momentRef.momentId } }) : onPressReply}
            style={[
              styles.replyQuote,
              // Never wider than the message under it: the quote takes the bubble's width, it does not set it.
              { width: 0, minWidth: '100%' },
              { borderLeftColor: isMine && !isSticker ? 'rgba(255,255,255,0.6)' : colors.primary },
              (stickerQuote || isSticker || !!replyThumb) && { flexDirection: 'row', alignItems: 'center', gap: 6 },
              // A sticker has no bubble to hold the quote, so the quote gets its own small pill.
              // (as wide as the sticker itself, never stretched to the width of the name line above it)
              isSticker && { backgroundColor: colors.bubbleTheirs, borderRadius: 10, paddingVertical: 5, paddingRight: 8, marginBottom: 4, width: 132, minWidth: 0, alignSelf: isMine ? 'flex-end' : 'flex-start' },
            ]}
          >
            {stickerQuote ? <StickerMedia url={replySticker as string} size={40} /> : null}
            {replyThumb ? <Image source={{ uri: optimizedUrl(replyThumb, Math.ceil(36 * PixelRatio.get())) || replyThumb }} style={{ width: 34, height: 34, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.12)' }} resizeMode="cover" /> : null}
            <Text
              style={[styles.replyQuoteText, { flexShrink: 1, color: isMine && !isSticker ? 'rgba(255,255,255,0.85)' : colors.subtext }]}
              numberOfLines={3}
              ellipsizeMode="tail"
            >
              {momentRef ? (isMine ? 'You replied to a moment' : 'Replied to your moment') : message.reply_to}
            </Text>
          </TouchableOpacity>
        ) : null}
        {isPoll ? (
          <Pressable disabled={preview} onLongPress={openMenu} delayLongPress={220}>
            <PollCard pollId={String(message.poll_id)} onDark={isMine} width={232} />
          </Pressable>
        ) : isViewOnce ? (
          // Tap to look once. After that (or when I sent it) only a small note stays.
          <Pressable
            disabled={preview}
            onPress={() => !isMine && !viewOnceOpened && !isPending && onOpenViewOnce?.(message)}
            onLongPress={openMenu}
            delayLongPress={220}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2 }}
          >
            <View style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderStyle: viewOnceOpened ? 'dashed' : 'solid', borderColor: isMine ? '#fff' : colors.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={message.video_url ? 'videocam' : 'image'} size={15} color={isMine ? '#fff' : colors.primary} />
            </View>
            <View>
              <Text style={{ color: isMine ? '#fff' : colors.text, fontWeight: '700', fontSize: 14 }}>
                {isMine ? (message.video_url ? 'Video' : 'Photo') : viewOnceOpened ? 'Opened' : message.video_url ? 'Video' : 'Photo'}
              </Text>
              <Text style={{ color: isMine ? 'rgba(255,255,255,0.8)' : colors.subtext, fontSize: 12 }}>
                {isMine ? 'View once · sent' : viewOnceOpened ? 'View once · already seen' : 'Tap to view · once'}
              </Text>
            </View>
          </Pressable>
        ) : isPack ? (
          <Pressable disabled={preview} onLongPress={openMenu} delayLongPress={220}>
            <StickerPackCard packId={message.shared_pack_id} currentUserId={currentUserId} isMine={isMine} onLongPress={openMenu} />
          </Pressable>
        ) : isSticker ? (
          // Tap someone else's sticker to save it (or its whole pack).
          <Pressable disabled={preview} onPress={() => !isMine && onStickerPress?.(message)} onLongPress={openMenu} delayLongPress={220}>
            <StickerMedia url={message.sticker_url} size={132} />
          </Pressable>
        ) : isVoice ? (
          <VoiceMessagePlayer url={message.voice_url} duration={message.voice_duration} isMine={isMine} onLongPress={preview ? undefined : openMenu} />
        ) : isVideo ? (
          <>
            <MessageVideoPlayer url={message.video_url} captioned={!!message.content} />
            {!!message.content && (
              // The caption sits right under the video, exactly as wide as the video.
              <View style={{ width: 220, paddingHorizontal: 9, paddingTop: 7, paddingBottom: 3 }}>
                <View>
                  <LinkifiedText
                    text={message.content}
                    style={isMine ? styles.myText : [styles.theirText, { color: colors.text }]}
                    linkColor={isMine ? '#D6E4FF' : colors.primary}
                    numberOfLines={textLimit}
                  />
                  {textMeasurer}
                </View>
                {textLong && (
                  <Text onPress={() => setTextOpen((v) => !v)} style={{ color: isMine ? '#D6E4FF' : colors.primary, fontWeight: '700', marginTop: 4 }}>{textOpen ? 'See less' : 'See more'}</Text>
                )}
              </View>
            )}
          </>
        ) : isFile ? (
          <TouchableOpacity onPress={() => !preview && !isPending && openFile(message.file_url, message.file_name)} onLongPress={() => !preview && openMenu()} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 12, minWidth: 200 }}>
            <View style={{ width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: isMine ? 'rgba(255,255,255,0.22)' : colors.inputBg }}>
              <Ionicons name="document-text" size={22} color={isMine ? '#fff' : colors.primary} />
            </View>
            <View style={{ flexShrink: 1 }}>
              <Text numberOfLines={1} style={{ color: isMine ? '#fff' : colors.text, fontWeight: '700', fontSize: 14 }}>{message.file_name || 'File'}</Text>
              <Text style={{ color: isMine ? 'rgba(255,255,255,0.8)' : colors.subtext, fontSize: 12 }}>{fileSizeText(message.file_size)}{isPending ? ' · sending…' : ''}</Text>
            </View>
          </TouchableOpacity>
        ) : isImage ? (
          // A tap opens the image fullscreen — this used to sit inside a
          // TouchableOpacity that only had onLongPress wired up, so taps
          // did nothing at all. The long-press message menu still works
          // the same way, just moved onto this element directly.
          <BubbleImage uri={message.image_url} previewUri={message.localImage} radius={16} captioned={!!message.content} onPress={() => !preview && setFullscreenImage(true)} onLongPress={() => !preview && openMenu()}>
            {!!message.content && (
              // The caption sits right under the picture, no wider than it.
              <View style={{ paddingHorizontal: 9, paddingTop: 7, paddingBottom: 3 }}>
                <View>
                  <LinkifiedText
                    text={message.content}
                    style={isMine ? styles.myText : [styles.theirText, { color: colors.text }]}
                    linkColor={isMine ? '#D6E4FF' : colors.primary}
                    numberOfLines={textLimit}
                  />
                  {textMeasurer}
                </View>
                {textLong && (
                  <Text onPress={() => setTextOpen((v) => !v)} style={{ color: isMine ? '#D6E4FF' : colors.primary, fontWeight: '700', marginTop: 4 }}>{textOpen ? 'See less' : 'See more'}</Text>
                )}
              </View>
            )}
          </BubbleImage>
        ) : isEmojiOnly ? (
          <Emoji emoji={String(message.content).trim()} size={52} />
        ) : (
          <>
            <View>
              <LinkifiedText
                text={message.content}
                style={isMine ? styles.myText : [styles.theirText, { color: colors.text }]}
                linkColor={isMine ? '#D6E4FF' : colors.primary}
                numberOfLines={textLimit}
              />
              {textMeasurer}
            </View>
            {textLong && (
              <Text onPress={() => setTextOpen((v) => !v)} style={{ color: isMine ? '#D6E4FF' : colors.primary, fontWeight: '700', marginTop: 4 }}>{textOpen ? 'See less' : 'See more'}</Text>
            )}
            {!preview && !!linkUrl && (
              <View style={{ width: 232 }}>
                <LinkPreviewCard url={linkUrl} onDark={isMine} />
              </View>
            )}
          </>
        )}
      </View>
      {/* Reactions sit ON the bubble's bottom edge (WhatsApp-style), above the
          time and tick marks. Up to 4 emojis, then one "+N" for the rest. Press a
          pill to react the same; long-press (groups) to see who reacted. */}
      {compactReactions && reactions.length > 0 && (
        <View style={[styles.reactionsRow, styles.reactionsRowCompact, isMine ? { alignSelf: 'flex-end', marginRight: 10 } : { alignSelf: 'flex-start', marginLeft: 10 }]}>
          <TouchableOpacity
            disabled={preview}
            style={[styles.reactionPill, styles.reactionPillCompact, { backgroundColor: colors.card, borderColor: colors.border }, !!myReaction && { borderColor: colors.primary }]}
            onPress={() => onShowReactors?.(message)}
            onLongPress={() => onShowReactors?.(message)}
            delayLongPress={250}
          >
            <View style={{ flexDirection: 'row' }}>{bubbleEmojis.map((e) => <Emoji key={e} emoji={e} size={17} />)}</View>
            {reactions.length > 1 && <Text style={[styles.reactionCount, { color: colors.subtext }]}>{reactions.length}</Text>}
          </TouchableOpacity>
        </View>
      )}
      {!compactReactions && shownReactions.length > 0 && (
        <View
          style={[
            styles.reactionsRow,
            compactReactions && styles.reactionsRowCompact,
            isMine ? { alignSelf: 'flex-end', marginRight: 10 } : { alignSelf: 'flex-start', marginLeft: 10 },
          ]}
        >
          {shownReactions.map(([emoji, count]) => (
            <TouchableOpacity
              key={emoji}
              disabled={preview}
              style={[styles.reactionPill, compactReactions && styles.reactionPillCompact, { backgroundColor: colors.card, borderColor: colors.border }, myReaction === emoji && { borderColor: colors.primary }]}
              onPress={() => onReact(message, emoji)}
              onLongPress={onShowReactors ? () => onShowReactors(message) : undefined}
              delayLongPress={250}
            >
              <Emoji emoji={emoji} size={17} />
              {count > 1 && <Text style={[styles.reactionCount, { color: colors.subtext }]}>{count}</Text>}
            </TouchableOpacity>
          ))}
          {hiddenReactionCount > 0 && (
            <TouchableOpacity
              disabled={preview}
              style={[styles.reactionPill, compactReactions && styles.reactionPillCompact, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => onShowReactors?.(message)}
              onLongPress={onShowReactors ? () => onShowReactors(message) : undefined}
            >
              <Text style={[styles.reactionCount, { color: colors.subtext }]}>+{hiddenReactionCount}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      {showTimestamp && (
        <View style={[styles.metaRow, compactReactions && reactions.length > 0 && { marginTop: 0 }, isMine ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]}>
          {isFailed ? (
            <TouchableOpacity style={styles.retryRow} disabled={preview} onPress={() => onRetry?.(message)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Ionicons name="alert-circle" size={12} color={colors.danger} />
              <Text style={[styles.retryText, { color: colors.danger }]}>Not sent · Tap to retry</Text>
            </TouchableOpacity>
          ) : (
            <>
              <Text style={[styles.timeText, { color: colors.faint }]}>{message.edited_at ? 'edited · ' : ''}{formatMessageTime(message.created_at)}</Text>
              {isMine && isPending ? (
                <Ionicons name="time-outline" size={12} color={colors.faint} style={{ marginLeft: 3 }} />
              ) : (
                isMine &&
                isRead !== undefined && (
                  <Ionicons name={isRead ? 'checkmark-done' : 'checkmark'} size={13} color={isRead ? colors.primary : colors.faint} style={{ marginLeft: 3 }} />
                )
              )}
            </>
          )}
        </View>
      )}
    </>
  );

  return (
    <View style={[styles.row, isMine ? styles.myRow : styles.theirRow, tightTop && styles.rowTight, highlighted && { backgroundColor: 'rgba(250,204,21,0.28)' }]}>
      {!isMine && showSender && (
        <TouchableOpacity activeOpacity={0.8} disabled={tightTop || !senderId} onPress={() => senderId && router.push(`/user/${senderId}`)}>
          <Image source={{ uri: senderAvatar || 'https://placehold.co/60x60/1D8FEA/fff?text=?' }} style={[styles.avatar, tightTop && styles.avatarHidden]} />
        </TouchableOpacity>
      )}
      <Animated.View ref={bodyRef as any} collapsable={false} style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        <TouchableOpacity activeOpacity={0.85} onLongPress={openMenu} delayLongPress={220}>
          {renderBody(false)}
        </TouchableOpacity>
      </Animated.View>

      <MessageActionOverlay
        visible={sheetOpen}
        rect={menuRect}
        isMine={isMine}
        actions={actions}
        onClose={closeMenu}
        onReact={(emoji) => {
          setSheetOpen(false);
          onReact(message, emoji);
        }}
      >
        <View pointerEvents="none">{renderBody(true)}</View>
      </MessageActionOverlay>

      <FullTextModal visible={readFull} text={rawText} onClose={() => setReadFull(false)} />

      {isImage && (
        <ImageViewer uri={fullscreenImage ? message.image_url : null} onClose={() => setFullscreenImage(false)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', paddingHorizontal: 12, marginVertical: 4, alignItems: 'flex-end', gap: 8 },
  rowTight: { marginVertical: 1 },
  myRow: { justifyContent: 'flex-end' },
  theirRow: { justifyContent: 'flex-start' },
  avatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#ddd' },
  avatarHidden: { opacity: 0 },
  senderName: { fontSize: 11, marginBottom: 2, marginLeft: 4 },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 2 },
  pinLabel: { fontSize: 10, fontWeight: '600' },
  bubble: { maxWidth: 260, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  voiceBubble: { paddingVertical: 8, minWidth: 210 },
  imageBubble: { padding: 0, overflow: 'hidden' },
  messageImage: { width: 220, height: 220, backgroundColor: 'rgba(0,0,0,0.08)' },
  replyQuote: { borderLeftWidth: 3, paddingLeft: 8, marginBottom: 5 },
  replyQuoteText: { fontSize: 12.5 },
  myText: { color: '#fff', fontSize: 15 },
  theirText: { fontSize: 15 },
  bigEmoji: { fontSize: 34, lineHeight: 42 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2, paddingHorizontal: 4 },
  timeText: { fontSize: 10.5 },
  retryRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  retryText: { fontSize: 10.5, fontWeight: '600' },
  reactionsRow: { flexDirection: 'row', gap: 4, marginTop: -9, marginBottom: 3, zIndex: 2 },
  reactionsRowCompact: { gap: 3, marginTop: -8, marginBottom: 0 },
  reactionPill: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 12, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  reactionPillCompact: { paddingHorizontal: 5, paddingVertical: 1, gap: 2 },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { fontSize: 11, fontWeight: '600' },
  fullscreenBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  fullscreenImage: { width: '100%', height: '100%' },
});
