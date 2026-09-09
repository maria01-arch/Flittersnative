import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, StyleSheet, ActivityIndicator, ScrollView, FlatList, Switch, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import { uploadImage } from '@/lib/upload';
import { spacing } from '@/lib/theme';

export default function GroupSettingsScreen() {
  const { id } = useLocalSearchParams();
  const { session } = useAuth();
  const { colors } = useTheme();
  const [group, setGroup] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [requireApproval, setRequireApproval] = useState(false);
  const [newAvatarUri, setNewAvatarUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const myRole = members.find((m) => m.user_id === session?.user?.id)?.role;
  const isAdmin = myRole === 'admin';
  const isCreator = group?.creator_id === session?.user?.id;

  const load = async () => {
    const [{ data: g }, { data: mems }] = await Promise.all([
      supabase.from('groups').select('*').eq('id', id).single(),
      supabase.from('group_members').select('*,profile:profiles(*)').eq('group_id', id),
    ]);
    setGroup(g);
    setMembers(mems || []);
    if (g) {
      setName(g.name || '');
      setDescription(g.description || '');
      setRequireApproval(g.join_mode === 'request');
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [id]);

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [1, 1] });
    if (!result.canceled && result.assets?.[0]) setNewAvatarUri(result.assets[0].uri);
  };

  const save = async () => {
    setSaving(true);
    let avatarUrl = group?.avatar_url;
    if (newAvatarUri) {
      const uploaded = await uploadImage(newAvatarUri, `groups/${id}`);
      if (uploaded) avatarUrl = uploaded;
    }
    await supabase
      .from('groups')
      .update({ name: name.trim(), description: description.trim(), join_mode: requireApproval ? 'request' : 'open', avatar_url: avatarUrl })
      .eq('id', id);
    setSaving(false);
    load();
  };

  const promote = async (member: any) => {
    await supabase.from('group_members').update({ role: 'admin' }).eq('group_id', id).eq('user_id', member.user_id);
    setMembers((prev) => prev.map((m) => (m.user_id === member.user_id ? { ...m, role: 'admin' } : m)));
  };

  const demote = async (member: any) => {
    await supabase.from('group_members').update({ role: 'member' }).eq('group_id', id).eq('user_id', member.user_id);
    setMembers((prev) => prev.map((m) => (m.user_id === member.user_id ? { ...m, role: 'member' } : m)));
  };

  const removeMember = (member: any) => {
    Alert.alert('Remove member', `Remove ${member.profile?.display_name} from the group?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('group_members').delete().eq('group_id', id).eq('user_id', member.user_id);
          setMembers((prev) => prev.filter((m) => m.user_id !== member.user_id));
        },
      },
    ]);
  };

  const leaveGroup = () => {
    Alert.alert('Leave group', 'Are you sure you want to leave this group?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('group_members').delete().eq('group_id', id).eq('user_id', session?.user?.id);
          router.replace('/(tabs)/messages');
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Group Settings</Text>
        {isAdmin ? (
          <TouchableOpacity onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={[styles.save, { color: colors.primary }]}>Save</Text>}
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <TouchableOpacity style={styles.avatarWrap} onPress={isAdmin ? pickAvatar : undefined}>
        {newAvatarUri || group?.avatar_url ? (
          <Image source={{ uri: newAvatarUri || group?.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: group?.cover_color || colors.primary }]}>
            <Text style={styles.avatarLetter}>{group?.name?.[0]?.toUpperCase() || 'G'}</Text>
          </View>
        )}
        {isAdmin && <Text style={[styles.changePhoto, { color: colors.primary }]}>Change photo</Text>}
      </TouchableOpacity>

      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.subtext }]}>Group Name</Text>
        {isAdmin ? (
          <TextInput style={[styles.input, { borderColor: colors.border, color: colors.text }]} value={name} onChangeText={setName} />
        ) : (
          <Text style={[styles.readonly, { color: colors.text }]}>{name}</Text>
        )}
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.subtext }]}>Description</Text>
        {isAdmin ? (
          <TextInput style={[styles.input, styles.multiline, { borderColor: colors.border, color: colors.text }]} value={description} onChangeText={setDescription} multiline />
        ) : (
          <Text style={[styles.readonly, { color: colors.text }]}>{description || 'No description'}</Text>
        )}
      </View>

      {isAdmin && (
        <View style={styles.switchRow}>
          <Text style={[styles.label, { color: colors.subtext, marginBottom: 0 }]}>Require approval to join</Text>
          <Switch value={requireApproval} onValueChange={setRequireApproval} trackColor={{ true: colors.primary }} />
        </View>
      )}

      <Text style={[styles.sectionHeader, { color: colors.subtext }]}>MEMBERS ({members.length})</Text>
      <FlatList
        data={members}
        keyExtractor={(item) => item.user_id}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <View style={[styles.memberRow, { borderBottomColor: colors.border }]}>
            <TouchableOpacity style={styles.memberInfo} onPress={() => router.push(`/user/${item.user_id}`)}>
              <Image source={{ uri: item.profile?.avatar_url || 'https://placehold.co/60x60/6C5CE7/fff?text=?' }} style={styles.memberAvatar} />
              <View>
                <Text style={[styles.memberName, { color: colors.text }]}>{item.profile?.display_name}</Text>
                {item.role === 'admin' && <Text style={[styles.adminTag, { color: colors.primary }]}>Admin</Text>}
              </View>
            </TouchableOpacity>
            {isAdmin && item.user_id !== session?.user?.id && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {item.role !== 'admin' ? (
                  <TouchableOpacity style={[styles.smallBtn, { borderColor: colors.primary }]} onPress={() => promote(item)}>
                    <Text style={[styles.smallBtnText, { color: colors.primary }]}>Promote</Text>
                  </TouchableOpacity>
                ) : (
                  isCreator && (
                    <TouchableOpacity style={[styles.smallBtn, { borderColor: colors.border }]} onPress={() => demote(item)}>
                      <Text style={[styles.smallBtnText, { color: colors.text }]}>Demote</Text>
                    </TouchableOpacity>
                  )
                )}
                {isCreator && (
                  <TouchableOpacity style={[styles.smallBtn, { borderColor: '#EF4444' }]} onPress={() => removeMember(item)}>
                    <Text style={[styles.smallBtnText, { color: '#EF4444' }]}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}
      />

      <TouchableOpacity style={styles.leaveButton} onPress={leaveGroup}>
        <Text style={styles.leaveText}>Leave Group</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 56, paddingHorizontal: spacing.lg, paddingBottom: 14, borderBottomWidth: 1 },
  title: { fontSize: 16, fontWeight: '700' },
  save: { fontSize: 16, fontWeight: '700' },
  avatarWrap: { alignItems: 'center', marginTop: 20, marginBottom: 10 },
  avatar: { width: 90, height: 90, borderRadius: 20, backgroundColor: '#ddd' },
  avatarFallback: { justifyContent: 'center', alignItems: 'center' },
  avatarLetter: { color: '#fff', fontWeight: '800', fontSize: 32 },
  changePhoto: { marginTop: 8, fontWeight: '600' },
  field: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  label: { fontSize: 13, marginBottom: 6, fontWeight: '600' },
  readonly: { fontSize: 15 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15 },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  sectionHeader: { fontSize: 12, fontWeight: '700', marginTop: spacing.xl, marginBottom: 6, paddingHorizontal: spacing.lg, letterSpacing: 0.5 },
  memberRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: 10, borderBottomWidth: 1 },
  memberInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  memberAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#ddd' },
  memberName: { fontSize: 14, fontWeight: '600' },
  adminTag: { fontSize: 11, fontWeight: '700', marginTop: 1 },
  smallBtn: { borderWidth: 1, borderRadius: 12, paddingVertical: 5, paddingHorizontal: 10 },
  smallBtnText: { fontSize: 12, fontWeight: '700' },
  leaveButton: { margin: spacing.lg, marginTop: spacing.xl, borderWidth: 1, borderColor: '#EF4444', borderRadius: 20, paddingVertical: 12, alignItems: 'center' },
  leaveText: { color: '#EF4444', fontWeight: '700' },
});
