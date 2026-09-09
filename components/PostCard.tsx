import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { colors, spacing } from '@/lib/theme';
import LinkifiedText from './LinkifiedText';
import VerifiedBadge from './VerifiedBadge';

export default function PostCard({ post, onLike, onRepost }: { post: any; onLike?: (post: any) => void; onRepost?: (post: any) => void }) {
  return (
    <View style={styles.row}>
      <TouchableOpacity onPress={() => post.author?.id && router.push(`/user/${post.author.id}`)}>
        <Image
          source={{ uri: post.author?.avatar_url || 'https://placehold.co/80x80/6C5CE7/fff?text=' + (post.author?.display_name?.[0] || '?') }}
          style={styles.avatar}
        />
      </TouchableOpacity>
      <View style={styles.body}>
        <TouchableOpacity style={styles.header} onPress={() => post.author?.id && router.push(`/user/${post.author.id}`)}>
          <Text style={styles.displayName}>{post.author?.display_name || 'Unknown'}</Text>
            <VerifiedBadge verified={post.author?.verified} isAuthentic={post.author?.is_authentic} size={13} />
          <Text style={styles.username}>@{post.author?.username || 'unknown'}</Text>
        </TouchableOpacity>
        {!!post.content && <LinkifiedText text={post.content} style={styles.content} linkColor={colors.primary} />}
        {post.image_url ? <Image source={{ uri: post.image_url }} style={styles.postImage} /> : null}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionItem} onPress={() => router.push(`/post/${post.id}`)}>
            <Ionicons name="chatbubble-outline" size={17} color={colors.faint} />
            <Text style={styles.actionText}>{post.comments_count || 0}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionItem} onPress={() => onRepost && onRepost(post)}>
            <Ionicons name="repeat" size={18} color={post.reposted_by_me ? colors.repost : colors.faint} />
            <Text style={[styles.actionText, post.reposted_by_me && { color: colors.repost }]}>{post.reposts_count || 0}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionItem} onPress={() => onLike && onLike(post)}>
            <Ionicons name={post.liked_by_me ? 'heart' : 'heart-outline'} size={17} color={post.liked_by_me ? colors.like : colors.faint} />
            <Text style={[styles.actionText, post.liked_by_me && { color: colors.like }]}>{post.likes_count || 0}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
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
  avatar: { width: 44, height: 44, borderRadius: 22, marginRight: 12, backgroundColor: colors.border },
  body: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  displayName: { fontWeight: '700', fontSize: 15, color: colors.text },
  username: { color: colors.subtext, fontSize: 14 },
  content: { fontSize: 15, marginTop: 4, lineHeight: 21, color: colors.text },
  postImage: { width: '100%', height: 200, borderRadius: 12, marginTop: 10, backgroundColor: colors.border },
  actions: { flexDirection: 'row', marginTop: 10, gap: 28 },
  actionItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { color: colors.subtext, fontSize: 13, fontWeight: '500' },
});
