import { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import PostCard from '@/components/PostCard';
import VerifiedBadge from '@/components/VerifiedBadge';
import { colors, spacing } from '@/lib/theme';

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams();
  const { session } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [{ data: profileData }, { data: postsData }, { data: followData }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', id).single(),
        supabase.from('posts').select('*,author:profiles(*),likes(user_id),reposts(user_id),comments(id)').eq('user_id', id).order('created_at', { ascending: false }),
        session?.user?.id
          ? supabase.from('follows').select('id').eq('follower_id', session.user.id).eq('following_id', id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (session?.user?.id) {
        const { data: blockData } = await supabase.from('blocks').select('id').eq('blocker_id', session.user.id).eq('blocked_id', id).maybeSingle();
        setIsBlocked(!!blockData);
      }
      setProfile(profileData);
      setPosts(
        (postsData || []).map((p: any) => ({
          ...p,
          likes_count: p.likes?.length || 0,
          reposts_count: p.reposts?.length || 0,
          comments_count: p.comments?.length || 0,
          liked_by_me: p.likes?.some((l: any) => l.user_id === session?.user?.id) || false,
          reposted_by_me: p.reposts?.some((r: any) => r.user_id === session?.user?.id) || false,
        }))
      );
      setIsFollowing(!!followData);
      setLoading(false);
    })();
  }, [id, session]);

  const toggleLike = async (post: any) => {
    if (!session?.user?.id) return;
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? { ...p, liked_by_me: !p.liked_by_me, likes_count: p.liked_by_me ? p.likes_count - 1 : p.likes_count + 1 }
          : p
      )
    );
    if (post.liked_by_me) {
      await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', session.user.id);
    } else {
      await supabase.from('likes').insert({ post_id: post.id, user_id: session.user.id });
    }
  };

  const toggleRepost = async (post: any) => {
    if (!session?.user?.id) return;
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? { ...p, reposted_by_me: !p.reposted_by_me, reposts_count: p.reposted_by_me ? p.reposts_count - 1 : p.reposts_count + 1 }
          : p
      )
    );
    if (post.reposted_by_me) {
      await supabase.from('reposts').delete().eq('post_id', post.id).eq('user_id', session.user.id);
    } else {
      await supabase.from('reposts').insert({ post_id: post.id, user_id: session.user.id });
    }
  };

  const toggleFollow = async () => {
    if (!session?.user?.id) return;
    setIsFollowing(!isFollowing);
    if (isFollowing) {
      await supabase.from('follows').delete().eq('follower_id', session.user.id).eq('following_id', id);
    } else {
      await supabase.from('follows').insert({ follower_id: session.user.id, following_id: id });
      await supabase.from('notifications').insert({ user_id: id, actor_id: session.user.id, type: 'follow' });
    }
  };

  const toggleBlock = async () => {
    if (!session?.user?.id) return;
    if (isBlocked) {
      await supabase.from('blocks').delete().eq('blocker_id', session.user.id).eq('blocked_id', id);
      setIsBlocked(false);
    } else {
      await supabase.from('blocks').insert({ blocker_id: session.user.id, blocked_id: id });
      await supabase.from('follows').delete().eq('follower_id', session.user.id).eq('following_id', id);
      await supabase.from('follows').delete().eq('follower_id', id).eq('following_id', session.user.id);
      setIsBlocked(true);
      setIsFollowing(false);
    }
  };

  const startConversation = async () => {
    if (!session?.user?.id) return;
    const { data: myConvs } = await supabase.from('conversation_participants').select('conversation_id').eq('user_id', session.user.id);
    let convId: string | null = null;
    if (myConvs?.length) {
      const { data: shared } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', id)
        .in('conversation_id', myConvs.map((c: any) => c.conversation_id));
      if (shared?.length) convId = shared[0].conversation_id;
    }
    if (!convId) {
      const { data: conv } = await supabase.from('conversations').insert({}).select().single();
      await supabase.from('conversation_participants').insert([
        { conversation_id: conv.id, user_id: session.user.id },
        { conversation_id: conv.id, user_id: id },
      ]);
      convId = conv.id;
    }
    router.push({ pathname: '/conversation/[id]', params: { id: convId, name: profile?.display_name || 'Chat', otherId: id, otherAvatar: profile?.avatar_url || '' } });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const isMe = session?.user?.id === id;

  return (
    <FlatList
      data={posts}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ paddingBottom: 110 }}
      renderItem={({ item }) => <PostCard post={item} onLike={toggleLike} onRepost={toggleRepost} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Image
            source={{ uri: profile?.avatar_url || 'https://placehold.co/120x120/6C5CE7/fff?text=' + (profile?.display_name?.[0] || '?') }}
            style={styles.avatar}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.name}>{profile?.display_name || 'No name set'}</Text>
            <VerifiedBadge verified={profile?.verified} isAuthentic={profile?.is_authentic} size={16} />
          </View>
          <Text style={styles.username}>@{profile?.username || 'unknown'}</Text>
          {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
          <View style={styles.statsRow}>
            <Text style={styles.stat}><Text style={styles.statNum}>{profile?.followers_count || 0}</Text> Followers</Text>
            <Text style={styles.stat}><Text style={styles.statNum}>{profile?.following_count || 0}</Text> Following</Text>
          </View>
          {!isMe && (
            <View style={styles.buttonRow}>
              <TouchableOpacity style={[styles.followButton, isFollowing && styles.followingButton]} onPress={toggleFollow}>
                <Text style={[styles.followText, isFollowing && styles.followingText]}>{isFollowing ? 'Following' : 'Follow'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.messageButton} onPress={startConversation}>
                <Text style={styles.messageText}>Message</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      }
      ListEmptyComponent={<Text style={styles.empty}>No posts yet.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  header: { alignItems: 'center', paddingTop: 50, paddingBottom: spacing.lg, backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.border },
  backButton: { position: 'absolute', top: 50, left: 16, zIndex: 10 },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.border, marginTop: 30 },
  name: { fontSize: 20, fontWeight: '800', marginTop: 12, color: colors.text },
  username: { fontSize: 15, color: colors.subtext, marginTop: 2 },
  bio: { fontSize: 14, color: colors.text, marginTop: 10, textAlign: 'center', paddingHorizontal: 30 },
  statsRow: { flexDirection: 'row', gap: 24, marginTop: 16 },
  stat: { fontSize: 14, color: colors.subtext },
  statNum: { fontWeight: '700', color: colors.text },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  followButton: { backgroundColor: colors.primary, borderRadius: 20, paddingVertical: 10, paddingHorizontal: 28, justifyContent: 'center', alignItems: 'center' },
  followingButton: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border },
  followText: { color: '#fff', fontWeight: '700' },
  followingText: { color: colors.text, fontWeight: '700' },
  messageButton: { borderWidth: 1, borderColor: colors.primary, borderRadius: 20, paddingVertical: 10, paddingHorizontal: 24, justifyContent: 'center', alignItems: 'center' },
  messageText: { color: colors.primary, fontWeight: '700' },
  empty: { textAlign: 'center', marginTop: 30, color: colors.subtext },
});
