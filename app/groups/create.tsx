import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Switch } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { colors, spacing } from '@/lib/theme';

export default function CreateGroupScreen() {
  const { session } = useAuth();
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
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>New Group</Text>
        <TouchableOpacity onPress={create} disabled={!name.trim() || saving}>
          {saving ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={[styles.create, !name.trim() && { opacity: 0.4 }]}>Create</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Group Name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Weekend Runners" placeholderTextColor={colors.faint} />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Description</Text>
        <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription} placeholder="What's this group about?" placeholderTextColor={colors.faint} multiline />
      </View>

      <View style={styles.switchRow}>
        <View>
          <Text style={styles.label}>Require approval to join</Text>
          <Text style={styles.hint}>Off = anyone can join instantly</Text>
        </View>
        <Switch value={requireApproval} onValueChange={setRequireApproval} trackColor={{ true: colors.primary }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 56, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  cancel: { color: colors.subtext, fontSize: 16 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  create: { color: colors.primary, fontSize: 16, fontWeight: '700' },
  field: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  label: { fontSize: 13, color: colors.subtext, marginBottom: 6, fontWeight: '600' },
  hint: { fontSize: 12, color: colors.faint, marginTop: 2 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 15, color: colors.text },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, marginTop: spacing.xl },
});
