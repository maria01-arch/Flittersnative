import { useState } from 'react';
import { View, Image, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import Text from '@/components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { spacing } from '@/lib/theme';
import { useTheme } from '@/lib/ThemeContext';
import { supabase } from '@/lib/supabase';
import LinkifiedText from './LinkifiedText';
import StickerMedia from './StickerMedia';
import ActionSheet from './ActionSheet';
import { saveStickerWithAlert } from '@/lib/stickerActions';
import Avatar from './Avatar';
import ImageViewer from './ImageViewer';
import VerifiedBadge from './VerifiedBadge';
import LinkPreviewCard from './LinkPreviewCard';
import ShareLinkSheet from './ShareLinkSheet';
import { getFirstUrl } from '@/lib/linkPreview';
import { commentLink } from '@/lib/flittersLinks';
import PollCard from './PollCard';

export default function CommentCard({
  comment,
  postId,
  currentUserId,
  onLike,
  onRepost,
  onDelete,
  navigable = true,
}: {
  comment: any;
  postId: string;
  currentUserId?: string;
  onLike?: (c: any) => void;
  onRepost?: (c: any) => void;
  onDelete?: (c: any) => void;
  navigable?: boolean;
}) {
  const { colors } = useTheme();
  const open = () => {
    if (navigable) router.push({ pathname: '/comment/[id]', params: { id: comment.id, postId } });
  };
  const isMine = comment.author?.id === currentUserId;
  const [shareOpen, setShareOpen] = useState(false);
  const [stickerMenu, setStickerMenu] = useState(false);
  const [viewImage, setViewImage] = useState(false);
  const previewUrl = !comment.image_url && comment.content ? getFirstUrl(comment.content) : null;

  const confirmDelete = () => {
    Alert.alert('Delete comment?', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('comments').delete().eq('id', comment.id).eq('user_id', currentUserId);
          if (error) {
            console.error('[CommentCard] delete failed:', error.message, error);
            Alert.alert("Couldn't delete", error.message);
            return;
          }
          onDelete?.(comment);
        },
      },
    ]);
  };

  return (
    <TouchableOpacity activeOpacity={navigable ? 0.7 : 1} onPress={open} style={[styles.row, { borderBottomColor: colors.border, backgroundColor: colors.bg }]}>
      <TouchableOpacity style={{ marginRight: 10 }} onPress={() => comment.author?.id && router.push(`/user/${comment.author.id}`)}>
        <Avatar uri={comment.author?.avatar_url} size={38} />
      </TouchableOpacity>
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.header} onPress={() => comment.author?.id && router.push(`/user/${comment.author.id}`)}>
            <Text style={[styles.displayName, { color: colors.text }]}>{comment.author?.display_name || 'Unknown'}</Text>
            <VerifiedBadge verified={comment.author?.verified} isAuthentic={comment.author?.is_authentic} plan={comment.author?.verified_plan} size={12} />
            <Text style={[styles.username, { color: colors.subtext }]}>@{comment.author?.username || 'unknown'}</Text>
          </TouchableOpacity>
          {isMine && (
            <TouchableOpacity onPress={confirmDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="trash-outline" size={14} color={colors.faint} />
            </TouchableOpacity>
          )}
        </View>
        {comment.poll_id ? (
          <View style={{ marginTop: 8 }}>
            <PollCard pollId={String(comment.poll_id)} width={260} />
          </View>
        ) : !!comment.content && <LinkifiedText text={comment.content} style={[styles.content, { color: colors.text }]} linkColor={colors.primary} />}
        {comment.sticker_url ? (
          <TouchableOpacity activeOpacity={0.85} onPress={() => currentUserId && setStickerMenu(true)} onLongPress={() => currentUserId && setStickerMenu(true)} style={{ marginTop: 6, alignSelf: 'flex-start' }}>
            <StickerMedia url={comment.sticker_url} size={120} />
          </TouchableOpacity>
        ) : null}
        {comment.image_url ? (
          <TouchableOpacity activeOpacity={0.9} onPress={() => setViewImage(true)}>
            <Image source={{ uri: comment.image_url }} style={[styles.image, { backgroundColor: colors.border }]} resizeMode="cover" />
          </TouchableOpacity>
        ) : null}
        <ImageViewer uri={viewImage ? comment.image_url : null} onClose={() => setViewImage(false)} />
        {previewUrl ? <LinkPreviewCard url={previewUrl} /> : null}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionItem} onPress={open}>
            <Ionicons name="chatbubble-outline" size={15} color={colors.faint} />
            <Text style={[styles.actionText, { color: colors.subtext }]}>{comment.replies_count || 0}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionItem} onPress={() => onRepost && onRepost(comment)}>
            <Ionicons name="repeat" size={16} color={comment.reposted_by_me ? colors.repost : colors.faint} />
            <Text style={[styles.actionText, { color: colors.subtext }, comment.reposted_by_me && { color: colors.repost }]}>{comment.reposts_count || 0}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionItem} onPress={() => onLike && onLike(comment)}>
            <Ionicons name={comment.liked_by_me ? 'heart' : 'heart-outline'} size={15} color={comment.liked_by_me ? colors.like : colors.faint} />
            <Text style={[styles.actionText, { color: colors.subtext }, comment.liked_by_me && { color: colors.like }]}>{comment.likes_count || 0}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionItem} onPress={() => setShareOpen(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="share-outline" size={16} color={colors.faint} />
          </TouchableOpacity>
        </View>
        <ActionSheet
          visible={stickerMenu}
          onClose={() => setStickerMenu(false)}
          options={[{ label: 'Save to my stickers', icon: 'add-circle-outline', onPress: () => currentUserId && saveStickerWithAlert(currentUserId, comment.sticker_url) }]}
        />
        <ShareLinkSheet visible={shareOpen} url={commentLink(postId, comment.id)} title="Share comment" userId={currentUserId} onClose={() => setShareOpen(false)} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  body: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flexShrink: 1 },
  displayName: { fontWeight: '700', fontSize: 14 },
  username: { fontSize: 13 },
  content: { fontSize: 14, marginTop: 3, lineHeight: 19 },
  image: { width: '100%', height: 170, borderRadius: 10, marginTop: 8 },
  actions: { flexDirection: 'row', marginTop: 10, gap: 22 },
  actionItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontSize: 12, fontWeight: '500' },
});
