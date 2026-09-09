import { useState } from 'react';
import { View, Text, TextInput, FlatList, Image, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import { spacing } from '@/lib/theme';

export default function NewMessageScreen() {
  const { session } = useAuth();
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);

  const runSearch = async (text: string) => {
    setQuery(text);
    if (text.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .or(`display_name.ilike.%${text}%,username.ilike.%${text}%`)
      .neq('id', session?.user?.id)
      .limit(20);
    setResults(data || []);
    setLoading(false);
  };

  const startChat = async (user: any) => {
    if (!session?.user?.id || starting) return;
    setStarting(true);
    const { data: myConvs } = await supabase.from('conversation_participants').select('conversation_id').eq('user_id', session.user.id);
    let convId: string | null = null;
    if (myConvs?.length) {
      const { data: shared } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', user.id)
        .in('conversation_id', myConvs.map((c: any) => c.conversation_id));
      if (shared?.length) convId = shared[0].conversation_id;
    }
    if (!convId) {
      const { data: conv } = await supabase.from('conversations').insert({}).select().single();
      await supabase.from('conversation_participants').insert([
        { conversation_id: conv.id, user_id: session.user.id },
        { conversation_id: conv.id, user_id: user.id },
      ]);
      convId = conv.id;
    }
    setStarting(false);
    router.replace({ pathname: '/conversation/[id]', params: { id: convId, name: user.display_name || 'Chat', otherId: user.id, otherAvatar: user.avatar_url || '' } });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.cancel, { color: colors.subtext }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>New Message</Text>
        <View style={{ width: 50 }} />
      </View>
      <View style={styles.searchWrap}>
        <TextInput
          style={[styles.searchInput, { backgroundColor: colors.inputBg, color: colors.text }]}
          placeholder="Search people"
          placeholderTextColor={colors.faint}
          value={query}
          onChangeText={runSearch}
          autoCapitalize="none"
          autoFocus
        />
      </View>
      {(loading || starting) && <ActivityIndicator style={{ marginTop: 20 }} color={colors.primary} />}
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.row, { borderBottomColor: colors.border }]} onPress={() => startChat(item)}>
            <Image
              source={{ uri: item.avatar_url || 'https://placehold.co/80x80/6C5CE7/fff?text=' + (item.display_name?.[0] || '?') }}
              style={styles.avatar}
            />
            <View>
              <Text style={[styles.displayName, { color: colors.text }]}>{item.display_name}</Text>
              <Text style={[styles.username, { color: colors.subtext }]}>@{item.username}</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={query.length >= 2 && !loading ? <Text style={[styles.empty, { color: colors.subtext }]}>No users found</Text> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 56, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1 },
  cancel: { fontSize: 16 },
  title: { fontSize: 16, fontWeight: '700' },
  searchWrap: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  searchInput: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, paddingHorizontal: spacing.lg, gap: 12, borderBottomWidth: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#ddd' },
  displayName: { fontWeight: '700', fontSize: 15 },
  username: { fontSize: 13, marginTop: 1 },
  empty: { textAlign: 'center', marginTop: 40 },
});
