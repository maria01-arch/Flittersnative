import { useCallback, useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, Modal, TextInput, Pressable, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import Text from '@/components/AppText';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import Avatar from '@/components/Avatar';

// Short 60-letter status that sits above a person's picture for 24 hours (top of the Chats tab).
export default function NotesRow() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const me = session?.user?.id;
  const [rows, setRows] = useState<any[]>([]);
  const [myAvatar, setMyAvatar] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<any>(null);

  const load = useCallback(async () => {
    if (!me) return;
    const [{ data }, { data: p }] = await Promise.all([
      supabase.rpc('notes_feed'),
      supabase.from('profiles').select('avatar_url').eq('id', me).maybeSingle(),
    ]);
    setRows(data || []);
    setMyAvatar((p as any)?.avatar_url || null);
  }, [me]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const mine = rows.find((r) => r.user_id === me);
  const others = rows.filter((r) => r.user_id !== me);

  const save = async (value: string | null) => {
    if (!me || saving) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ note: value }).eq('id', me);
    setSaving(false);
    if (error) return Alert.alert('Could not save', 'Check your internet and try again.');
    setEditing(false);
    load();
  };

  const bubble = (t: string, mineBubble?: boolean) => (
    <View style={[styles.bubble, { backgroundColor: mineBubble ? colors.primary : colors.card, borderColor: colors.border }]}>
      <Text numberOfLines={2} style={[styles.bubbleTxt, { color: mineBubble ? '#fff' : colors.text }]}>{t}</Text>
    </View>
  );

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 14, paddingTop: 6, paddingBottom: 8 }}>
        <TouchableOpacity style={styles.item} onPress={() => { setText(mine?.note || ''); setEditing(true); }}>
          {bubble(mine?.note || 'Add a note', !!mine)}
          <Avatar uri={myAvatar} size={54} />
          <Text numberOfLines={1} style={[styles.name, { color: colors.subtext }]}>Your note</Text>
        </TouchableOpacity>
        {others.map((r) => (
          <TouchableOpacity key={r.user_id} style={styles.item} onPress={() => setViewing(r)}>
            {bubble(r.note)}
            <Avatar uri={r.avatar_url} size={54} />
            <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>{r.display_name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal visible={!!viewing} animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable style={styles.full} onPress={() => setViewing(null)}>
          <TouchableOpacity style={styles.fullClose} onPress={() => setViewing(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={{ color: '#fff', fontSize: 26 }}>✕</Text>
          </TouchableOpacity>
          <Avatar uri={viewing?.avatar_url} size={84} />
          <Text style={styles.fullName}>{viewing?.display_name}</Text>
          <ScrollView style={{ maxHeight: '50%', alignSelf: 'stretch' }} contentContainerStyle={{ paddingHorizontal: 28, paddingVertical: 14 }}>
            <Text style={styles.fullText}>{viewing?.note}</Text>
          </ScrollView>
          <TouchableOpacity
            style={styles.fullBtn}
            onPress={() => {
              const id = viewing?.user_id;
              setViewing(null);
              if (id) router.push(`/user/${id}`);
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '800' }}>View profile</Text>
          </TouchableOpacity>
        </Pressable>
      </Modal>

      <Modal visible={editing} transparent animationType="fade" onRequestClose={() => setEditing(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.backdrop} onPress={() => setEditing(false)}>
            <Pressable style={[styles.sheet, { backgroundColor: colors.bg }]} onPress={() => {}}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Your note</Text>
              <Text style={{ color: colors.subtext, fontSize: 13 }}>Followers see it for 24 hours.</Text>
              <TextInput
                autoFocus
                style={[styles.input, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]}
                placeholder="What's on your mind?"
                placeholderTextColor={colors.faint}
                value={text}
                onChangeText={setText}
                maxLength={60}
              />
              <Text style={{ color: colors.faint, fontSize: 12, textAlign: 'right' }}>{text.length}/60</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {mine ? (
                  <TouchableOpacity style={[styles.btn, { backgroundColor: colors.card }]} onPress={() => save(null)}>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>Delete</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary, flex: 1, opacity: text.trim() ? 1 : 0.5 }]} disabled={!text.trim()} onPress={() => save(text.trim())}>
                  <Text style={{ color: '#fff', fontWeight: '800' }}>Share</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  full: { flex: 1, backgroundColor: '#0B0E14', alignItems: 'center', justifyContent: 'center', gap: 10 },
  fullClose: { position: 'absolute', top: 44, right: 20 },
  fullName: { color: '#fff', fontSize: 18, fontWeight: '800' },
  fullText: { color: '#fff', fontSize: 24, fontWeight: '600', textAlign: 'center', lineHeight: 32 },
  fullBtn: { backgroundColor: '#1D8FEA', borderRadius: 22, paddingVertical: 12, paddingHorizontal: 28, marginTop: 8 },
  item: { width: 78, alignItems: 'center', gap: 4 },
  bubble: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, paddingVertical: 5, maxWidth: 78, minHeight: 30, justifyContent: 'center' },
  bubbleTxt: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  name: { fontSize: 12, maxWidth: 78, textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  sheet: { borderRadius: 20, padding: 18, gap: 10 },
  sheetTitle: { fontSize: 18, fontWeight: '800' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  btn: { borderRadius: 12, paddingVertical: 13, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
});
