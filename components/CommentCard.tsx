import { View, Text, Image, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { spacing } from '@/lib/theme';
import { useTheme } from '@/lib/ThemeContext';
import { supabase } from '@/lib/supabase';
import LinkifiedText from './LinkifiedText';
import Avatar from './Avatar';
import VerifiedBadge from './VerifiedBadge';

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
            <VerifiedBadge verified={comment.author?.verified} isAuthentic={comment.author?.is_authentic} size={12} />
            <Text style={[styles.username, { color: colors.subtext }]}>@{comment.author?.username || 'unknown'}</Text>
          </TouchableOpacity>
          {isMine && (
            <TouchableOpacity onPress={confirmDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="trash-outline" size={14} color={colors.faint} />
            </TouchableOpacity>
          )}
        </View>
        <LinkifiedText text={comment.content} style={[styles.content, { color: colors.text }]} linkColor={colors.primary} />
        {comment.image_url ? <Image source={{ uri: comment.image_url }} style={[styles.image, { backgroundColor: colors.border }]} /> : null}
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
        </View>
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
