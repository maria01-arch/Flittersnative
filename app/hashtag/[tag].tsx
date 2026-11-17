import { useEffect, useState } from 'react';
import { View, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import Text from '@/components/AppText';
import { useLocalSearchParams, router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import PostCard from '@/components/PostCard';
import { applyCounts, fetchMyFlags, coownersEmbed } from '@/lib/postActions';

// Posts that contain #tag, newest first. Likes work here; to repost, quote or
// comment, open the post.
export default function HashtagScreen() {
  const { tag } = useLocalSearchParams<{ tag: string }>();
  const { session } = useAuth();
  const { colors } = useTheme();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const t = String(tag || '');
      const { data } = await supabase
        .from('posts')
        .select('*,author:profiles(id,display_name,username,avatar_url,verified,is_authentic,verified_plan,who_can_repost,who_can_comment),likes(count),reposts(count),comments(count)' + coownersEmbed())
        .ilike('content', `%#${String(t).replace(/[%_\\,()"']/g, '')}%`)
        .or('thread_order.is.null,thread_order.eq.0')
        .order('created_at', { ascending: false })
        .limit(40);
      // The database match is loose (#travel also matches #travelling), so
      // keep only posts where the tag ends exactly there.
      const exact = new RegExp(`#${t}(?![A-Za-z0-9_])`, 'i');
      const rows = (data || []).filter((p: any) => exact.test(p.content || ''));
      const flags = await fetchMyFlags(rows.map((p: any) => p.id), session?.user?.id);
      setPosts(rows.map((p: any) => ({ ...p, feedKey: p.id, ...applyCounts(p, flags) })));
      setLoading(false);
    })();
  }, [tag]);

  const toggleLike = async (post: any) => {
    if (!session?.user?.id) return;
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, liked_by_me: !p.liked_by_me, likes_count: p.liked_by_me ? p.likes_count - 1 : p.likes_count + 1 } : p)));
    const { error } = post.liked_by_me
      ? await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', session.user.id)
      : await supabase.from('likes').insert({ post_id: post.id, user_id: session.user.id });
    if (error && !/duplicate/i.test(error.message)) {
      // Not saved: put the heart and the count back.
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, liked_by_me: post.liked_by_me, likes_count: post.likes_count } : p)));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>#{tag}</Text>
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingBottom: 60 }}
          renderItem={({ item }) => <PostCard post={item} currentUserId={session?.user?.id} onLike={toggleLike} />}
          ListEmptyComponent={<Text style={{ color: colors.subtext, textAlign: 'center', marginTop: 40 }}>No posts with #{tag} yet.</Text>}
        />
      )}
    </View>
  );
}
