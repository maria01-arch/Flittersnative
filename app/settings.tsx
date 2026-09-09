import { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import { usePreferences } from '@/lib/PreferencesContext';
import { Switch } from 'react-native';
import VerifiedBadge from '@/components/VerifiedBadge';
import { spacing } from '@/lib/theme';

export default function SettingsScreen() {
  const { session } = useAuth();
  const { colors, mode, setMode } = useTheme();
  const { autoplayVideos, setAutoplayVideos } = usePreferences();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user?.id) return;
    supabase.from('profiles').select('*').eq('id', session.user.id).single().then(({ data }) => {
      setProfile(data);
      setLoading(false);
    });
  }, [session]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
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
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <TouchableOpacity style={styles.profileRow} onPress={() => router.push(`/user/${session?.user?.id}`)}>
        <Image
          source={{ uri: profile?.avatar_url || 'https://placehold.co/120x120/6C5CE7/fff?text=' + (profile?.display_name?.[0] || '?') }}
          style={styles.avatar}
        />
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.name, { color: colors.text }]}>{profile?.display_name || 'No name set'}</Text>
            <VerifiedBadge verified={profile?.verified} isAuthentic={profile?.is_authentic} size={14} />
          </View>
          <Text style={[styles.username, { color: colors.subtext }]}>@{profile?.username || 'unknown'}</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.item, { borderBottomColor: colors.border }]} onPress={() => router.push('/edit-profile')}>
        <Ionicons name="person-outline" size={20} color={colors.text} />
        <Text style={[styles.itemText, { color: colors.text }]}>Edit Profile</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.faint} />
      </TouchableOpacity>

      <View style={[styles.section, { borderBottomColor: colors.border }]}>
        <Text style={[styles.sectionLabel, { color: colors.subtext }]}>Appearance</Text>
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

      <View style={[styles.section, { borderBottomColor: colors.border }]}>
        <View style={styles.switchRow}>
          <View>
            <Text style={[styles.sectionLabel, { color: colors.text, marginBottom: 0 }]}>Autoplay videos</Text>
            <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>Turn off to save data</Text>
          </View>
          <Switch value={autoplayVideos} onValueChange={setAutoplayVideos} trackColor={{ true: colors.primary }} />
        </View>
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingHorizontal: spacing.lg, paddingBottom: 14, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: '700' },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: spacing.lg },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#ddd' },
  name: { fontSize: 17, fontWeight: '700' },
  username: { fontSize: 14, marginTop: 2 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: spacing.lg, borderBottomWidth: 1 },
  itemText: { flex: 1, fontSize: 15 },
  section: { padding: spacing.lg, borderBottomWidth: 1 },
  sectionLabel: { fontSize: 13, fontWeight: '600', marginBottom: 10 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  themeRow: { flexDirection: 'row', gap: 10 },
  themeOption: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  themeOptionText: { fontSize: 14, fontWeight: '600' },
  signOutButton: { margin: spacing.lg, borderWidth: 1, borderColor: '#EF4444', borderRadius: 20, paddingVertical: 12, alignItems: 'center' },
  signOutText: { color: '#EF4444', fontWeight: '700' },
});
