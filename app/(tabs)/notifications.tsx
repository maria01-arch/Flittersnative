import { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { spacing } from '@/lib/theme';
import { useTheme } from '@/lib/ThemeContext';
import Avatar from '@/components/Avatar';

const iconFor = (type: string, colors: any) => {
  if (type === 'like') return { name: 'heart', color: colors.like };
  if (type === 'repost') return { name: 'repeat', color: colors.repost };
  if (type === 'comment') return { name: 'chatbubble', color: colors.primary };
  if (type === 'follow') return { name: 'person-add', color: '#F59E0B' };
  return { name: 'notifications', color: colors.faint };
};

const labelFor = (n: any) => {
  const name = n.actor?.display_name || 'Someone';
  if (n.type === 'like') return `${name} liked your post`;
  if (n.type === 'repost') return `${name} reposted your post`;
  if (n.type === 'comment') return `${name} commented on your post`;
  if (n.type === 'follow') return `${name} followed you`;
  return `${name} interacted with your content`;
};

export default function NotificationsScreen() {
  const { session } = useAuth();
  const { colors, isDark } = useTheme();
  const [notifs, setNotifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!session?.user?.id) return;
    const { data } = await supabase
      .from('notifications')
      .select('*,actor:profiles!actor_id(id,display_name,username,avatar_url)')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setNotifs(data || []);
    setLoading(false);
    setRefreshing(false);
    supabase.from('notifications').update({ read: true }).eq('user_id', session.user.id).eq('read', false).then(() => {});
  };

  useEffect(() => {
    load();
  }, [session]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <Text style={[styles.topBarTitle, { color: colors.text }]}>Notifications</Text>
      </View>
      <FlatList
        data={notifs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        renderItem={({ item }) => {
          const icon = iconFor(item.type, colors);
          return (
            <TouchableOpacity
              style={[
                styles.row,
                { borderBottomColor: colors.border },
                !item.read && { backgroundColor: isDark ? 'rgba(139,124,246,0.14)' : '#F5F3FF' },
              ]}
              onPress={() => {
                if (['like', 'repost', 'comment'].includes(item.type) && item.post_id) {
                  router.push(`/post/${item.post_id}`);
                } else if (item.actor?.id) {
                  router.push(`/user/${item.actor.id}`);
                }
              }}
            >
              <View style={styles.iconWrap}>
                <Ionicons name={icon.name as any} size={19} color={icon.color} />
              </View>
              <Avatar uri={item.actor?.avatar_url} size={38} />
              <Text style={[styles.label, { color: colors.text }]}>{labelFor(item)}</Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text style={[styles.empty, { color: colors.subtext }]}>No notifications yet</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: { paddingTop: 56, paddingBottom: 14, paddingHorizontal: spacing.lg, borderBottomWidth: 1 },
  topBarTitle: { fontSize: 22, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, paddingHorizontal: spacing.lg, gap: 10, borderBottomWidth: 1 },
  iconWrap: { width: 26, alignItems: 'center' },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  label: { flex: 1, fontSize: 14 },
  empty: { textAlign: 'center', marginTop: 40 },
});
