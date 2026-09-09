import { useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, PanResponder, TouchableOpacity, Image } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';
import MessageActionSheet from './MessageActionSheet';
import { formatMessageTime } from '@/lib/formatTime';
import LinkifiedText from './LinkifiedText';

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
}) {
  const { colors } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);
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
          <View style={[styles.bubble, isMine ? { backgroundColor: colors.primary } : { backgroundColor: colors.bubbleTheirs }]}>
            {message.reply_to ? (
              <View style={[styles.replyQuote, { borderLeftColor: isMine ? 'rgba(255,255,255,0.6)' : colors.primary }]}>
                <Text style={[styles.replyQuoteText, { color: isMine ? 'rgba(255,255,255,0.85)' : colors.subtext }]} numberOfLines={1}>
                  {message.reply_to}
                </Text>
              </View>
            ) : null}
            <LinkifiedText
              text={message.content}
              style={isMine ? styles.myText : [styles.theirText, { color: colors.text }]}
              linkColor={isMine ? '#D6E4FF' : colors.primary}
            />
          </View>
          {showTimestamp && (
            <View style={[styles.metaRow, isMine ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]}>
              <Text style={[styles.timeText, { color: colors.faint }]}>{formatMessageTime(message.created_at)}</Text>
              {isMine && isRead !== undefined && (
                <Ionicons name={isRead ? 'checkmark-done' : 'checkmark'} size={13} color={isRead ? colors.primary : colors.faint} style={{ marginLeft: 3 }} />
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
      />
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
  replyQuote: { borderLeftWidth: 3, paddingLeft: 8, marginBottom: 5 },
  replyQuoteText: { fontSize: 12.5 },
  myText: { color: '#fff', fontSize: 15 },
  theirText: { fontSize: 15 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2, paddingHorizontal: 4 },
  timeText: { fontSize: 10.5 },
  reactionsRow: { flexDirection: 'row', gap: 4, marginTop: 3 },
  reactionPill: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 12, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { fontSize: 11, fontWeight: '600' },
});
