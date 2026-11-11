import { useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ActivityIndicator, Image, ScrollView } from 'react-native';
import Text from '@/components/AppText';
import { useLocalSearchParams, router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import { spacing } from '@/lib/theme';
import { getJoinState, joinOrRequest, parseGroupTag, JoinState } from '@/lib/groupInvite';

// Opened from an invite link / @tag (Messages → + → Join a group) or the
// flittersnative://join/<tag> address. Shows the group, then either joins it
// or sends a request, depending on the group's setting.
export default function JoinGroupScreen() {
  const { tag: rawTag } = useLocalSearchParams<{ tag: string }>();
  const { session } = useAuth();
  const { colors } = useTheme();
  const [group, setGroup] = useState<any>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [state, setState] = useState<JoinState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [descOpen, setDescOpen] = useState(false);
  const [descLines, setDescLines] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const tag = parseGroupTag(String(rawTag || ''));
      if (!tag || !session?.user?.id) {
        setLoading(false);
        return;
      }
      const { data: g } = await supabase.from('groups').select('*').eq('tag', tag).maybeSingle();
      if (!g) {
        setLoading(false);
        return;
      }
      const [{ count }, s] = await Promise.all([
        supabase.from('group_members').select('*', { count: 'exact', head: true }).eq('group_id', g.id),
        getJoinState(g, session.user.id),
      ]);
      setGroup(g);
      setMemberCount(count || 0);
      setState(s);
      setLoading(false);
    })();
  }, [rawTag, session?.user?.id]);

  const openGroup = () => router.replace({ pathname: '/groups/[id]', params: { id: group.id, name: group.name } });

  const act = async () => {
    if (!group || !session?.user?.id || busy) return;
    setBusy(true);
    setError('');
    const res = await joinOrRequest(group, session.user.id);
    setBusy(false);
    if (res.error) {
      setError("Couldn't complete that right now. Please try again.");
      console.warn('[Join] failed:', res.error);
      return;
    }
    if (res.state === 'member') openGroup();
    else setState(res.state || 'pending');
  };

  const cta =
    state === 'member' ? { label: 'Open group', onPress: openGroup, disabled: false } :
    state === 'open' ? { label: 'Join group', onPress: act, disabled: false } :
    state === 'pending' ? { label: 'Request sent — waiting for an admin', onPress: () => {}, disabled: true } :
    { label: 'Request to join', onPress: act, disabled: false };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <TouchableOpacity style={styles.back} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color={colors.text} />
      </TouchableOpacity>
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} />
      ) : !group ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 44 }}>😕</Text>
          <Text style={[styles.name, { color: colors.text }]}>Group not found</Text>
          <Text style={{ color: colors.subtext, textAlign: 'center' }}>Check the link or @tag and try again.</Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {group.avatar_url ? (
            <Image source={{ uri: group.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: group.cover_color || colors.primary, alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ color: '#fff', fontSize: 40, fontWeight: '800' }}>{group.name?.[0]?.toUpperCase()}</Text>
            </View>
          )}
          <Text style={[styles.name, { color: colors.text }]}>{group.name}</Text>
          <Text style={{ color: colors.subtext }}>@{group.tag} · {memberCount} {memberCount === 1 ? 'member' : 'members'}</Text>
          {!!group.description && (
            <View style={{ marginTop: 12, alignSelf: 'stretch' }}>
              {/* Only the first few lines show; "Read more" opens the rest in a scrollable box. */}
              <View>
                <Text style={{ color: colors.text, textAlign: 'center', lineHeight: 21 }} numberOfLines={descOpen ? undefined : 4}>
                  {group.description}
                </Text>
                {descLines === null && (
                  <Text
                    style={{ color: colors.text, textAlign: 'center', lineHeight: 21, position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 }}
                    onTextLayout={(e) => setDescLines(e.nativeEvent.lines.length)}
                  >
                    {group.description}
                  </Text>
                )}
              </View>
              {descLines !== null && descLines > 4 && (
                <TouchableOpacity onPress={() => setDescOpen((v) => !v)} style={{ alignSelf: 'center', marginTop: 4 }}>
                  <Text style={{ color: colors.primary, fontWeight: '700' }}>{descOpen ? 'Show less' : 'Read more'}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          {group.join_mode !== 'open' && state !== 'member' && (
            <Text style={{ color: colors.subtext, textAlign: 'center', marginTop: 12, fontSize: 13 }}>🔒 An admin needs to approve new members.</Text>
          )}
          {!!error && <Text style={{ color: colors.danger, marginTop: 12 }}>{error}</Text>}
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: colors.primary, opacity: cta.disabled || busy ? 0.5 : 1 }]}
            onPress={cta.onPress}
            disabled={cta.disabled || busy}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>{cta.label}</Text>}
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 56, paddingHorizontal: spacing.lg },
  back: { alignSelf: 'flex-start', padding: 4 },
  scrollContent: { alignItems: 'center', paddingTop: 30, paddingBottom: 60, gap: 6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80, gap: 6 },
  avatar: { width: 96, height: 96, borderRadius: 24, marginBottom: 8 },
  name: { fontSize: 24, fontWeight: '800', marginTop: 4 },
  cta: { marginTop: 24, borderRadius: 24, paddingVertical: 14, paddingHorizontal: 28, minWidth: 220, alignItems: 'center' },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
