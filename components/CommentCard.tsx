import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { colors, spacing } from '@/lib/theme';
import LinkifiedText from './LinkifiedText';
import VerifiedBadge from './VerifiedBadge';

export default function CommentCard({
  comment,
  postId,
  onLike,
  onRepost,
  navigable = true,
}: {
  comment: any;
  postId: string;
  onLike?: (c: any) => void;
  onRepost?: (c: any) => void;
  navigable?: boolean;
}) {
  const open = () => {
    if (navigable) router.push({ pathname: '/comment/[id]', params: { id: comment.id, postId } });
  };

  return (
    <TouchableOpacity activeOpacity={navigable ? 0.7 : 1} onPress={open} style={styles.row}>
      <TouchableOpacity onPress={() => comment.author?.id && router.push(`/user/${comment.author.id}`)}>
        <Image
          source={{ uri: comment.author?.avatar_url || 'https://placehold.co/80x80/6C5CE7/fff?text=' + (comment.author?.display_name?.[0] || '?') }}
          style={styles.avatar}
        />
      </TouchableOpacity>
      <View style={styles.body}>
        <TouchableOpacity style={styles.header} onPress={() => comment.author?.id && router.push(`/user/${comment.author.id}`)}>
          <Text style={styles.displayName}>{comment.author?.display_name || 'Unknown'}</Text>
          <VerifiedBadge verified={comment.author?.verified} isAuthentic={comment.author?.is_authentic} size={12} />
          <Text style={styles.username}>@{comment.author?.username || 'unknown'}</Text>
        </TouchableOpacity>
        <LinkifiedText text={comment.content} style={styles.content} linkColor={colors.primary} />
        {comment.image_url ? <Image source={{ uri: comment.image_url }} style={styles.image} /> : null}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionItem} onPress={open}>
            <Ionicons name="chatbubble-outline" size={15} color={colors.faint} />
            <Text style={styles.actionText}>{comment.replies_count || 0}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionItem} onPress={() => onRepost && onRepost(comment)}>
            <Ionicons name="repeat" size={16} color={comment.reposted_by_me ? colors.repost : colors.faint} />
            <Text style={[styles.actionText, comment.reposted_by_me && { color: colors.repost }]}>{comment.reposts_count || 0}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionItem} onPress={() => onLike && onLike(comment)}>
            <Ionicons name={comment.liked_by_me ? 'heart' : 'heart-outline'} size={15} color={comment.liked_by_me ? colors.like : colors.faint} />
            <Text style={[styles.actionText, comment.liked_by_me && { color: colors.like }]}>{comment.likes_count || 0}</Text>
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
    borderBottomColor: colors.border,
    backgroundColor: '#fff',
  },
  avatar: { width: 38, height: 38, borderRadius: 19, marginRight: 10, backgroundColor: colors.border },
  body: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  displayName: { fontWeight: '700', fontSize: 14, color: colors.text },
  username: { color: colors.subtext, fontSize: 13 },
  content: { fontSize: 14, marginTop: 3, lineHeight: 19, color: colors.text },
  image: { width: '100%', height: 170, borderRadius: 10, marginTop: 8, backgroundColor: colors.border },
  actions: { flexDirection: 'row', marginTop: 10, gap: 22 },
  actionItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { color: colors.subtext, fontSize: 12, fontWeight: '500' },
});
