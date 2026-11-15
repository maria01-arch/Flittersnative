import { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Text from '@/components/AppText';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import { cleanSearchText } from '@/lib/searchText';
import Avatar from './Avatar';

const MENTION_END = /(^|\s)@([A-Za-z0-9_]{1,30})$/;

// While you type "@jo" in a comment, shows people whose name starts that way.
// Tap one and it fills in @username. Put it right above the typing box.
export default function MentionSuggest({ text, onChange }: { text: string; onChange: (t: string) => void }) {
  const { colors } = useTheme();
  const { session } = useAuth();
  const [results, setResults] = useState<any[]>([]);
  const seq = useRef(0);
  const q = MENTION_END.exec(text)?.[2] || '';

  useEffect(() => {
    const clean = cleanSearchText(q);
    if (!clean) {
      seq.current++;
      setResults([]);
      return;
    }
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id,display_name,username,avatar_url')
        .or(`username.ilike.${clean}%,display_name.ilike.${clean}%`)
        .limit(6);
      if (mine !== seq.current) return;
      setResults((data || []).filter((p: any) => p.username && p.id !== session?.user?.id));
    }, 200);
    return () => clearTimeout(t);
  }, [q, session?.user?.id]);

  if (!q || !results.length) return null;
  return (
    <View style={[styles.box, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
      {results.map((u) => (
        <TouchableOpacity key={u.id} style={styles.row} onPress={() => onChange(text.replace(MENTION_END, (_m, sp) => `${sp}@${u.username} `))}>
          <Avatar uri={u.avatar_url} size={30} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>{u.display_name}</Text>
            <Text style={{ color: colors.subtext, fontSize: 12 }} numberOfLines={1}>@{u.username}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 7 },
});
