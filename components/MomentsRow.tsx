import { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import Text from '@/components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import Avatar from '@/components/Avatar';
import RingAvatar from '@/components/RingAvatar';
import { onMomentsChanged, seedRing } from '@/lib/momentRings';

// Row at the top of the feed: "Your moment" first, then people you follow who posted in the last 24 hours.
export default function MomentsRow() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const me = session?.user?.id;
  const [rows, setRows] = useState<any[]>([]);
  const [myAvatar, setMyAvatar] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!me) return;
    const [{ data }, { data: p }] = await Promise.all([
      supabase.rpc('moments_feed'),
      supabase.from('profiles').select('avatar_url').eq('id', me).maybeSingle(),
    ]);
    (data || []).forEach((r: any) => seedRing(r.user_id, !!r.unseen));
    setRows(data || []);
    setMyAvatar((p as any)?.avatar_url || null);
  }, [me]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => onMomentsChanged(load), [load]);

  const mine = rows.find((r) => r.user_id === me);
  const others = rows.filter((r) => r.user_id !== me);
  if (!me) return null;
  if (!mine && !others.length) {
    // SQL not run / nobody posted: still offer "Your moment" so people can start
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row} contentContainerStyle={{ paddingHorizontal: 14, gap: 14 }}>
      <View style={styles.item}>
        <View>
          <TouchableOpacity activeOpacity={0.85} onPress={() => (mine ? router.push(`/moment/${me}`) : router.push('/moment-new'))}>
            {mine ? <RingAvatar userId={me} uri={myAvatar} size={58} noTap /> : <Avatar uri={myAvatar} size={58} />}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.plus, { backgroundColor: colors.primary, borderColor: colors.bg }]} onPress={() => router.push('/moment-new')}>
            <Ionicons name="add" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
        <Text numberOfLines={1} style={[styles.name, { color: colors.subtext }]}>Your moment</Text>
      </View>
      {others.map((r) => (
        <TouchableOpacity key={r.user_id} style={styles.item} activeOpacity={0.85} onPress={() => router.push(`/moment/${r.user_id}`)}>
          <RingAvatar userId={r.user_id} uri={r.avatar_url} size={58} noTap />
          <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>{r.display_name || r.username}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 10 },
  item: { width: 70, alignItems: 'center', gap: 6 },
  name: { fontSize: 12, maxWidth: 70, textAlign: 'center' },
  plus: { position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
