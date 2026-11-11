import { useEffect, useState } from 'react';
import { View, TextInput, TouchableOpacity, Image, StyleSheet, ActivityIndicator, ScrollView, FlatList, Switch, Alert, Share, Modal } from 'react-native';
import Text from '@/components/AppText';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import { uploadImage } from '@/lib/upload';
import { spacing } from '@/lib/theme';
import Avatar from '@/components/Avatar';
import { cleanSearchText } from '@/lib/searchText';
import { groupInviteLink, acceptJoinRequest, rejectJoinRequest, addMemberDirect } from '@/lib/groupInvite';

export default function GroupSettingsScreen() {
  const { id } = useLocalSearchParams();
  const { session } = useAuth();
  const { colors } = useTheme();
  const [group, setGroup] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [descOpen, setDescOpen] = useState(false);
  const [descLines, setDescLines] = useState<number | null>(null);
  const [descEditing, setDescEditing] = useState(false);
  const [requireApproval, setRequireApproval] = useState(false);
  const [newAvatarUri, setNewAvatarUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [addResults, setAddResults] = useState<any[]>([]);
  const [addSearching, setAddSearching] = useState(false);

  const myRole = members.find((m) => m.user_id === session?.user?.id)?.role;
  const isCreator = group?.creator_id === session?.user?.id;
  // Every admin (and the creator) has the same powers, except that nobody can
  // remove or demote the creator.
  const isAdmin = myRole === 'admin' || isCreator;
  const DB_HINT = 'The database did not allow this. A one-time database update for admins is needed (run the admin SQL from the chat).';

  const load = async () => {
    try {
      const [gRes, mRes] = await Promise.all([
        supabase.from('groups').select('*').eq('id', id).single(),
        supabase.from('group_members').select('*,profile:profiles(*)').eq('group_id', id),
      ]);
      const g = gRes.data;
      const mems = mRes.data;
      if (gRes.error || !g) {
        console.warn('[GroupSettings] could not load group:', gRes.error?.message);
        setLoadError(true);
        return;
      }
      setLoadError(false);
      setGroup(g);
      setMembers(mems || []);
      setName(g.name || '');
      setDescription(g.description || '');
        setDescLines(null);
      setRequireApproval(g.join_mode === 'request');
      // Pending join requests — only admins can see/act on them.
      const iAmAdmin = (mems || []).some((m: any) => m.user_id === session?.user?.id && m.role === 'admin');
      if (iAmAdmin) {
        const { data: reqs } = await supabase
          .from('group_join_requests')
          .select('*,profile:profiles(id,display_name,username,avatar_url)')
          .eq('group_id', id)
          .eq('status', 'pending');
        setRequests(reqs || []);
      } else {
        setRequests([]);
      }
    } catch (err) {
      console.warn('[GroupSettings] load threw:', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
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
    const { data: saved, error } = await supabase
      .from('groups')
      .update({ name: name.trim(), description: description.trim(), join_mode: requireApproval ? 'request' : 'open', avatar_url: avatarUrl })
      .eq('id', id)
      .select('join_mode');
    setSaving(false);
    if (error || !saved?.length) {
      console.warn('[GroupSettings] save failed:', error?.message, saved);
      Alert.alert("Couldn't save", error?.message || "The database didn't accept the changes. Only group admins can edit a group.");
      return;
    }
    load();
  };

  const copyLink = async () => {
    await Clipboard.setStringAsync(groupInviteLink(group.tag));
    Alert.alert('Link copied', groupInviteLink(group.tag));
  };

  const shareLink = () => {
    Share.share({ message: `Join ${group.name} on Flitters: ${groupInviteLink(group.tag)}` });
  };

  const acceptReq = async (req: any) => {
    const { error } = await acceptJoinRequest(req, id as string);
    if (error) {
      console.warn('[GroupSettings] accept request failed:', error);
      const blocked = /row-level security|permission/i.test(error);
      Alert.alert("Couldn't accept", blocked ? 'The database is not allowing admins to add members yet. A one-time database update is needed (see the SQL in the chat).' : error);
      return;
    }
    setRequests((prev) => prev.filter((r) => r.id !== req.id));
    load();
  };

  const rejectReq = async (req: any) => {
    const { error } = await rejectJoinRequest(req);
    if (error) {
      Alert.alert("Couldn't decline", 'Please try again.');
      return;
    }
    setRequests((prev) => prev.filter((r) => r.id !== req.id));
  };

  const searchPeople = async (text: string) => {
    setAddQuery(text);
    const clean = cleanSearchText(text);
    if (clean.length < 2) {
      setAddResults([]);
      return;
    }
    setAddSearching(true);
    const { data } = await supabase
      .from('profiles')
      .select('id,display_name,username,avatar_url')
      .or(`display_name.ilike.%${clean}%,username.ilike.%${clean}%`)
      .limit(15);
    setAddResults(data || []);
    setAddSearching(false);
  };

  const addPerson = async (u: any) => {
    const { error } = await addMemberDirect(id as string, u.id);
    if (error) {
      console.warn('[GroupSettings] add member failed:', error);
      // "row-level security" means the database itself refused the insert —
      // that's a database permission rule, not something wrong in the app.
      const blocked = /row-level security|permission/i.test(error);
      Alert.alert(
        "Couldn't add",
        blocked
          ? 'The database is not allowing admins to add members yet. A one-time database update is needed (see the SQL in the chat).'
          : error
      );
      return;
    }
    setMembers((prev) => [...prev, { user_id: u.id, role: 'member', profile: u }]);
    setRequests((prev) => prev.filter((r) => r.user_id !== u.id));
  };

  const changeRole = async (member: any, role: 'admin' | 'member') => {
    if (member.user_id === group?.creator_id) return;
    const { data, error } = await supabase.from('group_members').update({ role }).eq('group_id', id).eq('user_id', member.user_id).select('user_id');
    if (error || !data?.length) {
      console.warn('[GroupSettings] role change failed:', error?.message);
      Alert.alert("Couldn't change the role", error?.message || DB_HINT);
      return;
    }
    setMembers((prev) => prev.map((m) => (m.user_id === member.user_id ? { ...m, role } : m)));
  };
  const promote = (member: any) => changeRole(member, 'admin');
  const demote = (member: any) => changeRole(member, 'member');

  const removeMember = (member: any) => {
    if (member.user_id === group?.creator_id) return;
    Alert.alert('Remove member', `Remove ${member.profile?.display_name} from the group?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const { data, error } = await supabase.from('group_members').delete().eq('group_id', id).eq('user_id', member.user_id).select('user_id');
          if (error || !data?.length) {
            console.warn('[GroupSettings] remove failed:', error?.message);
            Alert.alert("Couldn't remove", error?.message || DB_HINT);
            return;
          }
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

  if (loadError || !group) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg, padding: spacing.lg }]}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 6 }}>Couldn't load this group</Text>
        <Text style={{ color: colors.subtext, textAlign: 'center', marginBottom: 16 }}>Check your connection and try again.</Text>
        <TouchableOpacity
          style={{ backgroundColor: colors.primary, borderRadius: 20, paddingVertical: 10, paddingHorizontal: 22 }}
          onPress={() => {
            setLoading(true);
            load();
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Try again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ marginTop: 14 }} onPress={() => router.back()}>
          <Text style={{ color: colors.subtext }}>Go back</Text>
        </TouchableOpacity>
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
          <Image source={{ uri: newAvatarUri || group?.avatar_url }} style={[styles.avatar, { backgroundColor: colors.border }]} />
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
        {isAdmin && descEditing ? (
          <>
            <TextInput style={[styles.input, styles.multiline, { borderColor: colors.border, color: colors.text }]} value={description} onChangeText={(t) => { setDescription(t); setDescLines(null); }} multiline submitBehavior="newline" returnKeyType="default" autoFocus />
            <TouchableOpacity onPress={() => { setDescEditing(false); setDescOpen(false); }} style={{ marginTop: 6, alignSelf: 'flex-start' }}>
              <Text style={{ color: colors.primary, fontWeight: '700' }}>Done</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View>
              <Text style={[styles.readonly, { color: colors.text }]} numberOfLines={descOpen ? undefined : 4}>
                {description || 'No description'}
              </Text>
              {descLines === null && !!description && (
                <Text
                  style={[styles.readonly, { color: colors.text, position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 }]}
                  onTextLayout={(e) => setDescLines(e.nativeEvent.lines.length)}
                >
                  {description}
                </Text>
              )}
            </View>
            <View style={{ flexDirection: 'row', gap: 18, marginTop: 4 }}>
              {descLines !== null && descLines > 4 && (
                <TouchableOpacity onPress={() => setDescOpen((v) => !v)}>
                  <Text style={{ color: colors.primary, fontWeight: '700' }}>{descOpen ? 'See less' : 'See more'}</Text>
                </TouchableOpacity>
              )}
              {isAdmin && (
                <TouchableOpacity onPress={() => setDescEditing(true)}>
                  <Text style={{ color: colors.primary, fontWeight: '700' }}>Edit</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </View>

      {isAdmin && (
        <View style={styles.switchRow}>
          <Text style={[styles.label, { color: colors.subtext, marginBottom: 0 }]}>Require approval to join</Text>
          <Switch
            value={requireApproval}
            onValueChange={async (v) => {
              // Saved right away. It used to wait for the Save button, so any
              // reload of the screen put the switch back to what the database
              // still held — which looked like it switching itself off.
              setRequireApproval(v);
              const { data: saved, error } = await supabase.from('groups').update({ join_mode: v ? 'request' : 'open' }).eq('id', id).select('join_mode');
              if (error || !saved?.length) {
                setRequireApproval(!v);
                console.warn('[GroupSettings] approval not saved:', error?.message, saved);
                Alert.alert("Couldn't save that", error?.message || "The database didn't accept the change. Only group admins can change this.");
              }
            }}
            trackColor={{ true: colors.primary }}
          />
        </View>
      )}

      <Text style={[styles.sectionHeader, { color: colors.subtext }]}>INVITE</Text>
      <View style={{ paddingHorizontal: spacing.lg }}>
        <Text style={{ color: colors.text, fontSize: 13 }} selectable>
          {groupInviteLink(group.tag)}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <TouchableOpacity style={[styles.smallBtn, { borderColor: colors.primary, paddingVertical: 8, paddingHorizontal: 14 }]} onPress={shareLink}>
            <Text style={[styles.smallBtnText, { color: colors.primary }]}>Share link</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.smallBtn, { borderColor: colors.border, paddingVertical: 8, paddingHorizontal: 14 }]} onPress={copyLink}>
            <Text style={[styles.smallBtnText, { color: colors.text }]}>Copy</Text>
          </TouchableOpacity>
          {isAdmin && (
            <TouchableOpacity style={[styles.smallBtn, { borderColor: colors.border, paddingVertical: 8, paddingHorizontal: 14 }]} onPress={() => { setAddQuery(''); setAddResults([]); setAddOpen(true); }}>
              <Text style={[styles.smallBtnText, { color: colors.text }]}>Add people</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isAdmin && requests.length > 0 && (
        <>
          <Text style={[styles.sectionHeader, { color: colors.subtext }]}>JOIN REQUESTS ({requests.length})</Text>
          {requests.map((r) => (
            <View key={r.id} style={[styles.memberRow, { borderBottomColor: colors.border }]}>
              <TouchableOpacity style={styles.memberInfo} onPress={() => router.push(`/user/${r.user_id}`)}>
                <Avatar uri={r.profile?.avatar_url} size={40} />
                <View>
                  <Text style={[styles.memberName, { color: colors.text }]}>{r.profile?.display_name}</Text>
                  <Text style={{ color: colors.subtext, fontSize: 12 }}>@{r.profile?.username}</Text>
                </View>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[styles.smallBtn, { borderColor: colors.primary }]} onPress={() => acceptReq(r)}>
                  <Text style={[styles.smallBtnText, { color: colors.primary }]}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.smallBtn, { borderColor: colors.border }]} onPress={() => rejectReq(r)}>
                  <Text style={[styles.smallBtnText, { color: colors.text }]}>Decline</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </>
      )}

      <Text style={[styles.sectionHeader, { color: colors.subtext }]}>MEMBERS ({members.length})</Text>
      <FlatList
        data={members}
        keyExtractor={(item) => item.user_id}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <View style={[styles.memberRow, { borderBottomColor: colors.border }]}>
            <TouchableOpacity style={styles.memberInfo} onPress={() => router.push(`/user/${item.user_id}`)}>
              <Avatar uri={item.profile?.avatar_url} size={40} />
              <View>
                <Text style={[styles.memberName, { color: colors.text }]}>{item.profile?.display_name}</Text>
                {item.user_id === group?.creator_id ? (
                  <Text style={[styles.adminTag, { color: colors.primary }]}>Creator</Text>
                ) : (
                  item.role === 'admin' && <Text style={[styles.adminTag, { color: colors.primary }]}>Admin</Text>
                )}
              </View>
            </TouchableOpacity>
            {isAdmin && item.user_id !== session?.user?.id && item.user_id !== group?.creator_id && (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {item.role !== 'admin' ? (
                  <TouchableOpacity style={[styles.smallBtn, { borderColor: colors.primary }]} onPress={() => promote(item)}>
                    <Text style={[styles.smallBtnText, { color: colors.primary }]}>Promote</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={[styles.smallBtn, { borderColor: colors.border }]} onPress={() => demote(item)}>
                    <Text style={[styles.smallBtnText, { color: colors.text }]}>Demote</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[styles.smallBtn, { borderColor: colors.danger }]} onPress={() => removeMember(item)}>
                  <Text style={[styles.smallBtnText, { color: colors.danger }]}>Remove</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      />

      <TouchableOpacity style={[styles.leaveButton, { borderColor: colors.danger }]} onPress={leaveGroup}>
        <Text style={[styles.leaveText, { color: colors.danger }]}>Leave Group</Text>
      </TouchableOpacity>

      <Modal visible={addOpen} animationType="slide" onRequestClose={() => setAddOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setAddOpen(false)}>
              <Ionicons name="close" size={26} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.text }]}>Add people</Text>
            <View style={{ width: 26 }} />
          </View>
          <View style={{ padding: spacing.lg }}>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.text }]}
              value={addQuery}
              onChangeText={searchPeople}
              placeholder="Search by name or @username"
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
              autoFocus
            />
          </View>
          {addSearching && <ActivityIndicator color={colors.primary} />}
          <FlatList
            data={addResults}
            keyExtractor={(u) => u.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const already = members.some((m) => m.user_id === item.id);
              return (
                <View style={[styles.memberRow, { borderBottomColor: colors.border }]}>
                  <View style={styles.memberInfo}>
                    <Avatar uri={item.avatar_url} size={40} />
                    <View>
                      <Text style={[styles.memberName, { color: colors.text }]}>{item.display_name}</Text>
                      <Text style={{ color: colors.subtext, fontSize: 12 }}>@{item.username}</Text>
                    </View>
                  </View>
                  {already ? (
                    <Text style={{ color: colors.subtext, fontSize: 12, fontWeight: '700' }}>In group</Text>
                  ) : (
                    <TouchableOpacity style={[styles.smallBtn, { borderColor: colors.primary }]} onPress={() => addPerson(item)}>
                      <Text style={[styles.smallBtnText, { color: colors.primary }]}>Add</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            }}
          />
        </View>
      </Modal>
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
  avatar: { width: 90, height: 90, borderRadius: 20 },
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
  memberAvatar: { width: 40, height: 40, borderRadius: 20 },
  memberName: { fontSize: 14, fontWeight: '600' },
  adminTag: { fontSize: 11, fontWeight: '700', marginTop: 1 },
  smallBtn: { borderWidth: 1, borderRadius: 12, paddingVertical: 5, paddingHorizontal: 10 },
  smallBtnText: { fontSize: 12, fontWeight: '700' },
  leaveButton: { margin: spacing.lg, marginTop: spacing.xl, borderWidth: 1, borderRadius: 20, paddingVertical: 12, alignItems: 'center' },
  leaveText: { fontWeight: '700' },
});
