import { useEffect, useState } from 'react';
import { View, ActivityIndicator, TouchableOpacity } from 'react-native';
import Text from '@/components/AppText';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/ThemeContext';

// Opened when someone taps an @mention: finds the profile by username and
// forwards to it.
export default function UserByUsername() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { colors } = useTheme();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    (async () => {
      const name = String(username || '').toLowerCase();
      const { data } = await supabase.from('profiles').select('id').eq('username', name).maybeSingle();
      if (data?.id) router.replace(`/user/${data.id}`);
      else setMissing(true);
    })();
  }, [username]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      {missing ? (
        <>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 6 }}>No one named @{username}</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: colors.primary, fontWeight: '700' }}>Go back</Text>
          </TouchableOpacity>
        </>
      ) : (
        <ActivityIndicator color={colors.primary} />
      )}
    </View>
  );
}
