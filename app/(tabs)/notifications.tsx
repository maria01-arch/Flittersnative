import { useEffect, useState } from 'react';
import { View, Text, FlatList, Image, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { colors, spacing } from '@/lib/theme';

const iconFor = (type: string) => {
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
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>Notifications</Text>
      </View>
      <FlatList
        data={notifs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        renderItem={({ item }) => {
          const icon = iconFor(item.type);
          return (
            <TouchableOpacity
              style={[styles.row, !item.read && styles.unread]}
              onPress={() => item.actor?.id && router.push(`/user/${item.actor.id}`)}
            >
              <View style={styles.iconWrap}>
                <Ionicons name={icon.name as any} size={19} color={icon.color} />
              </View>
              <Image
                source={{ uri: item.actor?.avatar_url || 'https://placehold.co/60x60/6C5CE7/fff?text=' + (item.actor?.display_name?.[0] || '?') }}
                style={styles.avatar}
              />
              <Text style={styles.label}>{labelFor(item)}</Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>No notifications yet</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  topBar: { paddingTop: 56, paddingBottom: 14, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  topBarTitle: { fontSize: 22, fontWeight: '800', color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, paddingHorizontal: spacing.lg, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  unread: { backgroundColor: '#F5F3FF' },
  iconWrap: { width: 26, alignItems: 'center' },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.border },
  label: { flex: 1, fontSize: 14, color: colors.text },
  empty: { textAlign: 'center', marginTop: 40, color: colors.subtext },
});
