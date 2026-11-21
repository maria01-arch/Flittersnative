import { useEffect, useState } from 'react';
import { View, FlatList, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import Text from '@/components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useUnread } from '@/lib/UnreadContext';
import { useAuth } from '@/lib/AuthContext';
import { spacing } from '@/lib/theme';
import { useTheme } from '@/lib/ThemeContext';
import { ListSkeleton } from '@/components/Skeleton';
import Avatar from '@/components/Avatar';

const iconFor = (type: string, colors: any) => {
  if (type === 'like') return { name: 'heart', color: colors.like };
  if (type === 'repost') return { name: 'repeat', color: colors.repost };
  if (type === 'comment') return { name: 'chatbubble', color: colors.primary };
  if (type === 'follow') return { name: 'person-add', color: '#F59E0B' };
  if (type === 'mention') return { name: 'at', color: colors.primary };
  if (type === 'coown') return { name: 'people', color: colors.primary };
  if (type === 'gift') return { name: 'gift', color: '#F5B301' };
  if (type === 'login_alert') return { name: 'shield-checkmark', color: colors.primary };
  return { name: 'notifications', color: colors.faint };
};

const platformLabel = (p: string) => (p === 'ios' ? 'an iPhone' : p === 'android' ? 'an Android device' : 'a device');

const labelFor = (n: any) => {
  const name = n.actor?.display_name || 'Someone';
  if (n.type === 'like') return `${name} liked your post`;
  if (n.type === 'repost') return `${name} reposted your post`;
  if (n.type === 'comment') return `${name} commented on your post`;
  if (n.type === 'follow') return `${name} followed you`;
  if (n.type === 'mention') return `${name} mentioned you in a post`;
  if (n.type === 'coown') return `${name} added you as a co-owner of a post`;
  if (n.type === 'gift') return n.message || `${name} sent you a gift`;
  if (n.type === 'login_alert') return `New sign-in on ${platformLabel(n.meta_platform)}${n.meta_location ? ' near ' + n.meta_location : ''}`;
  return `${name} interacted with your content`;
};

export default function NotificationsScreen() {
  const { session } = useAuth();
  const { refreshNotifs } = useUnread();
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
    // Opening the tab marks everything read (the list above is already on
    // screen, so unread ones stay highlighted for this visit).
    supabase.from('notifications').update({ read: true }).eq('user_id', session.user.id).eq('read', false).then(() => refreshNotifs());
  };

  // The "Mark all as read" button is still here too, for pull-to-refresh
  // visits where new ones have arrived.
  const markAllRead = async () => {
    if (!session?.user?.id) return;
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase.from('notifications').update({ read: true }).eq('user_id', session.user.id).eq('read', false);
    refreshNotifs();
  };
  const markOneRead = async (item: any) => {
    if (item.read) return;
    setNotifs((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
    await supabase.from('notifications').update({ read: true }).eq('id', item.id);
    refreshNotifs();
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
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: 60 }}>
        <ListSkeleton />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <Text style={[styles.topBarTitle, { color: colors.text }]}>Notifications</Text>
        {notifs.some((n) => !n.read) && (
          <TouchableOpacity onPress={markAllRead} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>Mark all as read</Text>
          </TouchableOpacity>
        )}
      </View>
      <FlatList
        data={notifs}
        keyExtractor={(item) => item.id}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={9}
        contentContainerStyle={{ paddingBottom: 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        renderItem={({ item }) => {
          const icon = iconFor(item.type, colors);
          return (
            <TouchableOpacity
              style={[
                styles.row,
                { borderBottomColor: colors.border },
                !item.read && { backgroundColor: isDark ? 'rgba(61,169,255,0.14)' : '#EAF5FF' },
              ]}
              onPress={() => {
                markOneRead(item);
                if (['like', 'repost', 'comment', 'mention', 'coown'].includes(item.type) && item.post_id) {
                  router.push(`/post/${item.post_id}`);
                } else if (item.type === 'login_alert') {
                  router.push('/settings');
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
  topBar: { paddingTop: 56, paddingBottom: 14, paddingHorizontal: spacing.lg, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topBarTitle: { fontSize: 22, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, paddingHorizontal: spacing.lg, gap: 10, borderBottomWidth: 1 },
  iconWrap: { width: 26, alignItems: 'center' },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  label: { flex: 1, fontSize: 14 },
  empty: { textAlign: 'center', marginTop: 40 },
});
