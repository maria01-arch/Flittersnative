import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Switch, Modal, Alert, Pressable } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import { usePreferences } from '@/lib/PreferencesContext';
import Avatar from '@/components/Avatar';
import VerifiedBadge from '@/components/VerifiedBadge';
import { spacing } from '@/lib/theme';

type RowDef = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
};

function SettingsRow({ icon, label, onPress, danger, colors }: RowDef & { colors: any }) {
  return (
    <TouchableOpacity style={[styles.row, { borderBottomColor: colors.border }]} onPress={onPress}>
      <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.text} />
      <Text style={[styles.rowText, { color: danger ? colors.danger : colors.text }]}>{label}</Text>
      {!danger && <Ionicons name="chevron-forward" size={18} color={colors.faint} />}
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const { session } = useAuth();
  const { colors, mode, setMode } = useTheme();
  const { autoplayVideos, setAutoplayVideos } = usePreferences();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [contentOpen, setContentOpen] = useState(false);

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
      { text: 'Sign Out', style: 'destructive', onPress: () => supabase.auth.signOut() },
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
          <SettingsRow colors={colors} icon="lock-closed-outline" label="Privacy and security" onPress={() => comingSoon('Privacy and security')} />
          <SettingsRow colors={colors} icon="shield-outline" label="Moderation and content filters" onPress={() => comingSoon('Moderation and content filters')} />
          <SettingsRow colors={colors} icon="notifications-outline" label="Notifications" onPress={() => comingSoon('Notifications')} />
          <SettingsRow colors={colors} icon="image-outline" label="Content and media" onPress={() => setContentOpen(true)} />
          <SettingsRow colors={colors} icon="color-palette-outline" label="Appearance" onPress={() => setAppearanceOpen(true)} />
          <SettingsRow colors={colors} icon="accessibility-outline" label="Accessibility" onPress={() => comingSoon('Accessibility')} />
          <SettingsRow colors={colors} icon="language-outline" label="Languages" onPress={() => comingSoon('Languages')} />
          <SettingsRow colors={colors} icon="flask-outline" label="Beta features" onPress={() => comingSoon('Beta features')} />
          <SettingsRow colors={colors} icon="help-circle-outline" label="Help" onPress={() => comingSoon('Help')} />
          <SettingsRow colors={colors} icon="information-circle-outline" label="About" onPress={() => Alert.alert('Flitters', 'Version 1.0.0')} />
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
});
