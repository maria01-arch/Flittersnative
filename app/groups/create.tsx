import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Switch } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { spacing } from '@/lib/theme';
import { useTheme } from '@/lib/ThemeContext';

export default function CreateGroupScreen() {
  const { session } = useAuth();
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [requireApproval, setRequireApproval] = useState(false);
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!name.trim() || !session?.user?.id) return;
    setSaving(true);
    const tag = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) + Math.floor(Math.random() * 1000);
    const { data } = await supabase
      .from('groups')
      .insert({
        name: name.trim(),
        description: description.trim(),
        creator_id: session.user.id,
        cover_color: colors.primary,
        tag,
        join_mode: requireApproval ? 'request' : 'open',
      })
      .select()
      .single();
    if (data) {
      await supabase.from('group_members').insert({ group_id: data.id, user_id: session.user.id, role: 'admin' });
      router.replace({ pathname: '/groups/[id]', params: { id: data.id, name: data.name } });
    }
    setSaving(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.cancel, { color: colors.subtext }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>New Group</Text>
        <TouchableOpacity onPress={create} disabled={!name.trim() || saving}>
          {saving ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={[styles.create, { color: colors.primary }, !name.trim() && { opacity: 0.4 }]}>Create</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.subtext }]}>Group Name</Text>
        <TextInput style={[styles.input, { borderColor: colors.border, color: colors.text }]} value={name} onChangeText={setName} placeholder="e.g. Weekend Runners" placeholderTextColor={colors.faint} />
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.subtext }]}>Description</Text>
        <TextInput style={[styles.input, styles.multiline, { borderColor: colors.border, color: colors.text }]} value={description} onChangeText={setDescription} placeholder="What's this group about?" placeholderTextColor={colors.faint} multiline />
      </View>

      <View style={styles.switchRow}>
        <View>
          <Text style={[styles.label, { color: colors.subtext }]}>Require approval to join</Text>
          <Text style={[styles.hint, { color: colors.faint }]}>Off = anyone can join instantly</Text>
        </View>
        <Switch value={requireApproval} onValueChange={setRequireApproval} trackColor={{ true: colors.primary }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 56, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1 },
  cancel: { fontSize: 16 },
  title: { fontSize: 16, fontWeight: '700' },
  create: { fontSize: 16, fontWeight: '700' },
  field: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  label: { fontSize: 13, marginBottom: 6, fontWeight: '600' },
  hint: { fontSize: 12, marginTop: 2 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, marginTop: spacing.xl },
});
