import { useEffect, useState } from 'react';
import { isNetworkError } from '@/lib/netError';
import { fetchBanInfo, takePendingBan, BanInfo } from '@/lib/banInfo';
import BannedView from '@/components/BannedView';
import { router, useLocalSearchParams } from 'expo-router';
import { View, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import Text from '@/components/AppText';
import Ionicons from '@expo/vector-icons/Ionicons';
import { supabase } from '@/lib/supabase';
import { spacing } from '@/lib/theme';
import { useTheme } from '@/lib/ThemeContext';
import { persistCurrentSession, setAddingAccountMode } from '@/lib/accounts';

// This used to have its own inline "sign up" mode (a bare
// username/email/password form, toggled in place instead of navigating
// anywhere) that duplicated — poorly — what the real signup wizard at
// /signup already does properly, and its submit path didn't actually work.
// "Don't have an account?" now just takes you to that real wizard, the
// same way landing.tsx's own "Create Account" button already does.
export default function LoginScreen() {
  const { colors } = useTheme();
  const { addingAccount } = useLocalSearchParams<{ addingAccount?: string }>();
  const isAddingAccount = addingAccount === '1';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [netFail, setNetFail] = useState(false);
  const [ban, setBan] = useState<BanInfo | null>(null);

  // Whatever way this screen closes (success, back button), adding-account
  // mode ends with it — otherwise the root layout would keep letting a
  // signed-in person sit on the login screen forever.
  useEffect(() => () => setAddingAccountMode(false), []);

  // Just signed out because of a ban: show the ban page at once.
  useEffect(() => {
    const p = takePendingBan();
    if (p) {
      setEmail(p.email);
      setBan(p.info);
    }
  }, []);

  const handleSubmit = async () => {
    setError('');
    setNetFail(false);
    if (!email.trim() || !password.trim()) {
      setError('Email and password required');
      return;
    }
    setLoading(true);
    try {
      // Adding a second (or third...) account: whatever's currently
      // signed in has to be saved to the switcher BEFORE this call, since
      // the moment sign-in succeeds, the client's one active session
      // becomes this new account — there's no getting the old one's
      // tokens back after that point.
      if (isAddingAccount) await persistCurrentSession();
      // On a very slow connection the request can hang for minutes: give up
      // after 30 seconds with the "try again" message instead of spinning forever.
      const { error } = await Promise.race([
        supabase.auth.signInWithPassword({ email: email.trim(), password }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Request timed out')), 30000)),
      ]);
      if (error) throw error;
      if (isAddingAccount) {
        // Drop the switcher/login screens off the stack so back doesn't
        // land on them, then show the new account's feed.
        router.dismissAll();
        router.replace('/(tabs)');
      }
    } catch (e: any) {
      if (/banned/i.test(String(e?.message || ''))) {
        // A banned account: show why, for how long, and the appeal.
        const info = await fetchBanInfo(email, password);
        if (info?.banned) {
          setBan(info);
        } else {
          setError('This account has been suspended.');
        }
      } else if (isNetworkError(e)) {
        setNetFail(true);
        setError("No connection. Check your internet and try again.");
      } else {
        setError(e.message || 'Something went wrong');
      }
    }
    setLoading(false);
  };

  if (ban) {
    return (
      <BannedView
        email={email}
        password={password}
        info={ban}
        onInfo={setBan}
        onBack={() => setBan(null)}
        onLifted={() => {
          setBan(null);
          if (password) handleSubmit();
          else setError('Your suspension was lifted. Log in to continue.');
        }}
      />
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.container, { backgroundColor: colors.bg }]}>
      <Text style={[styles.logo, { color: colors.primary }]}>Flitters</Text>
      <Text style={[styles.subtitle, { color: colors.subtext }]}>{isAddingAccount ? 'Log in to another account' : 'Welcome back'}</Text>

      <TextInput
        style={[styles.input, { borderColor: colors.border, color: colors.text }]}
        placeholder="Email"
        placeholderTextColor={colors.faint}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <View style={[styles.passwordRow, { borderColor: colors.border }]}>
        <TextInput
          style={[styles.passwordInput, { color: colors.text }]}
          placeholder="Password"
          placeholderTextColor={colors.faint}
          autoCapitalize="none"
          secureTextEntry={!showPassword}
          value={password}
          onChangeText={setPassword}
        />
        <TouchableOpacity onPress={() => setShowPassword((v) => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.faint} />
        </TouchableOpacity>
      </View>

      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      {netFail ? (
        <TouchableOpacity onPress={handleSubmit} disabled={loading} style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <Ionicons name="refresh" size={16} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: '700' }}>Try again</Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity onPress={() => router.push('/forgot-password')} style={styles.forgot} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={{ color: colors.primary, fontWeight: '600' }}>Forgot password?</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, { backgroundColor: colors.primary }]} onPress={handleSubmit} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Log In</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push(isAddingAccount ? '/signup?addingAccount=1' : '/signup')}>
        <Text style={[styles.switchText, { color: colors.primary }]}>Don't have an account? Sign up</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: spacing.xl },
  logo: { fontSize: 34, fontWeight: '800', textAlign: 'center', marginBottom: 8, letterSpacing: -0.5 },
  subtitle: { fontSize: 16, textAlign: 'center', marginBottom: 32 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 12 },
  passwordRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, marginBottom: 12 },
  passwordInput: { flex: 1, paddingVertical: 14, fontSize: 16 },
  button: { borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  switchText: { textAlign: 'center', marginTop: 20, fontWeight: '600' },
  error: { marginBottom: 12, textAlign: 'center' },
  forgot: { alignSelf: 'flex-end', marginBottom: 4 },
});
