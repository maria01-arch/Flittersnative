import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Switch, Modal, Alert, Pressable, Linking, TextInput } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import { usePreferences, FeedInterest, BrowserEngine } from '@/lib/PreferencesContext';
import { isPushEnabled, setPushEnabled, getNotificationPermission } from '@/lib/usePushNotifications';
import { Permission } from '@/lib/permissions';
import { acceptFollowRequest, declineFollowRequest } from '@/lib/followRequests';
import { getStoredAccounts, switchToAccount, removeStoredAccount } from '@/lib/accounts';
import Avatar from '@/components/Avatar';
import VerifiedBadge from '@/components/VerifiedBadge';
import { spacing } from '@/lib/theme';

type RowDef = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
};

function SettingsRow({ icon, label, onPress, danger, colors, value }: RowDef & { colors: any; value?: string }) {
  return (
    <TouchableOpacity style={[styles.row, { borderBottomColor: colors.border }]} onPress={onPress}>
      <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.text} />
      <Text style={[styles.rowText, { color: danger ? colors.danger : colors.text }]}>{label}</Text>
      {value ? <Text style={{ color: colors.faint, fontSize: 13, marginRight: 6 }}>{value}</Text> : null}
      {!danger && <Ionicons name="chevron-forward" size={18} color={colors.faint} />}
    </TouchableOpacity>
  );
}

// A 2-3 option segmented picker, used for every "who can X" setting. Shared
// here rather than duplicated per setting since they're all the same shape.
function PermissionPicker({
  colors,
  value,
  onChange,
  options,
}: {
  colors: any;
  value: string;
  onChange: (v: any) => void;
  options: { key: string; label: string }[];
}) {
  return (
    <View style={styles.themeRow}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.key}
          style={[styles.themeOption, { borderColor: colors.border }, value === opt.key && { backgroundColor: colors.primary, borderColor: colors.primary }]}
          onPress={() => onChange(opt.key)}
        >
          <Text style={[styles.themeOptionText, { color: colors.text }, value === opt.key && { color: '#fff' }]}>{opt.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function SettingsScreen() {
  const { session } = useAuth();
  const { colors, mode, setMode } = useTheme();
  const {
    autoplayVideos,
    setAutoplayVideos,
    showReposts,
    setShowReposts,
    dataSaverMode,
    setDataSaverMode,
    feedInterest,
    setFeedInterest,
    showLinkPreviews,
    setShowLinkPreviews,
    browserEngine,
    setBrowserEngine,
  } = usePreferences();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [contentOpen, setContentOpen] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [pushOn, setPushOn] = useState(true);
  const [permStatus, setPermStatus] = useState<string>('undetermined');
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [moderationOpen, setModerationOpen] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [followRequests, setFollowRequests] = useState<any[]>([]);
  const [loginHistory, setLoginHistory] = useState<any[]>([]);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Every "who can X" setting and the private-account toggle live directly
  // on the profiles row — other people's screens read them (see
  // lib/permissions.ts and app/user/[id].tsx), so they have to be
  // server-side, not a local AsyncStorage preference like the rest of
  // Settings.
  const updateProfileField = async (field: string, value: any) => {
    if (!session?.user?.id) return;
    setProfile((p: any) => ({ ...p, [field]: value }));
    const { error } = await supabase.from('profiles').update({ [field]: value }).eq('id', session.user.id);
    if (error) console.error(`[Settings] failed to update ${field}:`, error.message, error);
  };

  useEffect(() => {
    if ((!requestsOpen && !privacyOpen) || !session?.user?.id) return;
    (async () => {
      const { data: reqRows } = await supabase.from('follow_requests').select('requester_id,created_at').eq('target_id', session.user.id);
      const ids = (reqRows || []).map((r: any) => r.requester_id);
      if (!ids.length) {
        setFollowRequests([]);
        return;
      }
      const { data: profiles } = await supabase.from('profiles').select('*').in('id', ids);
      setFollowRequests((profiles || []).map((p: any) => ({ ...p, requestedAt: reqRows?.find((r: any) => r.requester_id === p.id)?.created_at })));
    })();
  }, [requestsOpen, privacyOpen, session]);

  const respondToRequest = async (requesterId: string, accept: boolean) => {
    if (!session?.user?.id) return;
    setFollowRequests((prev) => prev.filter((r) => r.id !== requesterId));
    if (accept) await acceptFollowRequest(requesterId, session.user.id);
    else await declineFollowRequest(requesterId, session.user.id);
  };

  useEffect(() => {
    if (!sessionsOpen || !session?.user?.id) return;
    supabase
      .from('login_history')
      .select('platform,city,region,created_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setLoginHistory(data || []));
  }, [sessionsOpen, session]);

  const submitPasswordChange = async () => {
    if (newPassword.length < 6) {
      Alert.alert('Too short', 'Your new password needs to be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Passwords don't match", 'Make sure both fields match.');
      return;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setChangingPassword(false);
    if (error) {
      Alert.alert("Couldn't change password", error.message);
      return;
    }
    setNewPassword('');
    setConfirmPassword('');
    setPasswordOpen(false);
    Alert.alert('Password changed', 'Your password has been updated.');
  };

  useEffect(() => {
    isPushEnabled().then(setPushOn);
  }, []);

  useEffect(() => {
    if (!notifOpen) return;
    getNotificationPermission().then(setPermStatus);
  }, [notifOpen]);

  const togglePush = async (value: boolean) => {
    setPushOn(value);
    await setPushEnabled(session?.user?.id, value);
    getNotificationPermission().then(setPermStatus);
  };

  useEffect(() => {
    if (!session?.user?.id) return;
    supabase.from('profiles').select('*').eq('id', session.user.id).single().then(({ data }) => {
      setProfile(data);
      setLoading(false);
    });
  }, [session]);

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          const currentId = session?.user?.id;
          if (currentId) await removeStoredAccount(currentId);
          // If another account is still saved on this device, hand off
          // to it instead of dropping all the way back to logged-out —
          // "sign out of this one" shouldn't mean "sign out of
          // everything" when there's somewhere else to land.
          const remaining = await getStoredAccounts();
          if (remaining.length > 0) {
            const { error } = await switchToAccount(remaining[0].userId);
            if (!error) {
              router.replace('/(tabs)');
              return;
            }
          }
          await supabase.auth.signOut();
        },
      },
    ]);
  };

  const comingSoon = (feature: string) => Alert.alert(feature, "This isn't available yet — coming in a future update.");

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView>
        <TouchableOpacity style={styles.profileRow} onPress={() => router.push(`/user/${session?.user?.id}`)}>
          <Avatar uri={profile?.avatar_url} size={56} />
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[styles.name, { color: colors.text }]}>{profile?.display_name || 'No name set'}</Text>
              <VerifiedBadge verified={profile?.verified} isAuthentic={profile?.is_authentic} size={14} />
            </View>
            <Text style={[styles.username, { color: colors.subtext }]}>@{profile?.username || 'unknown'}</Text>
          </View>
        </TouchableOpacity>

        <View style={{ marginTop: spacing.md }}>
          <SettingsRow colors={colors} icon="person-outline" label="Account" onPress={() => router.push('/edit-profile')} />
          <SettingsRow colors={colors} icon="lock-closed-outline" label="Privacy and security" onPress={() => setPrivacyOpen(true)} />
          <SettingsRow colors={colors} icon="shield-outline" label="Moderation and content filters" onPress={() => setModerationOpen(true)} />
          <SettingsRow colors={colors} icon="notifications-outline" label="Notifications" onPress={() => setNotifOpen(true)} />
          <SettingsRow colors={colors} icon="image-outline" label="Content and media" onPress={() => setContentOpen(true)} />
          <SettingsRow colors={colors} icon="color-palette-outline" label="Appearance" onPress={() => setAppearanceOpen(true)} />
          <SettingsRow colors={colors} icon="link-outline" label="Links and Preview" onPress={() => setLinksOpen(true)} />
          <SettingsRow colors={colors} icon="language-outline" label="Languages" onPress={() => comingSoon('Languages')} />
          <SettingsRow colors={colors} icon="flask-outline" label="Beta features" onPress={() => comingSoon('Beta features')} />
          <SettingsRow colors={colors} icon="help-circle-outline" label="Help" onPress={() => comingSoon('Help')} />
          <SettingsRow colors={colors} icon="information-circle-outline" label="About" onPress={() => setAboutOpen(true)} />
          <SettingsRow colors={colors} icon="swap-horizontal-outline" label="Switch account" onPress={() => router.push('/switch-account')} />
          <SettingsRow colors={colors} icon="log-out-outline" label="Sign Out" onPress={handleSignOut} danger />
        </View>
      </ScrollView>

      {/* Appearance — full-screen theme + autoplay controls, since those
          are the two settings that actually do something right now. */}
      <Modal visible={appearanceOpen} animationType="slide" onRequestClose={() => setAppearanceOpen(false)}>
        <View style={[styles.container, { backgroundColor: colors.bg }]}>
          <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setAppearanceOpen(false)}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.text }]}>Appearance</Text>
            <View style={{ width: 24 }} />
          </View>
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.subtext }]}>Theme</Text>
            <View style={styles.themeRow}>
              {(['light', 'dark', 'system'] as const).map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.themeOption, { borderColor: colors.border }, mode === m && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                  onPress={() => setMode(m)}
                >
                  <Text style={[styles.themeOptionText, { color: colors.text }, mode === m && { color: '#fff' }]}>
                    {m === 'light' ? 'Light' : m === 'dark' ? 'Dark' : 'System'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* Content and media — autoplay toggle */}
      <Modal visible={contentOpen} animationType="slide" onRequestClose={() => setContentOpen(false)}>
        <View style={[styles.container, { backgroundColor: colors.bg }]}>
          <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setContentOpen(false)}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.text }]}>Content and media</Text>
            <View style={{ width: 24 }} />
          </View>
          <View style={styles.section}>
            <View style={styles.switchRow}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[styles.sectionLabel, { color: colors.text, marginBottom: 0 }]}>Autoplay videos</Text>
                <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>Turn off to save data</Text>
              </View>
              <Switch value={autoplayVideos} onValueChange={setAutoplayVideos} trackColor={{ true: colors.primary }} />
            </View>

            <View style={[styles.switchRow, { marginTop: 22 }]}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[styles.sectionLabel, { color: colors.text, marginBottom: 0 }]}>Show reposts</Text>
                <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>Include reposts from people you follow in your feed</Text>
              </View>
              <Switch value={showReposts} onValueChange={setShowReposts} trackColor={{ true: colors.primary }} />
            </View>

            <View style={[styles.switchRow, { marginTop: 22 }]}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[styles.sectionLabel, { color: colors.text, marginBottom: 0 }]}>Data saver mode</Text>
                <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>
                  {dataSaverMode
                    ? 'Only the video you\u2019re watching loads at a time. Uses less data.'
                    : 'Nearby videos preload ahead of time for a faster feel. Uses more data.'}
                </Text>
              </View>
              <Switch value={dataSaverMode} onValueChange={setDataSaverMode} trackColor={{ true: colors.primary }} />
            </View>

            <Text style={[styles.sectionLabel, { color: colors.subtext, marginTop: 26 }]}>Feed interest</Text>
            <View style={styles.themeRow}>
              {(
                [
                  { key: 'foryou' as FeedInterest, label: 'For You' },
                  { key: 'following' as FeedInterest, label: 'Following' },
                ]
              ).map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.themeOption, { borderColor: colors.border }, feedInterest === opt.key && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                  onPress={() => setFeedInterest(opt.key)}
                >
                  <Text style={[styles.themeOptionText, { color: colors.text }, feedInterest === opt.key && { color: '#fff' }]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 8 }}>
              {feedInterest === 'following' ? 'Your home feed only shows posts from people you follow.' : 'Your home feed shows everyone, newest first.'}
            </Text>
          </View>
        </View>
      </Modal>

      {/* Links and Preview — was "Accessibility", which never had anything
          in it. Link previews and the browser engine both affect how a
          tapped link behaves, so they live together here. */}
      <Modal visible={linksOpen} animationType="slide" onRequestClose={() => setLinksOpen(false)}>
        <View style={[styles.container, { backgroundColor: colors.bg }]}>
          <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setLinksOpen(false)}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.text }]}>Links and Preview</Text>
            <View style={{ width: 24 }} />
          </View>
          <View style={styles.section}>
            <View style={styles.switchRow}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[styles.sectionLabel, { color: colors.text, marginBottom: 0 }]}>Link previews</Text>
                <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>Show a preview card for links in posts</Text>
              </View>
              <Switch value={showLinkPreviews} onValueChange={setShowLinkPreviews} trackColor={{ true: colors.primary }} />
            </View>

            <Text style={[styles.sectionLabel, { color: colors.subtext, marginTop: 26 }]}>Open links in</Text>
            <View style={styles.themeRow}>
              {(
                [
                  { key: 'in-app' as BrowserEngine, label: 'In-app browser' },
                  { key: 'external' as BrowserEngine, label: 'External browser' },
                ]
              ).map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.themeOption, { borderColor: colors.border }, browserEngine === opt.key && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                  onPress={() => setBrowserEngine(opt.key)}
                >
                  <Text style={[styles.themeOptionText, { color: colors.text }, browserEngine === opt.key && { color: '#fff' }]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 8 }}>
              {browserEngine === 'external' ? "Links open in your phone's default browser." : 'Links open in a browser view inside Flitters, without leaving the app.'}
            </Text>
          </View>
        </View>
      </Modal>

      {/* About — used to be a one-line version alert with nowhere to find
          the legal docs. */}
      <Modal visible={aboutOpen} animationType="slide" onRequestClose={() => setAboutOpen(false)}>
        <View style={[styles.container, { backgroundColor: colors.bg }]}>
          <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setAboutOpen(false)}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.text }]}>About</Text>
            <View style={{ width: 24 }} />
          </View>
          <View style={{ marginTop: spacing.md }}>
            <SettingsRow
              colors={colors}
              icon="document-text-outline"
              label="Terms of Service"
              onPress={() => {
                setAboutOpen(false);
                router.push('/legal/terms');
              }}
            />
            <SettingsRow
              colors={colors}
              icon="shield-checkmark-outline"
              label="Privacy Policy"
              onPress={() => {
                setAboutOpen(false);
                router.push('/legal/privacy');
              }}
            />
            <SettingsRow
              colors={colors}
              icon="heart-outline"
              label="Child's Policy"
              onPress={() => {
                setAboutOpen(false);
                router.push('/legal/child-safety');
              }}
            />
          </View>
          <Text style={{ color: colors.faint, fontSize: 12, textAlign: 'center', marginTop: 24 }}>Flitters — Version 1.0.0</Text>
        </View>
      </Modal>

      {/* Notifications — this used to just say "coming soon" even though
          push was already working under the hood; this is the actual
          control for it (see lib/usePushNotifications.ts). */}
      <Modal visible={notifOpen} animationType="slide" onRequestClose={() => setNotifOpen(false)}>
        <View style={[styles.container, { backgroundColor: colors.bg }]}>
          <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setNotifOpen(false)}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.text }]}>Notifications</Text>
            <View style={{ width: 24 }} />
          </View>
          <View style={styles.section}>
            <View style={styles.switchRow}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[styles.sectionLabel, { color: colors.text, marginBottom: 0 }]}>Push notifications</Text>
                <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>Likes, comments, follows and messages</Text>
              </View>
              <Switch value={pushOn} onValueChange={togglePush} trackColor={{ true: colors.primary }} />
            </View>
            {permStatus === 'denied' && (
              <TouchableOpacity style={{ marginTop: 18 }} onPress={() => Linking.openSettings()}>
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>
                  Notifications are blocked in your phone's Settings — tap here to open Settings
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Privacy and security */}
      <Modal visible={privacyOpen} animationType="slide" onRequestClose={() => setPrivacyOpen(false)}>
        <View style={[styles.container, { backgroundColor: colors.bg }]}>
          <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setPrivacyOpen(false)}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.text }]}>Privacy and security</Text>
            <View style={{ width: 24 }} />
          </View>
          <ScrollView>
            <View style={styles.section}>
              <View style={styles.switchRow}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={[styles.sectionLabel, { color: colors.text, marginBottom: 0 }]}>Private account</Text>
                  <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>
                    Only people you approve can see your posts, reposts, and videos. New followers need your approval.
                  </Text>
                </View>
                <Switch value={!!profile?.is_private} onValueChange={(v) => updateProfileField('is_private', v)} trackColor={{ true: colors.primary }} />
              </View>

              <Text style={[styles.sectionLabel, { color: colors.subtext, marginTop: 26 }]}>Who can message me</Text>
              <PermissionPicker
                colors={colors}
                value={profile?.who_can_message || 'everyone'}
                onChange={(v: Permission) => updateProfileField('who_can_message', v)}
                options={[
                  { key: 'everyone', label: 'Everyone' },
                  { key: 'following', label: 'People I follow' },
                  { key: 'nobody', label: 'No one' },
                ]}
              />

              <Text style={[styles.sectionLabel, { color: colors.subtext, marginTop: 26 }]}>Who can see who I follow</Text>
              <PermissionPicker
                colors={colors}
                value={profile?.who_can_see_following || 'everyone'}
                onChange={(v: 'everyone' | 'nobody') => updateProfileField('who_can_see_following', v)}
                options={[
                  { key: 'everyone', label: 'Everyone' },
                  { key: 'nobody', label: 'Only me' },
                ]}
              />
            </View>

            <View style={{ marginTop: spacing.md }}>
              <SettingsRow
                colors={colors}
                icon="person-add-outline"
                label="Follow requests"
                value={followRequests.length ? String(followRequests.length) : undefined}
                onPress={() => setRequestsOpen(true)}
              />
              <SettingsRow colors={colors} icon="key-outline" label="Change password" onPress={() => setPasswordOpen(true)} />
              <SettingsRow colors={colors} icon="time-outline" label="Where you've logged in" onPress={() => setSessionsOpen(true)} />
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Follow requests — only relevant once Private account is on, but
          always reachable so a pending request never gets stranded if the
          setting is switched off again after requests came in. */}
      <Modal visible={requestsOpen} animationType="slide" onRequestClose={() => setRequestsOpen(false)}>
        <View style={[styles.container, { backgroundColor: colors.bg }]}>
          <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setRequestsOpen(false)}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.text }]}>Follow requests</Text>
            <View style={{ width: 24 }} />
          </View>
          <ScrollView>
            {followRequests.length === 0 && (
              <Text style={{ color: colors.subtext, textAlign: 'center', marginTop: 40 }}>No pending follow requests.</Text>
            )}
            {followRequests.map((r) => (
              <View key={r.id} style={[styles.row, { borderBottomColor: colors.border }]}>
                <Avatar uri={r.avatar_url} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowText, { color: colors.text, fontWeight: '700' }]}>{r.display_name}</Text>
                  <Text style={{ color: colors.subtext, fontSize: 13 }}>@{r.username}</Text>
                </View>
                <TouchableOpacity
                  style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8 }}
                  onPress={() => respondToRequest(r.id, true)}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}
                  onPress={() => respondToRequest(r.id, false)}
                >
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>Decline</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* Change password */}
      <Modal visible={passwordOpen} animationType="slide" onRequestClose={() => setPasswordOpen(false)}>
        <View style={[styles.container, { backgroundColor: colors.bg }]}>
          <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setPasswordOpen(false)}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.text }]}>Change password</Text>
            <View style={{ width: 24 }} />
          </View>
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.subtext }]}>New password</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
              value={newPassword}
              // Same lowercase-only rule as login/signup — a password set
              // here has to be typeable back at login, so it can't accept
              // characters login itself won't.
              onChangeText={(t) => setNewPassword(t.toLowerCase())}
              placeholder="At least 6 characters"
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
              secureTextEntry
            />
            <Text style={[styles.sectionLabel, { color: colors.subtext, marginTop: 18 }]}>Confirm new password</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.text }]}
              value={confirmPassword}
              onChangeText={(t) => setConfirmPassword(t.toLowerCase())}
              placeholder="Re-enter your new password"
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
              secureTextEntry
            />
            <TouchableOpacity
              style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 24 }}
              onPress={submitPasswordChange}
              disabled={changingPassword}
            >
              {changingPassword ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Update password</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Where you've logged in — an honest sign-in log, not a remote
          session manager. We only have the Supabase client SDK to work
          with here, and listing or revoking another device's actual auth
          session needs the service-role key, which can never live in a
          client app. Changing your password (above) is what actually
          invalidates other sessions. */}
      <Modal visible={sessionsOpen} animationType="slide" onRequestClose={() => setSessionsOpen(false)}>
        <View style={[styles.container, { backgroundColor: colors.bg }]}>
          <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setSessionsOpen(false)}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.text }]}>Where you've logged in</Text>
            <View style={{ width: 24 }} />
          </View>
          <Text style={{ color: colors.subtext, fontSize: 12, paddingHorizontal: spacing.lg, paddingTop: 14 }}>
            A log of sign-ins to your account. Don't recognize one? Change your password above — it signs every other device out.
          </Text>
          <ScrollView style={{ marginTop: 10 }}>
            {loginHistory.length === 0 && <Text style={{ color: colors.subtext, textAlign: 'center', marginTop: 30 }}>Nothing logged yet.</Text>}
            {loginHistory.map((row, i) => (
              <View key={i} style={[styles.row, { borderBottomColor: colors.border }]}>
                <Ionicons name={row.platform === 'ios' ? 'logo-apple' : 'logo-android'} size={20} color={colors.text} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowText, { color: colors.text }]}>
                    {row.platform === 'ios' ? 'iOS device' : 'Android device'}
                    {row.city ? ` · ${row.city}${row.region ? ', ' + row.region : ''}` : ''}
                  </Text>
                  <Text style={{ color: colors.subtext, fontSize: 12 }}>{new Date(row.created_at).toLocaleString()}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* Moderation and content filters */}
      <Modal visible={moderationOpen} animationType="slide" onRequestClose={() => setModerationOpen(false)}>
        <View style={[styles.container, { backgroundColor: colors.bg }]}>
          <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setModerationOpen(false)}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.text }]}>Moderation and content filters</Text>
            <View style={{ width: 24 }} />
          </View>
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.subtext }]}>Who can comment on my posts</Text>
            <PermissionPicker
              colors={colors}
              value={profile?.who_can_comment || 'everyone'}
              onChange={(v: Permission) => updateProfileField('who_can_comment', v)}
              options={[
                { key: 'everyone', label: 'Everyone' },
                { key: 'following', label: 'People I follow' },
                { key: 'nobody', label: 'No one' },
              ]}
            />

            <Text style={[styles.sectionLabel, { color: colors.subtext, marginTop: 26 }]}>Who can repost my posts</Text>
            <PermissionPicker
              colors={colors}
              value={profile?.who_can_repost || 'everyone'}
              onChange={(v: Permission) => updateProfileField('who_can_repost', v)}
              options={[
                { key: 'everyone', label: 'Everyone' },
                { key: 'following', label: 'People I follow' },
                { key: 'nobody', label: 'No one' },
              ]}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingHorizontal: spacing.lg, paddingBottom: 14, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: '700' },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: spacing.lg },
  name: { fontSize: 17, fontWeight: '700' },
  username: { fontSize: 14, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, paddingHorizontal: spacing.lg, borderBottomWidth: 1 },
  rowText: { flex: 1, fontSize: 15 },
  section: { padding: spacing.lg },
  sectionLabel: { fontSize: 13, fontWeight: '600', marginBottom: 10 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  themeRow: { flexDirection: 'row', gap: 10 },
  themeOption: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  themeOptionText: { fontSize: 14, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15, marginTop: 8 },
});
