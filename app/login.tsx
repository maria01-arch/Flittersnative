import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
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

  // Whatever way this screen closes (success, back button), adding-account
  // mode ends with it — otherwise the root layout would keep letting a
  // signed-in person sit on the login screen forever.
  useEffect(() => () => setAddingAccountMode(false), []);

  const handleSubmit = async () => {
    setError('');
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
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      if (isAddingAccount) {
        // Drop the switcher/login screens off the stack so back doesn't
        // land on them, then show the new account's feed.
        router.dismissAll();
        router.replace('/(tabs)');
      }
    } catch (e: any) {
      setError(e.message || 'Something went wrong');
    }
    setLoading(false);
  };

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
          // Passwords are strictly lowercase, same rule as signup — typing
          // an uppercase letter here just gets folded down automatically
          // rather than silently creating a password that doesn't match
          // what the person thinks they set.
          onChangeText={(t) => setPassword(t.toLowerCase())}
        />
        <TouchableOpacity onPress={() => setShowPassword((v) => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.faint} />
        </TouchableOpacity>
      </View>

      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

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
});
