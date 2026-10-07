import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import { spacing } from '@/lib/theme';
import Avatar from '@/components/Avatar';
import VerifiedBadge from '@/components/VerifiedBadge';

// Neither app had a way to actually view a following list before — only
// the count on the profile page. This is that screen, reused for anyone's
// profile via the :id param, gated by that person's who_can_see_following
// setting (checked again here, not just at the tap on the profile page,
// since this route can be reached directly).
export default function FollowingListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [ownerName, setOwnerName] = useState('');

  useEffect(() => {
    (async () => {
      const { data: owner } = await supabase.from('profiles').select('username,who_can_see_following').eq('id', id).single();
      setOwnerName(owner?.username || '');
      const isMe = session?.user?.id === id;
      if (!isMe && owner?.who_can_see_following === 'nobody') {
        setBlocked(true);
        setLoading(false);
        return;
      }
      // Two steps rather than an embedded join — `follows` has two
      // foreign keys into `profiles` (follower_id and following_id), and
      // a plain embed hint is ambiguous between them.
      const { data: followRows } = await supabase.from('follows').select('following_id').eq('follower_id', id);
      const followingIds = (followRows || []).map((r: any) => r.following_id);
      if (followingIds.length) {
        const { data: profileRows } = await supabase.from('profiles').select('*').in('id', followingIds);
        setRows(profileRows || []);
      }
      setLoading(false);
    })();
  }, [id, session]);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{ownerName ? `@${ownerName} follows` : 'Following'}</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : blocked ? (
        <View style={styles.center}>
          <Ionicons name="lock-closed" size={28} color={colors.faint} />
          <Text style={{ color: colors.subtext, marginTop: 10 }}>This person has hidden who they follow.</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={[styles.row, { borderBottomColor: colors.border }]} onPress={() => router.push(`/user/${item.id}`)}>
              <Avatar uri={item.avatar_url} size={44} />
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Text style={[styles.displayName, { color: colors.text }]}>{item.display_name}</Text>
                  <VerifiedBadge verified={item.verified} isAuthentic={item.is_authentic} size={12} />
                </View>
                <Text style={[styles.username, { color: colors.subtext }]}>@{item.username}</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={[styles.empty, { color: colors.subtext }]}>Not following anyone yet.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', marginTop: 60, paddingHorizontal: 40 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 56, paddingHorizontal: spacing.lg, paddingBottom: 14, borderBottomWidth: 1 },
  title: { fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: spacing.md, paddingHorizontal: spacing.lg, borderBottomWidth: 1 },
  displayName: { fontWeight: '700', fontSize: 15 },
  username: { fontSize: 13, marginTop: 1 },
  empty: { textAlign: 'center', marginTop: 40 },
});
