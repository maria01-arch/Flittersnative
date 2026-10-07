import { useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, PanResponder, TouchableOpacity, Image, Modal, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';
import MessageActionSheet from './MessageActionSheet';
import { formatMessageTime } from '@/lib/formatTime';
import LinkifiedText from './LinkifiedText';
import VoiceMessagePlayer from './VoiceMessagePlayer';
import StickerMedia from './StickerMedia';
import MessageVideoPlayer from './MessageVideoPlayer';

export default function MessageBubble({
  message,
  isMine,
  currentUserId,
  senderAvatar,
  senderName,
  showSender,
  isPinned,
  isRead,
  showTimestamp = true,
  tightTop = false,
  onReply,
  onCopy,
  onEdit,
  onDelete,
  onReact,
  onPin,
  onRetry,
  onReport,
}: {
  message: any;
  isMine: boolean;
  currentUserId?: string;
  senderAvatar?: string;
  senderName?: string;
  showSender?: boolean;
  isPinned?: boolean;
  isRead?: boolean;
  showTimestamp?: boolean;
  tightTop?: boolean;
  onReply: (m: any) => void;
  onCopy: (m: any) => void;
  onEdit: (m: any) => void;
  onDelete: (m: any) => void;
  onReact: (m: any, emoji: string) => void;
  onPin: (m: any) => void;
  onRetry?: (m: any) => void;
  onReport?: (m: any) => void;
}) {
  const { colors } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState(false);
  const translateX = useRef(new Animated.Value(0)).current;

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
  const isVoice = !!(message.is_voice && message.voice_url);
  const isSticker = !!(message.is_sticker && message.sticker_url);
  const isVideo = !!(message.video_url && !isVoice && !isSticker);
  const isImage = !!(message.image_url && !isVoice && !isSticker && !isVideo);
  const isPending = !!message._pending;
  const isFailed = !!message._failed;

  return (
    <View style={[styles.row, isMine ? styles.myRow : styles.theirRow, tightTop && styles.rowTight]}>
      {!isMine && showSender && (
        <Image source={{ uri: senderAvatar || 'https://placehold.co/60x60/6C5CE7/fff?text=?' }} style={[styles.avatar, tightTop && styles.avatarHidden]} />
      )}
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        <TouchableOpacity activeOpacity={0.85} onLongPress={() => setSheetOpen(true)} delayLongPress={220}>
          {!isMine && showSender && senderName && !tightTop && <Text style={[styles.senderName, { color: colors.subtext }]}>{senderName}</Text>}
          {isPinned && (
            <View style={[styles.pinRow, isMine ? { justifyContent: 'flex-end' } : { justifyContent: 'flex-start' }]}>
              <Ionicons name="pin" size={11} color={colors.faint} />
              <Text style={[styles.pinLabel, { color: colors.faint }]}>Pinned</Text>
            </View>
          )}
          <View
            style={[
              !isSticker && styles.bubble,
              !isSticker && (isMine ? { backgroundColor: colors.primary } : { backgroundColor: colors.bubbleTheirs }),
              isVoice && styles.voiceBubble,
              (isImage || isVideo) && styles.imageBubble,
            ]}
          >
            {message.reply_to ? (
              <View style={[styles.replyQuote, { borderLeftColor: isMine ? 'rgba(255,255,255,0.6)' : colors.primary }]}>
                <Text style={[styles.replyQuoteText, { color: isMine ? 'rgba(255,255,255,0.85)' : colors.subtext }]} numberOfLines={1}>
                  {message.reply_to}
                </Text>
              </View>
            ) : null}
            {isSticker ? (
              <StickerMedia url={message.sticker_url} size={132} />
            ) : isVoice ? (
              <VoiceMessagePlayer url={message.voice_url} duration={message.voice_duration} isMine={isMine} />
            ) : isVideo ? (
              <MessageVideoPlayer url={message.video_url} />
            ) : isImage ? (
              // A tap opens the image fullscreen — this used to sit inside a
              // TouchableOpacity that only had onLongPress wired up, so taps
              // did nothing at all. The long-press message menu still works
              // the same way, just moved onto this element directly.
              <Pressable onPress={() => setFullscreenImage(true)} onLongPress={() => setSheetOpen(true)} delayLongPress={220}>
                <Image source={{ uri: message.image_url }} style={styles.messageImage} resizeMode="cover" />
              </Pressable>
            ) : (
              <LinkifiedText
                text={message.content}
                style={isMine ? styles.myText : [styles.theirText, { color: colors.text }]}
                linkColor={isMine ? '#D6E4FF' : colors.primary}
              />
            )}
          </View>
          {showTimestamp && (
            <View style={[styles.metaRow, isMine ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]}>
              {isFailed ? (
                <TouchableOpacity style={styles.retryRow} onPress={() => onRetry?.(message)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Ionicons name="alert-circle" size={12} color={colors.danger} />
                  <Text style={[styles.retryText, { color: colors.danger }]}>Not sent · Tap to retry</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <Text style={[styles.timeText, { color: colors.faint }]}>{formatMessageTime(message.created_at)}</Text>
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
          {Object.keys(grouped).length > 0 && (
            <View style={[styles.reactionsRow, isMine ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]}>
              {Object.entries(grouped).map(([emoji, count]) => (
                <TouchableOpacity
                  key={emoji}
                  style={[styles.reactionPill, { backgroundColor: colors.card, borderColor: colors.border }, myReaction === emoji && { borderColor: colors.primary }]}
                  onPress={() => onReact(message, emoji)}
                >
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                  {count > 1 && <Text style={[styles.reactionCount, { color: colors.subtext }]}>{count}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>

      <MessageActionSheet
        visible={sheetOpen}
        isMine={isMine}
        isPinned={!!isPinned}
        onClose={() => setSheetOpen(false)}
        onReply={() => {
          setSheetOpen(false);
          onReply(message);
        }}
        onCopy={() => {
          setSheetOpen(false);
          onCopy(message);
        }}
        onEdit={() => {
          setSheetOpen(false);
          onEdit(message);
        }}
        onDelete={() => {
          setSheetOpen(false);
          onDelete(message);
        }}
        onReact={(emoji) => {
          setSheetOpen(false);
          onReact(message, emoji);
        }}
        onPin={() => {
          setSheetOpen(false);
          onPin(message);
        }}
        onReport={
          onReport
            ? () => {
                setSheetOpen(false);
                onReport(message);
              }
            : undefined
        }
      />

      {isImage && (
        <Modal visible={fullscreenImage} transparent animationType="fade" onRequestClose={() => setFullscreenImage(false)}>
          <Pressable style={styles.fullscreenBackdrop} onPress={() => setFullscreenImage(false)}>
            <Image source={{ uri: message.image_url }} style={styles.fullscreenImage} resizeMode="contain" />
          </Pressable>
        </Modal>
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
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2, paddingHorizontal: 4 },
  timeText: { fontSize: 10.5 },
  retryRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  retryText: { fontSize: 10.5, fontWeight: '600' },
  reactionsRow: { flexDirection: 'row', gap: 4, marginTop: 3 },
  reactionPill: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 12, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { fontSize: 11, fontWeight: '600' },
  fullscreenBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  fullscreenImage: { width: '100%', height: '100%' },
});
