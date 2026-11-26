import { useCallback, useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import Text from '@/components/AppText';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/lib/ThemeContext';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import RingAvatar from '@/components/RingAvatar';
import VerifiedBadge from '@/components/VerifiedBadge';
import ActionSheet from '@/components/ActionSheet';
import ReportModal from '@/components/ReportModal';
import ChatThemeSheet from '@/components/ChatThemeSheet';
import { startOutgoing } from '@/lib/calls/callManager';
import { isVerifiedUser } from '@/lib/postActions';
import { ChatTheme, DEFAULT_THEME, loadChatTheme, saveChatTheme, clearChatTheme, peekChatTheme } from '@/lib/chatTheme';

// The screen you get by tapping the person's name at the top of a chat. "Profile" opens their account.
export default function ChatInfo() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const { id, otherId } = useLocalSearchParams();
  const convId = String(id);
  const me = session?.user?.id;
  const [p, setP] = useState<any>(null);
  const [part, setPart] = useState<{ muted: boolean; archived: boolean }>({ muted: false, archived: false });
  const [moreOpen, setMoreOpen] = useState(false);
  const [report, setReport] = useState<null | 'user' | 'conversation'>(null);
  const [themeOpen, setThemeOpen] = useState(false);
  const [theme, setTheme] = useState<ChatTheme>(() => peekChatTheme(convId) || DEFAULT_THEME);
  const [meVerified, setMeVerified] = useState(false);

  useEffect(() => {
    if (otherId) supabase.from('profiles').select('id,display_name,username,avatar_url,verified,is_authentic,verified_plan').eq('id', String(otherId)).maybeSingle().then(({ data }) => setP(data));
    loadChatTheme(convId).then(setTheme);
    isVerifiedUser(me).then(setMeVerified);
  }, [otherId, convId, me]);

  const loadPart = useCallback(async () => {
    if (!me) return;
    const { data } = await supabase.from('conversation_participants').select('muted,archived').eq('conversation_id', convId).eq('user_id', me).maybeSingle();
    if (data) setPart({ muted: !!(data as any).muted, archived: !!(data as any).archived });
  }, [convId, me]);
  useEffect(() => { loadPart(); }, [loadPart]);

  const name = p?.display_name || 'Chat';

  const call = async () => {
    if (!otherId) return;
    const r = await startOutgoing({ id: String(otherId), name, avatar: p?.avatar_url || null }, convId);
    if (!r.ok) Alert.alert('Call', r.message || "Couldn't start the call.");
    else router.push('/call' as any);
  };

  const setFlag = async (field: 'muted' | 'archived', value: boolean) => {
    if (!me) return;
    setPart((x) => ({ ...x, [field]: value }));
    const { error } = await supabase.from('conversation_participants').update({ [field]: value }).eq('conversation_id', convId).eq('user_id', me);
    if (error) {
      setPart((x) => ({ ...x, [field]: !value }));
      Alert.alert("Couldn't save", field === 'muted' ? 'Run BATCH14_run_this.sql in Supabase first, then try again.' : error.message);
    }
  };

  const deleteConversation = () => {
    Alert.alert('Delete this conversation?', 'It is removed from your chats. The other person keeps their copy.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          if (!me) return;
          const { data, error } = await supabase.from('conversation_participants').delete().eq('conversation_id', convId).eq('user_id', me).select('user_id');
          if (error || !data?.length) { Alert.alert("Couldn't delete", error?.message || 'Try again in a moment.'); return; }
          router.dismissAll();
          router.replace('/(tabs)/messages' as any);
        },
      },
    ]);
  };

  const submitReport = async (reason: string, details: string) => {
    if (!me || !report) return;
    const label = report === 'conversation' ? `[conversation ${convId}] ` : '';
    const { error } = await supabase.from('reports').insert({ reporter_id: me, reported_user_id: otherId ? String(otherId) : null, reason, details: (label + (details || '')).trim() || null });
    setReport(null);
    Alert.alert(error ? "Couldn't send" : 'Thanks, we got it', error ? error.message : 'Our team will review this report.');
  };

  const Circle = ({ icon, label, onPress, faded }: { icon: any; label: string; onPress?: () => void; faded?: boolean }) => (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={{ alignItems: 'center', gap: 8, opacity: faded ? 0.45 : 1 }}>
      <View style={[styles.circle, { backgroundColor: colors.card }]}><Ionicons name={icon} size={26} color={colors.text} /></View>
      <Text style={{ color: colors.text, fontSize: 13.5 }}>{label}</Text>
    </TouchableOpacity>
  );

  const Row = ({ icon, label, value, onPress, faded }: { icon: any; label: string; value?: string; onPress?: () => void; faded?: boolean }) => (
    <TouchableOpacity activeOpacity={0.7} disabled={!onPress} onPress={onPress} style={[styles.row, { opacity: faded ? 0.4 : 1 }]}>
      <Ionicons name={icon} size={24} color={colors.text} />
      <Text style={{ color: colors.text, fontSize: 16.5, flex: 1 }}>{label}</Text>
      {value ? <Text style={{ color: colors.subtext, fontSize: 15 }}>{value}</Text> : null}
      <Ionicons name="chevron-forward" size={18} color={colors.faint} />
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={{ paddingTop: 54, paddingHorizontal: 16 }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10}><Ionicons name="arrow-back" size={26} color={colors.text} /></TouchableOpacity>
        </View>
        <View style={{ alignItems: 'center', marginTop: 10 }}>
          <RingAvatar userId={String(otherId)} uri={p?.avatar_url} size={118} noTap />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingHorizontal: 30 }}>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }} numberOfLines={1}>{name}</Text>
            <VerifiedBadge verified={p?.verified} isAuthentic={p?.is_authentic} plan={p?.verified_plan} size={16} />
          </View>
          {p?.username ? <Text style={{ color: colors.subtext, fontSize: 16, marginTop: 2 }}>@{p.username}</Text> : null}
        </View>

        <View style={styles.circles}>
          <Circle icon="call-outline" label="Call" onPress={call} />
          <Circle icon="videocam-outline" label="Video" faded onPress={() => Alert.alert('Video calls', 'Video calls are coming soon.')} />
          <Circle icon="person-outline" label="Profile" onPress={() => router.push(`/user/${otherId}` as any)} />
          <Circle icon="ellipsis-horizontal" label="More" onPress={() => setMoreOpen(true)} />
        </View>

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Row icon="images-outline" label="Media, Links, Docs" onPress={() => router.push({ pathname: '/chat-media/[id]', params: { id: convId } } as any)} />
          <View style={[styles.sep, { backgroundColor: colors.border }]} />
          <Row icon="timer-outline" label="Disappearing messages" value="Off" faded />
          <View style={[styles.sep, { backgroundColor: colors.border }]} />
          <Row icon="color-palette-outline" label="Chat theme" onPress={() => setThemeOpen(true)} />
        </View>
      </ScrollView>

      <ActionSheet
        visible={moreOpen}
        onClose={() => setMoreOpen(false)}
        options={[
          { label: part.muted ? 'Unmute conversation' : 'Mute conversation', icon: part.muted ? 'notifications-outline' : 'notifications-off-outline', onPress: () => setFlag('muted', !part.muted) },
          { label: part.archived ? 'Unarchive' : 'Archive', icon: 'archive-outline', onPress: () => setFlag('archived', !part.archived) },
          { label: 'Report user', icon: 'flag-outline', onPress: () => setTimeout(() => setReport('user'), 250) },
          { label: 'Report conversation', icon: 'alert-circle-outline', onPress: () => setTimeout(() => setReport('conversation'), 250) },
          { label: 'Delete conversation', icon: 'trash-outline', destructive: true, onPress: deleteConversation },
        ]}
      />
      <ReportModal visible={!!report} onClose={() => setReport(null)} onSubmit={submitReport} />
      <ChatThemeSheet
        visible={themeOpen}
        onClose={() => setThemeOpen(false)}
        conversationId={convId}
        theme={theme}
        onChange={(t) => { setTheme(t); saveChatTheme(convId, t); }}
        verified={meVerified}
        onReset={async () => { await clearChatTheme(convId); setTheme(await loadChatTheme(convId)); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  circles: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 22, marginTop: 30 },
  circle: { width: 78, height: 78, borderRadius: 39, alignItems: 'center', justifyContent: 'center' },
  card: { marginHorizontal: 16, marginTop: 30, borderRadius: 20, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 18, paddingVertical: 20 },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 58 },
});
