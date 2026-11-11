import { useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Text from '@/components/AppText';
import { router } from 'expo-router';
import Avatar from '@/components/Avatar';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/ThemeContext';

// Shown in the middle of a chat that has no messages yet: the person's
// picture, name, follower count, whether you follow each other, a View profile
// button and a few one-tap first messages.
export default function NewChatIntro({
  me,
  otherId,
  name,
  avatar,
  followers,
  username,
  onSend,
  embedded = false,
}: {
  me?: string | null;
  otherId?: string | null;
  name: string;
  avatar?: string | null;
  followers?: number | null;
  username?: string | null;
  onSend: (text: string) => void;
  // embedded: sits at the top of the message list and scrolls away with it,
  // without the one-tap starter messages.
  embedded?: boolean;
}) {
  const { colors } = useTheme();
  const [friends, setFriends] = useState(false);

  useEffect(() => {
    if (!me || !otherId) return;
    let alive = true;
    (async () => {
      try {
        const [a, b] = await Promise.all([
          supabase.from('follows').select('id').eq('follower_id', me).eq('following_id', otherId).maybeSingle(),
          supabase.from('follows').select('id').eq('follower_id', otherId).eq('following_id', me).maybeSingle(),
        ]);
        if (alive) setFriends(!!a.data && !!b.data);
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, [me, otherId]);

  const first = (name || '').trim().split(/\s+/)[0] || 'there';
  const starters = [`Hello ${first}`, 'Hi 👋', 'Are you home?'];
  const count = followers || 0;

  return (
    <View style={embedded ? styles.embedded : styles.wrap} pointerEvents="box-none">
      <Avatar uri={avatar} size={96} />
      <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
        {name}
      </Text>
      <Text style={[styles.sub, { color: colors.subtext }]}>
        {count} {count === 1 ? 'follower' : 'followers'}
      </Text>
      <Text style={[styles.sub, { color: colors.subtext }]}>
        {friends ? "You're friends on Flitters" : username ? `@${username} on Flitters` : 'On Flitters'}
      </Text>
      <TouchableOpacity
        style={[styles.viewBtn, { backgroundColor: colors.inputBg }]}
        onPress={() => otherId && router.push(`/user/${otherId}` as any)}
      >
        <Text style={[styles.viewText, { color: colors.text }]}>View profile</Text>
      </TouchableOpacity>
      {!embedded && (
        <>
          <Text style={[styles.hint, { color: colors.faint }]}>Start the chat</Text>
          <View style={styles.chips}>
            {starters.map((s) => (
              <TouchableOpacity key={s} style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.card }]} onPress={() => onSend(s)}>
                <Text style={[styles.chipText, { color: colors.text }]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  embedded: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 36, paddingBottom: 28 },
  name: { fontSize: 24, fontWeight: '800', marginTop: 14, maxWidth: '90%' },
  sub: { fontSize: 14, marginTop: 4 },
  viewBtn: { marginTop: 16, paddingHorizontal: 22, paddingVertical: 10, borderRadius: 12 },
  viewText: { fontSize: 15, fontWeight: '700' },
  hint: { marginTop: 28, fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 10 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, borderWidth: 1 },
  chipText: { fontSize: 14, fontWeight: '600' },
});
