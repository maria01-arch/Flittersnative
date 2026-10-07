import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, FlatList } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import { spacing } from '@/lib/theme';
import Avatar from '@/components/Avatar';
import { getStoredAccounts, switchToAccount, removeStoredAccount, persistCurrentSession, setAddingAccountMode, StoredAccount } from '@/lib/accounts';

export default function SwitchAccountScreen() {
  const { colors } = useTheme();
  const { session } = useAuth();
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const load = useCallback(() => {
    // Make sure whoever is signed in right now is in the list too (with a
    // name and avatar), even if they signed in before account switching
    // existed and were never saved.
    persistCurrentSession()
      .catch(() => {})
      .then(() => getStoredAccounts())
      .then((list) => {
        setAccounts(list);
        setLoading(false);
      });
  }, []);

  // Refetch every time this screen comes into focus, not just on mount —
  // the list changes whenever an account gets added, removed, or its
  // cached profile info updates elsewhere.
  useFocusEffect(load);

  const handleSwitch = async (account: StoredAccount) => {
    if (account.userId === session?.user?.id || switchingId) return;
    setSwitchingId(account.userId);
    const { error } = await switchToAccount(account.userId);
    setSwitchingId(null);
    if (error) {
      Alert.alert("Couldn't switch accounts", error);
      load();
      return;
    }
    router.dismissAll();
    router.replace('/(tabs)');
  };

  const handleRemove = (account: StoredAccount) => {
    Alert.alert('Remove this account?', `This only removes ${account.displayName || account.email} from this device's switcher — it doesn't delete the account itself.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const wasActive = account.userId === session?.user?.id;
          await removeStoredAccount(account.userId);
          if (!wasActive) {
            load();
            return;
          }
          // Removed the account you're currently signed into: fall back
          // to another saved account if one exists, otherwise there's
          // nothing left to be signed into at all.
          const remaining = await getStoredAccounts();
          if (remaining.length > 0) {
            const { error } = await switchToAccount(remaining[0].userId);
            if (!error) {
              router.dismissAll();
              router.replace('/(tabs)');
              return;
            }
          }
          await supabase.auth.signOut();
          router.replace('/landing');
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Switch account</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={accounts}
          keyExtractor={(item) => item.userId}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item }) => {
            const isActive = item.userId === session?.user?.id;
            return (
              <TouchableOpacity
                style={[styles.row, { borderBottomColor: colors.border }]}
                onPress={() => handleSwitch(item)}
                disabled={!!switchingId}
              >
                <Avatar uri={item.avatarUrl} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                    {item.displayName || item.email || 'Account'}
                  </Text>
                  <Text style={{ color: colors.subtext, fontSize: 13 }} numberOfLines={1}>
                    {item.username ? `@${item.username}` : item.email}
                  </Text>
                </View>
                {switchingId === item.userId ? (
                  <ActivityIndicator color={colors.primary} />
                ) : isActive ? (
                  <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                ) : null}
                <TouchableOpacity onPress={() => handleRemove(item)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ marginLeft: 4 }}>
                  <Ionicons name="close" size={18} color={colors.faint} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<Text style={[styles.empty, { color: colors.subtext }]}>No saved accounts yet.</Text>}
        />
      )}

      <TouchableOpacity style={[styles.addRow, { borderTopColor: colors.border }]} onPress={() => {
          setAddingAccountMode(true);
          router.push('/login?addingAccount=1');
        }}>
        <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
        <Text style={[styles.addText, { color: colors.primary }]}>Add another account</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 56, paddingHorizontal: spacing.lg, paddingBottom: 14, borderBottomWidth: 1 },
  title: { fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: spacing.md, paddingHorizontal: spacing.lg, borderBottomWidth: 1 },
  name: { fontWeight: '700', fontSize: 15 },
  empty: { textAlign: 'center', marginTop: 40 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: spacing.lg, borderTopWidth: 1 },
  addText: { fontWeight: '700', fontSize: 15 },
});
